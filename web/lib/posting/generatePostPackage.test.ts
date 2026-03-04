import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock supabaseAdmin before importing the module
const mockFrom = vi.fn();
vi.mock('@/lib/supabaseAdmin', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => mockFrom(...args) },
}));

import { generatePostPackage } from './generatePostPackage';

function mockQuery(data: unknown, error: unknown = null) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data, error }),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
  };
}

function mockEmptyQuery() {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
}

describe('generatePostPackage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const fullItem = {
    id: 'ci-1',
    title: 'Test Video',
    caption: 'Check this out!',
    hashtags: ['#viral', '#fyp'],
    final_video_url: 'https://drive.google.com/video.mp4',
    drive_folder_url: 'https://drive.google.com/folder/123',
    raw_footage_url: 'https://drive.google.com/raw.mp4',
    transcript_text: 'Hello world',
    product_id: 'prod-1',
  };

  const fullProduct = {
    name: 'Super Supplement',
    link: 'https://example.com/product',
    tiktok_showcase_url: 'https://tiktok.com/showcase/123',
  };

  it('generates complete payload with all fields', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'content_items') return mockQuery(fullItem);
      if (table === 'products') return mockQuery(fullProduct);
      if (table === 'content_experiments') {
        const q = mockEmptyQuery();
        // Override for experiments (returns array via eq chain)
        q.eq = vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: [{ variable_type: 'hook_style', variant: 'question' }],
            error: null,
          }),
        });
        return { select: vi.fn().mockReturnValue(q) };
      }
      if (table === 'hook_patterns') return mockQuery({ pattern: 'Question Hook', example_hook: 'Did you know...?', performance_score: 8.5 });
      if (table === 'creator_briefs') return mockQuery({ data: { cta: 'Shop now!' } });
      return mockEmptyQuery();
    });

    const result = await generatePostPackage('ci-1', 'ws-1');

    expect(result.json).toBeDefined();
    expect(result.markdown).toBeDefined();
    expect(result.json.content_item_id).toBe('ci-1');
    expect(result.json.workspace_id).toBe('ws-1');
    expect(result.json.platform).toBe('tiktok');
    expect(result.json.caption).toBe('Check this out!');
    expect(result.json.hashtags).toEqual(['#viral', '#fyp']);
    expect(result.json.product_name).toBe('Super Supplement');
    expect(result.json.product_url).toBe('https://example.com/product');
    expect(result.json.tiktok_showcase_url).toBe('https://tiktok.com/showcase/123');
    expect(result.json.generated_at).toBeDefined();
    expect(result.json.steps.length).toBeGreaterThan(0);
    expect(result.markdown).toContain('Post Package');
  });

  it('handles missing optional fields (no product, no experiments, no hooks)', async () => {
    const minimalItem = {
      ...fullItem,
      product_id: null,
      caption: null,
      hashtags: null,
      final_video_url: null,
      drive_folder_url: null,
      raw_footage_url: null,
    };

    mockFrom.mockImplementation((table: string) => {
      if (table === 'content_items') return mockQuery(minimalItem);
      if (table === 'content_experiments') {
        const q = mockEmptyQuery();
        q.eq = vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        });
        return { select: vi.fn().mockReturnValue(q) };
      }
      return mockEmptyQuery();
    });

    const result = await generatePostPackage('ci-1', 'ws-1');

    expect(result.json.product_id).toBeNull();
    expect(result.json.product_name).toBeNull();
    expect(result.json.caption).toBeNull();
    expect(result.json.hashtags).toBeNull();
    expect(result.json.experiment_tags).toEqual([]);
    expect(result.json.recommended_hook).toBeNull();
    expect(result.json.steps.length).toBeGreaterThan(0);
  });

  it('generates steps array correctly', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'content_items') return mockQuery(fullItem);
      if (table === 'products') return mockQuery(fullProduct);
      if (table === 'content_experiments') {
        const q = mockEmptyQuery();
        q.eq = vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        });
        return { select: vi.fn().mockReturnValue(q) };
      }
      return mockEmptyQuery();
    });

    const result = await generatePostPackage('ci-1', 'ws-1');

    expect(result.json.steps).toContainEqual(expect.stringContaining('Open final video'));
    expect(result.json.steps).toContainEqual('Open TikTok and start new post');
    expect(result.json.steps).toContainEqual(expect.stringContaining('Upload video from Drive'));
    expect(result.json.steps).toContainEqual('Paste caption (copied below)');
    expect(result.json.steps).toContainEqual(expect.stringContaining('Link product in TikTok Shop'));
    expect(result.json.steps).toContainEqual(expect.stringContaining('Copy posted URL'));
  });

  it('throws when content item not found', async () => {
    mockFrom.mockImplementation(() => mockQuery(null, { message: 'not found' }));

    await expect(generatePostPackage('ci-nonexistent', 'ws-1'))
      .rejects.toThrow('Content item not found');
  });
});
