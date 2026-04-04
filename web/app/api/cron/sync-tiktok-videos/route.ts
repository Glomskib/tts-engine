import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getTikTokContentClient } from '@/lib/tiktok-content';
import { detectWinner, type VideoStats } from '@/lib/winner-detection';
import { checkAndSendFailureAlert } from '@/lib/ops/failure-alert';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * GET /api/cron/sync-tiktok-videos
 * Daily cron: syncs all videos from connected TikTok accounts.
 * For each account with video.list scope:
 *   1. Fetch all videos via TikTok API
 *   2. Upsert into tiktok_videos table
 *   3. Queue new/unanalyzed videos for AI analysis
 *   4. Auto-match to brands/products by hashtags
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const client = getTikTokContentClient();
  let totalSynced = 0;
  let totalNew = 0;
  let totalWinners = 0;
  const errors: string[] = [];

  try {
    // Fetch all TikTok accounts that have been connected
    // Only process accounts where we have a valid access token
    const { data: accounts, error: accErr } = await supabaseAdmin
      .from('tiktok_accounts')
      .select('id, user_id, access_token, refresh_token, token_expires_at, handle')
      .not('access_token', 'is', null);

    if (accErr || !accounts) {
      console.error('[sync-tiktok-videos] Failed to fetch accounts:', accErr);
      return NextResponse.json({ error: 'Failed to fetch accounts' }, { status: 500 });
    }

    console.log(`[sync-tiktok-videos] Processing ${accounts.length} accounts`);

    for (const account of accounts) {
      try {
        // Check if token needs refresh
        let accessToken = account.access_token;
        const expiresAt = account.token_expires_at ? new Date(account.token_expires_at) : null;

        if (expiresAt && expiresAt.getTime() < Date.now() + 300000) {
          // Token expires in <5 min, try refresh
          try {
            const refreshed = await client.refreshToken(account.refresh_token);
            accessToken = refreshed.access_token;

            await supabaseAdmin
              .from('tiktok_accounts')
              .update({
                access_token: refreshed.access_token,
                refresh_token: refreshed.refresh_token || account.refresh_token,
                token_expires_at: new Date(Date.now() + (refreshed.expires_in || 86400) * 1000).toISOString(),
              })
              .eq('id', account.id);
          } catch (refreshErr) {
            console.warn(`[sync-tiktok-videos] Token refresh failed for ${account.handle}:`, refreshErr);
            errors.push(`${account.handle}: token refresh failed`);
            continue;
          }
        }

        // Fetch all videos from TikTok
        let videos;
        try {
          videos = await client.fetchAllUserVideos(accessToken, 500);
        } catch (fetchErr: any) {
          console.warn(`[sync-tiktok-videos] Fetch failed for ${account.handle}:`, fetchErr.message);
          errors.push(`${account.handle}: ${fetchErr.message}`);

          // Mark account as not having video.list scope if 403/scope error
          if (fetchErr.message?.includes('403') || fetchErr.message?.includes('scope')) {
            await supabaseAdmin
              .from('tiktok_accounts')
              .update({ has_video_list_scope: false })
              .eq('id', account.id);
          }
          continue;
        }

        console.log(`[sync-tiktok-videos] ${account.handle}: fetched ${videos.length} videos`);

        // Fetch user's brands for auto-matching
        const { data: userBrands } = await supabaseAdmin
          .from('brands')
          .select('id, name')
          .eq('user_id', account.user_id);
        const brandNames = (userBrands || []).map(b => ({ id: b.id, name: b.name.toLowerCase() }));

        // Fetch user's products for auto-matching
        const { data: userProducts } = await supabaseAdmin
          .from('products')
          .select('id, name, brand')
          .eq('user_id', account.user_id);

        // Upsert each video
        let accountNew = 0;
        for (const video of videos) {
          // Auto-detect brand from description/title
          const textToMatch = `${video.title || ''} ${video.video_description || ''}`.toLowerCase();
          let matchedBrand: { id: string; name: string } | null = null;
          let matchedProduct: { id: string; name: string } | null = null;

          for (const brand of brandNames) {
            if (textToMatch.includes(brand.name)) {
              matchedBrand = brand;
              break;
            }
          }

          if (matchedBrand && userProducts) {
            for (const product of userProducts) {
              if (product.brand?.toLowerCase() === matchedBrand.name &&
                  textToMatch.includes(product.name.toLowerCase())) {
                matchedProduct = { id: product.id, name: product.name };
                break;
              }
            }
          }

          const { data: upserted, error: upsertErr } = await supabaseAdmin
            .from('tiktok_videos')
            .upsert({
              user_id: account.user_id,
              account_id: account.id,
              tiktok_video_id: video.id,
              title: video.title || null,
              description: video.video_description || null,
              create_time: video.create_time,
              cover_image_url: video.cover_image_url || null,
              share_url: video.share_url || null,
              duration: video.duration || null,
              view_count: video.view_count || 0,
              like_count: video.like_count || 0,
              comment_count: video.comment_count || 0,
              share_count: video.share_count || 0,
              matched_brand: matchedBrand?.name || null,
              brand_id: matchedBrand?.id || null,
              matched_product: matchedProduct?.name || null,
              product_id: matchedProduct?.id || null,
              last_synced_at: new Date().toISOString(),
            }, {
              onConflict: 'user_id,tiktok_video_id',
              ignoreDuplicates: false,
            })
            .select('id, analyzed_at')
            .single();

          if (upsertErr) {
            console.warn(`[sync-tiktok-videos] Upsert error for ${video.id}:`, upsertErr.message);
            continue;
          }

          totalSynced++;

          // Queue for analysis if not yet analyzed
          if (upserted && !upserted.analyzed_at) {
            accountNew++;
            await supabaseAdmin
              .from('analysis_queue')
              .upsert({
                user_id: account.user_id,
                tiktok_video_id: upserted.id,
                priority: 5,
                status: 'pending',
              }, {
                onConflict: 'tiktok_video_id',
                ignoreDuplicates: true,
              });
          }
        }

        totalNew += accountNew;

        // ── Phase 2: Winner Detection ──────────────────────────────
        // Evaluate mature videos (>24h old) for winner status
        try {
          const twentyFourHoursAgo = Math.floor(Date.now() / 1000) - 86400;
          const { data: matureVideos } = await supabaseAdmin
            .from('tiktok_videos')
            .select('id, video_id, product_id, view_count, like_count, comment_count, share_count, content_grade, attributed_orders, attributed_gmv')
            .eq('user_id', account.user_id)
            .eq('account_id', account.id)
            .lt('create_time', twentyFourHoursAgo);

          for (const mv of matureVideos || []) {
            const stats: VideoStats = {
              views: Number(mv.view_count) || 0,
              likes: Number(mv.like_count) || 0,
              comments: Number(mv.comment_count) || 0,
              shares: Number(mv.share_count) || 0,
              sales_count: Number(mv.attributed_orders) || undefined,
              revenue: Number(mv.attributed_gmv) || undefined,
            };

            // Compute product average for relative comparison
            let productAverage: VideoStats | null = null;
            if (mv.product_id) {
              const { data: siblings } = await supabaseAdmin
                .from('tiktok_videos')
                .select('view_count, like_count, comment_count, share_count')
                .eq('user_id', account.user_id)
                .eq('product_id', mv.product_id);

              if (siblings && siblings.length > 1) {
                const n = siblings.length;
                productAverage = {
                  views: Math.round(siblings.reduce((s, v) => s + (Number(v.view_count) || 0), 0) / n),
                  likes: Math.round(siblings.reduce((s, v) => s + (Number(v.like_count) || 0), 0) / n),
                  comments: Math.round(siblings.reduce((s, v) => s + (Number(v.comment_count) || 0), 0) / n),
                  shares: Math.round(siblings.reduce((s, v) => s + (Number(v.share_count) || 0), 0) / n),
                };
              }
            }

            const result = detectWinner(stats, productAverage);

            if (result.is_winner) {
              totalWinners++;
              const grade = result.confidence === 'high' ? 'A' : 'B';

              // Update content_grade on tiktok_videos
              if (mv.content_grade !== grade) {
                await supabaseAdmin
                  .from('tiktok_videos')
                  .update({ content_grade: grade })
                  .eq('id', mv.id);
              }

              // If FlashFlow-generated (has video_id FK), upsert ff_outcomes
              if (mv.video_id) {
                // Check if there's an ff_generations row linked via the videos table
                const { data: gen } = await supabaseAdmin
                  .from('ff_generations')
                  .select('id')
                  .eq('user_id', account.user_id)
                  .limit(1)
                  .maybeSingle();

                // Try to find generation linked through video's generation metadata
                const { data: videoRow } = await supabaseAdmin
                  .from('videos')
                  .select('id, metadata')
                  .eq('id', mv.video_id)
                  .single();

                const generationId = (videoRow?.metadata as any)?.generation_id || gen?.id;
                if (generationId) {
                  await supabaseAdmin
                    .from('ff_outcomes')
                    .upsert({
                      generation_id: generationId,
                      user_id: account.user_id,
                      is_winner: true,
                      views: stats.views,
                      winner_score: result.score,
                      tags: result.reasons,
                    }, {
                      onConflict: 'generation_id',
                      ignoreDuplicates: false,
                    });
                }
              }
            }
          }
        } catch (winnerErr: any) {
          console.warn(`[sync-tiktok-videos] Winner detection error for ${account.handle}:`, winnerErr.message);
          errors.push(`${account.handle}: winner detection — ${winnerErr.message}`);
        }

        // Update account sync metadata
        await supabaseAdmin
          .from('tiktok_accounts')
          .update({
            has_video_list_scope: true,
            last_video_sync_at: new Date().toISOString(),
            total_synced_videos: videos.length,
          })
          .eq('id', account.id);

      } catch (accountErr: any) {
        console.error(`[sync-tiktok-videos] Account ${account.handle} error:`, accountErr);
        errors.push(`${account.handle}: ${accountErr.message}`);
      }
    }

    return NextResponse.json({
      ok: true,
      accounts_processed: accounts.length,
      videos_synced: totalSynced,
      new_videos_queued: totalNew,
      winners_detected: totalWinners,
      errors: errors.length > 0 ? errors : undefined,
    });

  } catch (err: any) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('[sync-tiktok-videos] Fatal error:', err);
    await checkAndSendFailureAlert({
      source: 'sync-tiktok-videos',
      error: errorMsg,
      cooldownMinutes: 30,
      context: { route: '/api/cron/sync-tiktok-videos' },
    });
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
