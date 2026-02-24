import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase/server';
import { getScript, getFirstClientId, createBrollAsset, linkBrollToScript } from '@/lib/marketplace/queries';
import { parseBrollSuggestions, generateAiBroll, fetchStockBroll } from '@/lib/marketplace/broll-providers';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createHash } from 'crypto';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: scriptId } = await params;
  const clientId = await getFirstClientId(user.id);
  if (!clientId) return NextResponse.json({ error: 'No client found' }, { status: 403 });

  // Verify script belongs to user's client
  const script = await getScript(scriptId);
  if (!script || script.client_id !== clientId) {
    return NextResponse.json({ error: 'Script not found' }, { status: 404 });
  }

  // Get client code
  const sb = await createServerSupabaseClient();
  const { data: client } = await sb.from('clients').select('client_code').eq('id', clientId).single();
  const clientCode = client?.client_code || 'UNKNOWN';

  const requests = parseBrollSuggestions(script.notes, script.broll_suggestions);
  if (requests.length === 0) {
    return NextResponse.json({ message: 'No b-roll suggestions found', created: 0 });
  }

  let created = 0;

  for (const bReq of requests) {
    let result = await generateAiBroll(bReq);
    if (!result) result = await fetchStockBroll(bReq);

    if (result && (result.buffer || result.url)) {
      const hashInput = result.buffer
        ? result.buffer
        : `${result.prompt}:${result.url}`;
      const hash = createHash('sha256').update(hashInput).digest('hex');
      const storagePath = `broll/${clientCode}/${scriptId}/${result.sourceType}/${hash}.mp4`;
      const bucket = result.sourceType === 'ai' ? 'broll-generated' : 'broll-stock';

      if (result.buffer) {
        await sb.storage.from(bucket).upload(storagePath, result.buffer, {
          contentType: 'video/mp4',
          upsert: true,
        });
      }

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

      await linkBrollToScript(scriptId, assetId, bReq.recommendedFor, bReq.description);
      created++;
    } else {
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

  return NextResponse.json({ message: 'B-roll pack generated', created, total_requests: requests.length });
}
