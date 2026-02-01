// lib/replicate.ts - Replicate AI image generation client
import Replicate from 'replicate';

// Lazy-initialize Replicate client
let replicateClient: Replicate | null = null;

export function getReplicateClient(): Replicate {
  if (!replicateClient) {
    const apiKey = process.env.REPLICATE_API_TOKEN;
    if (!apiKey) {
      throw new Error('REPLICATE_API_TOKEN environment variable is not set');
    }
    replicateClient = new Replicate({ auth: apiKey });
  }
  return replicateClient;
}

// Image generation models available
export const IMAGE_MODELS = {
  // Flux models - high quality, fast
  'flux-schnell': {
    id: 'black-forest-labs/flux-schnell',
    name: 'Flux Schnell',
    description: 'Fast, high-quality image generation',
    creditCost: 1,
  },
  'flux-dev': {
    id: 'black-forest-labs/flux-dev',
    name: 'Flux Dev',
    description: 'Higher quality, slower generation',
    creditCost: 2,
  },
  // SDXL for more control
  'sdxl': {
    id: 'stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b',
    name: 'Stable Diffusion XL',
    description: 'Classic SDXL with fine control',
    creditCost: 1,
  },
} as const;

export type ImageModelKey = keyof typeof IMAGE_MODELS;

// Style presets for B-roll
export const STYLE_PRESETS = {
  'cinematic': {
    label: 'Cinematic',
    description: 'Film-like quality with dramatic lighting',
    suffix: ', cinematic lighting, film grain, dramatic composition, 4k, high quality',
  },
  'product': {
    label: 'Product Shot',
    description: 'Clean product photography style',
    suffix: ', product photography, clean white background, studio lighting, professional, 4k',
  },
  'lifestyle': {
    label: 'Lifestyle',
    description: 'Natural, authentic feel',
    suffix: ', lifestyle photography, natural lighting, authentic, warm tones, 4k',
  },
  'social-media': {
    label: 'Social Media',
    description: 'Eye-catching for social platforms',
    suffix: ', vibrant colors, eye-catching, instagram aesthetic, high contrast, 4k',
  },
  'minimalist': {
    label: 'Minimalist',
    description: 'Clean, simple compositions',
    suffix: ', minimalist, clean composition, lots of white space, modern, 4k',
  },
  'dramatic': {
    label: 'Dramatic',
    description: 'Bold, attention-grabbing',
    suffix: ', dramatic lighting, bold colors, high contrast, cinematic, 4k',
  },
} as const;

export type StylePresetKey = keyof typeof STYLE_PRESETS;

// Aspect ratios for different platforms
export const ASPECT_RATIOS = {
  '1:1': { width: 1024, height: 1024, label: 'Square (1:1)', platforms: ['Instagram', 'Facebook'] },
  '9:16': { width: 768, height: 1365, label: 'Portrait (9:16)', platforms: ['TikTok', 'Reels', 'Shorts'] },
  '16:9': { width: 1365, height: 768, label: 'Landscape (16:9)', platforms: ['YouTube', 'Twitter'] },
  '4:5': { width: 1024, height: 1280, label: 'Portrait (4:5)', platforms: ['Instagram Feed'] },
} as const;

export type AspectRatioKey = keyof typeof ASPECT_RATIOS;

export interface GenerateImageParams {
  prompt: string;
  model?: ImageModelKey;
  style?: StylePresetKey;
  aspectRatio?: AspectRatioKey;
  negativePrompt?: string;
  numOutputs?: number;
}

export interface GeneratedImage {
  url: string;
  prompt: string;
  model: string;
  style: string | null;
  aspectRatio: string;
  createdAt: Date;
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
  const dimensions = ASPECT_RATIOS[aspectRatio];

  // Build the full prompt with style suffix
  let fullPrompt = prompt;
  if (style && STYLE_PRESETS[style]) {
    fullPrompt += STYLE_PRESETS[style].suffix;
  }

  // Different input formats for different models
  let input: Record<string, unknown>;

  if (model === 'flux-schnell' || model === 'flux-dev') {
    input = {
      prompt: fullPrompt,
      num_outputs: Math.min(numOutputs, 4),
      aspect_ratio: aspectRatio.replace(':', ':'),
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

  const output = await replicate.run(modelConfig.id as `${string}/${string}`, { input });

  // Handle different output formats
  if (Array.isArray(output)) {
    return output.map(item => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object' && 'url' in item) return (item as { url: string }).url;
      return String(item);
    });
  }

  if (typeof output === 'string') {
    return [output];
  }

  throw new Error('Unexpected output format from Replicate');
}

// Helper to get credit cost for a generation
export function getGenerationCreditCost(model: ImageModelKey, numOutputs: number): number {
  const baseCredits = IMAGE_MODELS[model].creditCost;
  return baseCredits * numOutputs;
}
