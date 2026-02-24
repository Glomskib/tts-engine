import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { parseBrollSuggestions, generateAiBroll, fetchStockBroll } from '@/lib/marketplace/broll-providers';
import { createBrollAsset, linkBrollToScript } from '@/lib/marketplace/queries';
import { createHash } from 'crypto';

export async function POST(req: NextRequest) {
  // Auth: require internal secret or service role
  const authHeader = req.headers.get('authorization') || '';
  const internalSecret = process.env.INTERNAL_API_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!authHeader.includes(internalSecret || '__never__')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { scriptId } = await req.json();
  if (!scriptId) return NextResponse.json({ error: 'scriptId required' }, { status: 400 });

  const svc = supabaseAdmin;

  // Get script
  const { data: script } = await svc.from('mp_scripts').select('*, clients:clients!mp_scripts_client_id_fkey(client_code)').eq('id', scriptId).single();
  if (!script) return NextResponse.json({ error: 'Script not found' }, { status: 404 });

  const clientCode = (script.clients as Record<string, string>)?.client_code || 'UNKNOWN';
  const requests = parseBrollSuggestions(script.notes, script.broll_suggestions);

  if (requests.length === 0) {
    return NextResponse.json({ message: 'No b-roll suggestions found', created: 0 });
  }

  let created = 0;

  for (const bReq of requests) {
    // Try AI generator first, then stock
    let result = await generateAiBroll(bReq);
    if (!result) result = await fetchStockBroll(bReq);

    if (result && (result.buffer || result.url)) {
      // Compute hash
      const hashInput = result.buffer
        ? result.buffer
        : `${result.prompt}:${result.url}`;
      const hash = createHash('sha256').update(hashInput).digest('hex');

      // Upload to storage if we have a buffer
      let storagePath = `broll/${clientCode}/${scriptId}/${result.sourceType}/${hash}.mp4`;
      const bucket = result.sourceType === 'ai' ? 'broll-generated' : 'broll-stock';

      if (result.buffer) {
        await svc.storage.from(bucket).upload(storagePath, result.buffer, {
          contentType: 'video/mp4',
          upsert: true,
        });
      }

      // Create asset (deduped by hash)
      const assetId = await createBrollAsset({
        hash,
        source_type: result.sourceType,
        client_code: clientCode,
        script_id: scriptId,
        storage_bucket: bucket,
        storage_path: storagePath,
        tags: result.tags,
        prompt: result.prompt,
        duration_seconds: result.durationSeconds || undefined,
      });

      // Link to script
      await linkBrollToScript(scriptId, assetId, bReq.recommendedFor, bReq.description);
      created++;
    } else {
      // No provider returned anything — create a reference placeholder
      const hash = createHash('sha256').update(`ref:${bReq.description}`).digest('hex');
      const assetId = await createBrollAsset({
        hash,
        source_type: 'reference',
        client_code: clientCode,
        script_id: scriptId,
        storage_bucket: 'broll-library',
        storage_path: `broll/${clientCode}/${scriptId}/reference/${hash}_placeholder`,
        tags: bReq.keyword.split(' '),
        prompt: bReq.description,
      });
      await linkBrollToScript(scriptId, assetId, bReq.recommendedFor, bReq.description);
      created++;
    }
  }

  return NextResponse.json({ message: 'B-roll scout complete', created, total_requests: requests.length });
}
