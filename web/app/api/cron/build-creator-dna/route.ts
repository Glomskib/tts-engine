import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * GET /api/cron/build-creator-dna
 * Daily cron: for each user with 20+ analyzed videos, rebuild their Creator DNA.
 * Aggregates all tiktok_videos analysis into patterns, then uses Claude to generate
 * winning formula and recommendations.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Find users with enough analyzed videos
    const { data: eligibleUsers } = await supabaseAdmin
      .from('tiktok_videos')
      .select('user_id')
      .not('analyzed_at', 'is', null)
      .not('ai_analysis', 'is', null);

    if (!eligibleUsers) {
      return NextResponse.json({ ok: true, processed: 0 });
    }

    // Count per user
    const userCounts: Record<string, number> = {};
    for (const row of eligibleUsers) {
      userCounts[row.user_id] = (userCounts[row.user_id] || 0) + 1;
    }

    const usersToProcess = Object.entries(userCounts)
      .filter(([_, count]) => count >= 20)
      .map(([userId]) => userId);

    let processed = 0;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;

    for (const userId of usersToProcess) {
      try {
        // Fetch all analyzed videos for this user
        const { data: videos } = await supabaseAdmin
          .from('tiktok_videos')
          .select('ai_analysis, view_count, like_count, comment_count, share_count, duration, content_grade, content_tags, create_time, matched_brand, transcript_text')
          .eq('user_id', userId)
          .not('ai_analysis', 'is', null)
          .order('create_time', { ascending: false })
          .limit(500);

        if (!videos || videos.length < 20) continue;

        // Aggregate hook patterns
        const hookCounts: Record<string, { count: number; totalViews: number; totalEng: number }> = {};
        const formatCounts: Record<string, { count: number; totalViews: number; totalEng: number }> = {};
        const phrases: Record<string, number> = {};
        const emotions: Record<string, number> = {};
        const durations: number[] = [];
        const grades: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
        const niches: Record<string, { count: number; totalEng: number }> = {};

        for (const v of videos) {
          const analysis = v.ai_analysis as any;
          if (!analysis) continue;

          const views = v.view_count || 0;
          const eng = views > 0
            ? ((v.like_count || 0) + (v.comment_count || 0) + (v.share_count || 0)) / views * 100
            : 0;

          // Hook patterns
          const hookStyle = analysis.hook?.style;
          if (hookStyle) {
            if (!hookCounts[hookStyle]) hookCounts[hookStyle] = { count: 0, totalViews: 0, totalEng: 0 };
            hookCounts[hookStyle].count++;
            hookCounts[hookStyle].totalViews += views;
            hookCounts[hookStyle].totalEng += eng;
          }

          // Format patterns
          const format = analysis.content?.format;
          if (format) {
            if (!formatCounts[format]) formatCounts[format] = { count: 0, totalViews: 0, totalEng: 0 };
            formatCounts[format].count++;
            formatCounts[format].totalViews += views;
            formatCounts[format].totalEng += eng;
          }

          // Key phrases
          for (const phrase of (analysis.keyPhrases || [])) {
            phrases[phrase] = (phrases[phrase] || 0) + 1;
          }

          // Emotions
          for (const emotion of (analysis.emotionalTriggers || [])) {
            emotions[emotion] = (emotions[emotion] || 0) + 1;
          }

          // Duration
          if (v.duration) durations.push(v.duration);

          // Grade
          if (v.content_grade && grades[v.content_grade] !== undefined) {
            grades[v.content_grade]++;
          }

          // Niches from content tags
          for (const tag of (v.content_tags || [])) {
            if (!niches[tag]) niches[tag] = { count: 0, totalEng: 0 };
            niches[tag].count++;
            niches[tag].totalEng += eng;
          }
        }

        // Compute aggregates
        const hookPatterns: Record<string, any> = {};
        for (const [style, data] of Object.entries(hookCounts)) {
          hookPatterns[style] = {
            count: data.count,
            avg_views: Math.round(data.totalViews / data.count),
            avg_engagement: parseFloat((data.totalEng / data.count).toFixed(1)),
          };
        }
        const bestHook = Object.entries(hookPatterns).sort((a, b) => b[1].avg_engagement - a[1].avg_engagement)[0]?.[0];
        const mostUsedHook = Object.entries(hookPatterns).sort((a, b) => b[1].count - a[1].count)[0]?.[0];
        hookPatterns.best_performing = bestHook;
        hookPatterns.most_used = mostUsedHook;

        const formatPatterns: Record<string, any> = {};
        for (const [fmt, data] of Object.entries(formatCounts)) {
          formatPatterns[fmt] = {
            count: data.count,
            avg_views: Math.round(data.totalViews / data.count),
            avg_engagement: parseFloat((data.totalEng / data.count).toFixed(1)),
          };
        }
        formatPatterns.best_for_engagement = Object.entries(formatPatterns)
          .filter(([k]) => !['best_for_engagement', 'best_for_views'].includes(k))
          .sort((a, b) => (b[1].avg_engagement || 0) - (a[1].avg_engagement || 0))[0]?.[0];

        const sortedDurations = durations.sort((a, b) => a - b);
        const optimalLength = sortedDurations.length > 0
          ? { sweet_spot: sortedDurations[Math.floor(sortedDurations.length * 0.5)], range: `${sortedDurations[Math.floor(sortedDurations.length * 0.25)]}-${sortedDurations[Math.floor(sortedDurations.length * 0.75)]}` }
          : null;

        const topPhrases = Object.entries(phrases).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([p]) => p);
        const topEmotions = Object.entries(emotions).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([e]) => e);
        const topNiches = Object.entries(niches).sort((a, b) => b[1].count - a[1].count).slice(0, 5);

        // Use Claude to generate winning formula + recommendations
        let winningFormula = '';
        let strengths: string[] = [];
        let weaknesses: string[] = [];
        let recommendations: string[] = [];

        if (anthropicKey) {
          try {
            const summaryPrompt = `Based on this creator's content analysis data, generate a brief winning formula, strengths, weaknesses, and growth recommendations. Return ONLY valid JSON.

DATA:
- ${videos.length} videos analyzed
- Grade distribution: ${JSON.stringify(grades)}
- Top hook type: ${bestHook} (${hookPatterns[bestHook]?.avg_engagement}% avg engagement)
- Most used hook: ${mostUsedHook} (${hookPatterns[mostUsedHook]?.count} videos)
- Best format: ${formatPatterns.best_for_engagement}
- Optimal video length: ${optimalLength?.sweet_spot}s
- Top phrases: ${topPhrases.join(', ')}
- Top emotions: ${topEmotions.join(', ')}
- Top niches: ${topNiches.map(([n, d]) => `${n} (${d.count} videos)`).join(', ')}

Return:
{
  "winning_formula": "2-3 sentence description of what makes this creator's content work",
  "strengths": ["strength 1", "strength 2", "strength 3"],
  "weaknesses": ["weakness 1", "weakness 2"],
  "recommendations": ["specific actionable recommendation 1", "recommendation 2", "recommendation 3"]
}`;

            const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-api-key': anthropicKey,
                'anthropic-version': '2023-06-01',
              },
              body: JSON.stringify({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 800,
                temperature: 0.3,
                messages: [{ role: 'user', content: summaryPrompt }],
              }),
              signal: AbortSignal.timeout(15000),
            });

            if (claudeRes.ok) {
              const cData = await claudeRes.json();
              const text = cData.content?.[0]?.text || '';
              const jsonMatch = text.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                winningFormula = parsed.winning_formula || '';
                strengths = parsed.strengths || [];
                weaknesses = parsed.weaknesses || [];
                recommendations = parsed.recommendations || [];
              }
            }
          } catch (aiErr) {
            console.warn(`[build-creator-dna] Claude summary failed for ${userId}:`, aiErr);
          }
        }

        // Upsert creator DNA
        await supabaseAdmin
          .from('creator_dna')
          .upsert({
            user_id: userId,
            total_videos_analyzed: videos.length,
            last_analyzed_at: new Date().toISOString(),
            hook_patterns: hookPatterns,
            format_patterns: formatPatterns,
            language_patterns: {
              power_phrases: topPhrases.slice(0, 5),
              signature_phrases: topPhrases.slice(0, 3),
              speaking_pace: optimalLength && optimalLength.sweet_spot < 30 ? 'fast' : 'moderate',
            },
            emotional_patterns: {
              primary_emotions: topEmotions,
            },
            performance_patterns: {
              optimal_video_length: optimalLength,
              grade_distribution: grades,
            },
            niche_patterns: {
              top_niches: topNiches.map(([n]) => n),
              niche_engagement: Object.fromEntries(topNiches.map(([n, d]) => [n, { count: d.count, avg_eng: parseFloat((d.totalEng / d.count).toFixed(1)) }])),
            },
            winning_formula: winningFormula || null,
            strengths,
            weaknesses,
            growth_recommendations: recommendations,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id' });

        processed++;
      } catch (userErr: any) {
        console.error(`[build-creator-dna] Error for user ${userId}:`, userErr.message);
      }
    }

    return NextResponse.json({ ok: true, eligible: usersToProcess.length, processed });

  } catch (err: any) {
    console.error('[build-creator-dna] Fatal error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
