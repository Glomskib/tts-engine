// lib/replicate.ts - Replicate AI image generation client
import Replicate from 'replicate';

// Lazy-initialize Replicate client
let replicateClient: Replicate | null = null;

export function getReplicateClient(): Replicate {
  if (!replicateClient) {
    const apiKey = process.env.REPLICATE_API_TOKEN;
    if (!apiKey) {
      console.error('[Replicate] REPLICATE_API_TOKEN is not set!');
      console.error('[Replicate] Add this environment variable to your .env.local or Vercel dashboard');
      throw new Error('REPLICATE_API_TOKEN environment variable is not set. Please configure this in your environment variables.');
    }
    replicateClient = new Replicate({ auth: apiKey });
  }
  return replicateClient;
}

// Image style presets
export interface ImageStyle {
  value: string;
  label: string;
  description: string;
  modifier: string;
}

export const IMAGE_STYLES: ImageStyle[] = [
  {
    value: 'lifestyle',
    label: 'Lifestyle',
    description: 'Natural, authentic social media style',
    modifier: 'lifestyle photography, natural lighting, authentic, warm tones, social media aesthetic, 4K',
  },
  {
    value: 'cinematic',
    label: 'Cinematic',
    description: 'Dramatic, film-like quality',
    modifier: 'cinematic lighting, film grain, dramatic shadows, 4K, professional photography',
  },
  {
    value: 'product',
    label: 'Product Shot',
    description: 'Clean, professional product focus',
    modifier: 'product photography, clean background, studio lighting, commercial quality, 4K',
  },
  {
    value: 'aesthetic',
    label: 'Aesthetic',
    description: 'Soft, dreamy, Instagram-worthy',
    modifier: 'aesthetic, soft lighting, muted colors, instagram style, dreamy, 4K',
  },
  {
    value: 'bold',
    label: 'Bold & Vibrant',
    description: 'Eye-catching, high energy',
    modifier: 'bold colors, high contrast, eye-catching, vibrant, energetic, 4K',
  },
  {
    value: 'minimal',
    label: 'Minimal',
    description: 'Clean, simple, modern',
    modifier: 'minimalist, clean, simple composition, negative space, modern, 4K',
  },
];

// Aspect ratios for different platforms
export interface AspectRatio {
  value: string;
  label: string;
  width: number;
  height: number;
  platforms: string[];
}

export const ASPECT_RATIOS: AspectRatio[] = [
  { value: '9:16', label: '9:16 (TikTok/Reels)', width: 768, height: 1365, platforms: ['TikTok', 'Reels', 'Shorts'] },
  { value: '1:1', label: '1:1 (Square)', width: 1024, height: 1024, platforms: ['Instagram', 'Facebook'] },
  { value: '16:9', label: '16:9 (YouTube)', width: 1365, height: 768, platforms: ['YouTube', 'Twitter'] },
  { value: '4:5', label: '4:5 (Instagram)', width: 1024, height: 1280, platforms: ['Instagram Feed'] },
];

// Image generation models
// Note: Flux models need version suffix for Replicate API
export const IMAGE_MODELS = {
  'flux-schnell': {
    id: 'black-forest-labs/flux-schnell:1',
    name: 'Flux Schnell',
    description: 'Fast, high-quality image generation',
    creditCost: 2,
  },
  'flux-dev': {
    id: 'black-forest-labs/flux-dev:1',
    name: 'Flux Dev',
    description: 'Higher quality, slower generation',
    creditCost: 2,
  },
  'sdxl': {
    id: 'stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b',
    name: 'Stable Diffusion XL',
    description: 'Classic SDXL with fine control',
    creditCost: 2,
  },
} as const;

export type ImageModelKey = keyof typeof IMAGE_MODELS;

export interface GenerateImageParams {
  prompt: string;
  model?: ImageModelKey;
  style?: string;
  aspectRatio?: string;
  negativePrompt?: string;
  numOutputs?: number;
}

// Generate images using Replicate
export async function generateImages(params: GenerateImageParams): Promise<string[]> {
  const {
    prompt,
    model = 'flux-schnell',
    style,
    aspectRatio = '1:1',
    negativePrompt,
    numOutputs = 1,
  } = params;

  const replicate = getReplicateClient();
  const modelConfig = IMAGE_MODELS[model];
  const dimensions = ASPECT_RATIOS.find(ar => ar.value === aspectRatio) || ASPECT_RATIOS[1];
  const styleConfig = style ? IMAGE_STYLES.find(s => s.value === style) : null;

  // Build the full prompt with style modifier
  let fullPrompt = prompt;
  if (styleConfig) {
    fullPrompt += `, ${styleConfig.modifier}`;
  }

  // Different input formats for different models
  let input: Record<string, unknown>;

  if (model === 'flux-schnell' || model === 'flux-dev') {
    input = {
      prompt: fullPrompt,
      num_outputs: Math.min(numOutputs, 4),
      aspect_ratio: aspectRatio,
      output_format: 'webp',
      output_quality: 90,
    };
  } else {
    // SDXL format
    input = {
      prompt: fullPrompt,
      negative_prompt: negativePrompt || 'blurry, low quality, distorted, ugly, bad anatomy',
      width: dimensions.width,
      height: dimensions.height,
      num_outputs: Math.min(numOutputs, 4),
    };
  }

  let output: unknown;
  try {
    output = await replicate.run(modelConfig.id as `${string}/${string}`, { input });
  } catch (runError) {
    console.error('[Replicate] API call failed:', runError);
    if (runError instanceof Error) {
      // Check for common error types
      if (runError.message.includes('Invalid token') || runError.message.includes('401')) {
        throw new Error('Replicate API authentication failed. Please check your REPLICATE_API_TOKEN.');
      }
      if (runError.message.includes('rate limit') || runError.message.includes('429')) {
        throw new Error('Replicate rate limit exceeded. Please try again later.');
      }
      if (runError.message.includes('model') || runError.message.includes('not found')) {
        throw new Error(`Replicate model not found: ${modelConfig.id}`);
      }
      throw new Error(`Replicate error: ${runError.message}`);
    }
    throw runError;
  }

  // Handle different output formats
  if (Array.isArray(output)) {
    const urls = output.map(item => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object' && 'url' in item) return (item as { url: string }).url;
      return String(item);
    });
    return urls;
  }

  if (typeof output === 'string') {
    return [output];
  }

  console.error('[Replicate] Unexpected output format:', typeof output, output);
  throw new Error('Unexpected output format from Replicate');
}

// Helper to get credit cost for a generation
export function getImageCreditCost(model: ImageModelKey, numOutputs: number): number {
  const baseCredits = IMAGE_MODELS[model].creditCost;
  return baseCredits * numOutputs;
}

// Get style by value
export function getImageStyle(value: string): ImageStyle | undefined {
  return IMAGE_STYLES.find(s => s.value === value);
}

// Get aspect ratio by value
export function getAspectRatio(value: string): AspectRatio | undefined {
  return ASPECT_RATIOS.find(ar => ar.value === value);
}
