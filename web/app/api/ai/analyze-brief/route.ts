import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import OpenAI from 'openai';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface ParsedBrief {
  brand_name: string;
  products: Array<{ name: string; description: string; price: string }>;
  target_audience: string;
  key_messages: string[];
  content_guidelines: string[];
  hashtags: string[];
  commission: string;
  posting_requirements: string;
  brand_voice: string;
  additional_notes: string;
}

export async function POST(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  try {
    const authContext = await getApiAuthContext(request);
    if (!authContext.user) {
      return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
    }

    const formData = await request.formData();
    const file = formData.get('image') as File;

    if (!file) {
      return createApiErrorResponse('BAD_REQUEST', 'Image file is required', 400, correlationId);
    }

    // Convert image to base64
    const buffer = Buffer.from(await file.arrayBuffer());
    const base64Image = buffer.toString('base64');
    const mimeType = file.type || 'image/jpeg';

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const systemPrompt = `Analyze this brand brief screenshot. Extract ALL relevant information and return as JSON:
{
  "brand_name": "",
  "products": [{ "name": "", "description": "", "price": "" }],
  "target_audience": "",
  "key_messages": [],
  "content_guidelines": [],
  "hashtags": [],
  "commission": "",
  "posting_requirements": "",
  "brand_voice": "",
  "additional_notes": ""
}
Return ONLY valid JSON, no other text.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`,
              },
            },
            {
              type: 'text',
              text: systemPrompt,
            },
          ],
        },
      ],
      max_tokens: 2048,
      temperature: 0.3,
    });

    const text = completion.choices[0]?.message?.content || '{}';

    // Parse JSON response
    let parsedBrief: ParsedBrief;
    try {
      // Remove markdown code blocks if present
      const cleanText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsedBrief = JSON.parse(cleanText);
    } catch {
      return createApiErrorResponse('INTERNAL', 'Failed to parse AI response as JSON', 500, correlationId);
    }

    return NextResponse.json({
      ok: true,
      data: parsedBrief,
      correlation_id: correlationId,
    });
  } catch (err: unknown) {
    console.error(`[${correlationId}] Brief analyzer error:`, err);
    return createApiErrorResponse(
      'INTERNAL',
      err instanceof Error ? err.message : 'Failed to analyze brief',
      500,
      correlationId
    );
  }
}
