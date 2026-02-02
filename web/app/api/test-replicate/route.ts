import { NextResponse } from 'next/server';
import Replicate from 'replicate';
import { getApiAuthContext } from '@/lib/supabase/api-auth';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET() {
  console.log('=== Replicate Test Endpoint ===');

  // Check authentication
  const authContext = await getApiAuthContext();
  if (!authContext.user) {
    return NextResponse.json({
      ok: false,
      error: 'Authentication required',
      step: 'auth',
    }, { status: 401 });
  }

  // Check environment variable
  const apiToken = process.env.REPLICATE_API_TOKEN;
  console.log('REPLICATE_API_TOKEN exists:', !!apiToken);
  console.log('REPLICATE_API_TOKEN prefix:', apiToken?.substring(0, 5) || 'N/A');

  if (!apiToken) {
    return NextResponse.json({
      ok: false,
      error: 'REPLICATE_API_TOKEN is not configured',
      step: 'env_check',
      hint: 'Add REPLICATE_API_TOKEN to your Vercel environment variables. Get a token from https://replicate.com/account/api-tokens',
    }, { status: 500 });
  }

  // Check token format
  if (!apiToken.startsWith('r8_')) {
    return NextResponse.json({
      ok: false,
      error: 'Invalid REPLICATE_API_TOKEN format',
      step: 'token_format',
      hint: 'Replicate tokens should start with "r8_". Check that the token was copied correctly without extra spaces.',
      token_prefix: apiToken.substring(0, 10),
    }, { status: 500 });
  }

  // Try to initialize client
  let replicate: Replicate;
  try {
    replicate = new Replicate({ auth: apiToken });
    console.log('Replicate client initialized');
  } catch (initError) {
    console.error('Client initialization error:', initError);
    return NextResponse.json({
      ok: false,
      error: 'Failed to initialize Replicate client',
      step: 'client_init',
      details: initError instanceof Error ? initError.message : 'Unknown error',
    }, { status: 500 });
  }

  // Try a simple API call (get models list instead of running a model)
  try {
    console.log('Testing Replicate connection...');

    // Use a quick, low-cost test generation
    // Note: Flux models require version suffix (:1) for Replicate API
    const output = await replicate.run(
      'black-forest-labs/flux-schnell:1',
      {
        input: {
          prompt: 'A small blue dot, simple, minimal',
          num_outputs: 1,
          aspect_ratio: '1:1',
          output_format: 'webp',
          output_quality: 50,
        },
      }
    );

    console.log('Test generation succeeded');
    console.log('Output type:', typeof output);
    console.log('Output:', JSON.stringify(output).substring(0, 200));

    // Extract URL
    let imageUrl: string | null = null;
    if (Array.isArray(output) && output.length > 0) {
      imageUrl = typeof output[0] === 'string' ? output[0] : null;
    } else if (typeof output === 'string') {
      imageUrl = output;
    }

    return NextResponse.json({
      ok: true,
      message: 'Replicate is working correctly!',
      step: 'complete',
      test_image_url: imageUrl,
      output_type: typeof output,
      is_array: Array.isArray(output),
    });

  } catch (apiError) {
    console.error('Replicate API error:', apiError);

    let errorMessage = 'Unknown error';
    let errorType = 'unknown';

    if (apiError instanceof Error) {
      errorMessage = apiError.message;

      if (errorMessage.includes('Invalid token') || errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
        errorType = 'invalid_token';
        return NextResponse.json({
          ok: false,
          error: 'Invalid API token',
          step: 'api_auth',
          errorType,
          details: 'The Replicate API token is invalid or expired. Generate a new token at https://replicate.com/account/api-tokens',
        }, { status: 401 });
      }

      if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
        errorType = 'rate_limit';
        return NextResponse.json({
          ok: false,
          error: 'Rate limited',
          step: 'api_call',
          errorType,
          details: 'Too many requests. Wait a few minutes and try again.',
        }, { status: 429 });
      }

      if (errorMessage.includes('billing') || errorMessage.includes('payment')) {
        errorType = 'billing';
        return NextResponse.json({
          ok: false,
          error: 'Billing issue',
          step: 'api_call',
          errorType,
          details: 'Your Replicate account may need billing setup. Visit https://replicate.com/account/billing',
        }, { status: 402 });
      }

      if (errorMessage.includes('model') || errorMessage.includes('not found')) {
        errorType = 'model_not_found';
      }
    }

    return NextResponse.json({
      ok: false,
      error: 'Replicate API call failed',
      step: 'api_call',
      errorType,
      details: errorMessage,
      stack: process.env.NODE_ENV === 'development' && apiError instanceof Error ? apiError.stack : undefined,
    }, { status: 500 });
  }
}
