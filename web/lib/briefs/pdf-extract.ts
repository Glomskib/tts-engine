export interface PdfExtractResult {
  text: string;
  pageCount: number;
  meta?: { title?: string; author?: string };
  lowSignal: boolean;
}

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB
const MAX_PAGES = 40;
const LOW_SIGNAL_THRESHOLD = 400;

export async function extractPdfText(buffer: Buffer): Promise<PdfExtractResult> {
  if (buffer.byteLength > MAX_FILE_SIZE) {
    throw new Error(`PDF too large (${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB). Max 15 MB.`);
  }

  // Dynamic import to avoid bundling issues (same pattern as nightly-job.ts)
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: new Uint8Array(buffer) });

  try {
    const info = await parser.getInfo();
    const totalPages = info?.total ?? 0;

    if (totalPages > MAX_PAGES) {
      throw new Error(`PDF has ${totalPages} pages (max ${MAX_PAGES}). Please split the document.`);
    }

    const result = await parser.getText();
    const rawText = result.text || '';

    // Normalize: trim, collapse whitespace/newlines, strip null bytes
    const text = rawText
      .replace(/\0/g, '')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    return {
      text,
      pageCount: totalPages,
      meta: {
        title: info?.info?.Title || undefined,
        author: info?.info?.Author || undefined,
      },
      lowSignal: text.length < LOW_SIGNAL_THRESHOLD,
    };
  } finally {
    await parser.destroy().catch(() => {});
  }
}
