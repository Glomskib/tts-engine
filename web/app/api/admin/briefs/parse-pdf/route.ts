import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { withErrorCapture } from '@/lib/errors/withErrorCapture';
import { generateCorrelationId } from '@/lib/api-errors';
import { extractPdfText } from '@/lib/briefs/pdf-extract';
import { parseBriefFromText } from '@/lib/briefs/brief-parse';

export const runtime = 'nodejs';
export const maxDuration = 30;

const MAX_SIZE = 15 * 1024 * 1024; // 15 MB

export const POST = withErrorCapture(async (request: Request) => {
  const correlationId = generateCorrelationId();

  const auth = await getApiAuthContext(request);
  if (!auth.user) {
    return NextResponse.json(
      { ok: false, error: 'Authentication required', correlation_id: correlationId },
      { status: 401 },
    );
  }

  const formData = await request.formData();
  const file = formData.get('file');

  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { ok: false, error: 'No PDF file provided', correlation_id: correlationId },
      { status: 400 },
    );
  }

  if (file.type !== 'application/pdf') {
    return NextResponse.json(
      { ok: false, error: 'File must be a PDF', correlation_id: correlationId },
      { status: 400 },
    );
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { ok: false, error: 'PDF exceeds 15 MB limit', correlation_id: correlationId },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const extraction = await extractPdfText(buffer);

  const url = new URL(request.url);
  const extractOnly = url.searchParams.get('extract_only') === 'true';

  if (extractOnly || extraction.lowSignal) {
    return NextResponse.json({
      ok: true,
      extraction: {
        text: extraction.text,
        pageCount: extraction.pageCount,
        meta: extraction.meta,
        lowSignal: extraction.lowSignal,
      },
      parsed: null,
      correlation_id: correlationId,
    });
  }

  const parsed = await parseBriefFromText(extraction.text, { correlationId });

  return NextResponse.json({
    ok: true,
    extraction: {
      text: extraction.text,
      pageCount: extraction.pageCount,
      meta: extraction.meta,
      lowSignal: extraction.lowSignal,
    },
    parsed,
    correlation_id: correlationId,
  });
}, { routeName: '/api/admin/briefs/parse-pdf', feature: 'briefs' });
