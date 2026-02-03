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
// Note: Use model names without version suffix, or with full deployment hash
export const IMAGE_MODELS = {
  'flux-schnell': {
    id: 'black-forest-labs/flux-schnell',
    name: 'Flux Schnell',
    description: 'Fast, high-quality image generation',
    creditCost: 2,
  },
  'flux-dev': {
    id: 'black-forest-labs/flux-dev',
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

  console.log('[Replicate] generateImages called with:', { model, style, aspectRatio, numOutputs });

  const replicate = getReplicateClient();
  const modelConfig = IMAGE_MODELS[model];

  if (!modelConfig) {
    console.error('[Replicate] Invalid model key:', model);
    throw new Error(`Invalid model: ${model}. Valid models: ${Object.keys(IMAGE_MODELS).join(', ')}`);
  }

  console.log('[Replicate] Model config:', { key: model, id: modelConfig.id, name: modelConfig.name });

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
    console.log('[Replicate] Calling replicate.run with:');
    console.log('[Replicate]   Model ID:', modelConfig.id);
    console.log('[Replicate]   Input:', JSON.stringify(input, null, 2));

    output = await replicate.run(modelConfig.id as `${string}/${string}`, { input });

    console.log('[Replicate] API call successful');
    console.log('Replicate raw output:', JSON.stringify(output));
    console.log('[Replicate] Output type:', typeof output, Array.isArray(output) ? `(array of ${(output as unknown[]).length})` : '');
  } catch (runError) {
    console.error('[Replicate] API call failed!');
    console.error('[Replicate] Model ID was:', modelConfig.id);
    console.error('[Replicate] Error:', runError);

    if (runError instanceof Error) {
      console.error('[Replicate] Error message:', runError.message);

      // Check for common error types
      if (runError.message.includes('Invalid token') || runError.message.includes('401')) {
        throw new Error('Replicate API authentication failed. Please check your REPLICATE_API_TOKEN.');
      }
      if (runError.message.includes('rate limit') || runError.message.includes('429')) {
        throw new Error('Replicate rate limit exceeded. Please try again later.');
      }
      if (runError.message.includes('model') || runError.message.includes('not found') || runError.message.includes('version')) {
        throw new Error(`Replicate model not found: ${modelConfig.id}. Original error: ${runError.message}`);
      }
      throw new Error(`Replicate error: ${runError.message}`);
    }
    throw runError;
  }

  // Handle different output formats from Replicate
  // Can be: string[], FileOutput[], string, or FileOutput
  const extractUrl = (item: unknown): string | null => {
    if (typeof item === 'string') return item;
    if (item && typeof item === 'object') {
      const obj = item as Record<string, unknown>;
      // FileOutput format: { url: string } or { href: string }
      if (typeof obj.url === 'string') return obj.url;
      if (typeof obj.href === 'string') return obj.href;
      // ReadableStream case - get the URL from toString
      if (obj.toString && typeof obj.toString === 'function') {
        const str = obj.toString();
        if (str.startsWith('http')) return str;
      }
    }
    return null;
  };

  if (Array.isArray(output)) {
    const urls = output.map(extractUrl).filter((url): url is string => url !== null);
    if (urls.length === 0) {
      console.error('[Replicate] Could not extract any URLs from array output:', JSON.stringify(output).substring(0, 500));
      throw new Error('Failed to extract image URLs from Replicate response');
    }
    return urls;
  }

  const singleUrl = extractUrl(output);
  if (singleUrl) {
    return [singleUrl];
  }

  console.error('[Replicate] Unexpected output format:', typeof output, JSON.stringify(output).substring(0, 500));
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

// Image-to-image generation using SDXL
export interface GenerateImageFromImageParams {
  prompt: string;
  sourceImageUrl: string;
  strength?: number;
  style?: string;
  aspectRatio?: string;
  negativePrompt?: string;
}

export async function generateImageFromImage(params: GenerateImageFromImageParams): Promise<string[]> {
  const {
    prompt,
    sourceImageUrl,
    strength = 0.7,
    style,
    negativePrompt,
  } = params;

  console.log('[Replicate] generateImageFromImage called with:', {
    prompt: prompt.substring(0, 50),
    sourceImageUrl: sourceImageUrl.substring(0, 50),
    strength
  });

  const replicate = getReplicateClient();

  // Get style modifier
  const styleConfig = style ? IMAGE_STYLES.find(s => s.value === style) : null;
  let fullPrompt = prompt;
  if (styleConfig) {
    fullPrompt += `, ${styleConfig.modifier}`;
  }

  // Use SDXL for img2img - it has good image input support
  const input = {
    prompt: fullPrompt,
    image: sourceImageUrl,
    prompt_strength: strength,
    num_outputs: 1,
    refine: "expert_ensemble_refiner",
    scheduler: "K_EULER",
    guidance_scale: 7.5,
    num_inference_steps: 25,
    negative_prompt: negativePrompt || 'blurry, low quality, distorted, ugly, bad anatomy',
  };

  let output: unknown;
  try {
    console.log('[Replicate] Calling SDXL img2img with:');
    console.log('[Replicate]   Input:', JSON.stringify({ ...input, image: '[source image url]' }, null, 2));

    output = await replicate.run(
      "stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b",
      { input }
    );

    console.log('[Replicate] img2img API call successful');
    console.log('Replicate raw output:', JSON.stringify(output));
  } catch (runError) {
    console.error('[Replicate] img2img API call failed!');
    console.error('[Replicate] Error:', runError);

    if (runError instanceof Error) {
      if (runError.message.includes('Invalid token') || runError.message.includes('401')) {
        throw new Error('Replicate API authentication failed. Please check your REPLICATE_API_TOKEN.');
      }
      if (runError.message.includes('rate limit') || runError.message.includes('429')) {
        throw new Error('Replicate rate limit exceeded. Please try again later.');
      }
      throw new Error(`Replicate error: ${runError.message}`);
    }
    throw runError;
  }

  // Extract URL from response
  const extractUrl = (item: unknown): string | null => {
    if (typeof item === 'string') return item;
    if (item && typeof item === 'object') {
      const obj = item as Record<string, unknown>;
      if (typeof obj.url === 'string') return obj.url;
      if (typeof obj.href === 'string') return obj.href;
      if (obj.toString && typeof obj.toString === 'function') {
        const str = obj.toString();
        if (str.startsWith('http')) return str;
      }
    }
    return null;
  };

  if (Array.isArray(output)) {
    const urls = output.map(extractUrl).filter((url): url is string => url !== null);
    if (urls.length === 0) {
      console.error('[Replicate] Could not extract any URLs from img2img output');
      throw new Error('Failed to extract image URL from response');
    }
    return urls;
  }

  const singleUrl = extractUrl(output);
  if (singleUrl) {
    return [singleUrl];
  }

  console.error('[Replicate] Unexpected img2img output format:', typeof output);
  throw new Error('Unexpected output format from Replicate');
}
