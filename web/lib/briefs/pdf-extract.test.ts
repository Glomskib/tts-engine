import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetInfo = vi.fn();
const mockGetText = vi.fn();
const mockDestroy = vi.fn();

vi.mock('pdf-parse', () => ({
  PDFParse: class {
    getInfo = mockGetInfo;
    getText = mockGetText;
    destroy = mockDestroy;
  },
}));

import { extractPdfText } from './pdf-extract';

describe('extractPdfText', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDestroy.mockResolvedValue(undefined);
  });

  it('extracts text with metadata', async () => {
    mockGetInfo.mockResolvedValue({ total: 3, info: { Title: 'My Brief', Author: 'Alice' } });
    mockGetText.mockResolvedValue({ text: 'Hello world. This is a brief with enough content to pass the low signal threshold. '.repeat(6) });

    const result = await extractPdfText(Buffer.from('fake-pdf'));

    expect(result.pageCount).toBe(3);
    expect(result.meta?.title).toBe('My Brief');
    expect(result.meta?.author).toBe('Alice');
    expect(result.lowSignal).toBe(false);
    expect(result.text.length).toBeGreaterThan(400);
  });

  it('marks low signal when text < 400 chars', async () => {
    mockGetInfo.mockResolvedValue({ total: 1 });
    mockGetText.mockResolvedValue({ text: 'Short text' });

    const result = await extractPdfText(Buffer.from('fake-pdf'));

    expect(result.lowSignal).toBe(true);
    expect(result.text).toBe('Short text');
  });

  it('throws when file exceeds 15 MB', async () => {
    const bigBuffer = Buffer.alloc(16 * 1024 * 1024);
    await expect(extractPdfText(bigBuffer)).rejects.toThrow('PDF too large');
  });

  it('throws when PDF has more than 40 pages', async () => {
    mockGetInfo.mockResolvedValue({ total: 50 });
    await expect(extractPdfText(Buffer.from('fake'))).rejects.toThrow('50 pages');
  });

  it('normalizes excessive whitespace', async () => {
    mockGetInfo.mockResolvedValue({ total: 1 });
    mockGetText.mockResolvedValue({ text: 'hello   \t  world\n\n\n\nmultiline \0 text' });

    const result = await extractPdfText(Buffer.from('fake'));

    expect(result.text).toBe('hello world\n\nmultiline text');
  });

  it('always calls destroy even on error', async () => {
    mockGetInfo.mockResolvedValue({ total: 1 });
    mockGetText.mockRejectedValue(new Error('parse failed'));

    await expect(extractPdfText(Buffer.from('fake'))).rejects.toThrow('parse failed');
    expect(mockDestroy).toHaveBeenCalled();
  });

  it('handles empty text result', async () => {
    mockGetInfo.mockResolvedValue({ total: 1 });
    mockGetText.mockResolvedValue({ text: '' });

    const result = await extractPdfText(Buffer.from('fake'));

    expect(result.text).toBe('');
    expect(result.lowSignal).toBe(true);
  });
});
