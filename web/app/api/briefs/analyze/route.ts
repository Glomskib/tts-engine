import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import OpenAI from 'openai';

const getOpenAI = () => new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const runtime = 'nodejs';
export const maxDuration = 60;

async function extractTextFromImage(base64Image: string): Promise<string> {
  // Use GPT-4o vision to extract text from image
  const response = await getOpenAI().chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Extract ALL text from this image. Return only the text content, no formatting or explanation.' },
          {
            type: 'image_url',
            image_url: {
              url: base64Image.startsWith('data:') ? base64Image : `data:image/jpeg;base64,${base64Image}`,
            },
          },
        ],
      },
    ],
    max_tokens: 4000,
  });

  return response.choices[0]?.message?.content || '';
}

async function analyzeBriefWithClaude(briefText: string, creatorContext: any): Promise<any> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    throw new Error('AI service not configured');
  }

  const systemPrompt = `You are an expert UGC creator business analyst. Analyze this brand brief and extract ALL of the following:

BRIEF DETAILS:
- Brand name
- Campaign name (if any)
- Product(s) mentioned
- Content deliverables (number of videos, format, length requirements)
- Deadline / timeline
- Content guidelines or restrictions
- Required hashtags or mentions
- Usage rights (organic only, paid ads, whitelisting, etc.)

COMPENSATION ANALYSIS:
- Base pay (per video or total)
- Bonus structure (performance bonuses, milestone bonuses)
- Commission/affiliate component (if any)
- Product gifting value (estimate retail value)
- Total potential compensation

DEAL ASSESSMENT:
- Effective rate per video
- Effective hourly rate (estimate 2-4 hours per video for production)
- Deal rating: 🟢 Great (above market), 🟡 Fair (at market), 🔴 Below Market
- Market comparison note (brief context on typical rates)
- Red flags (if any: unreasonable usage rights, too many revisions, unclear payment terms)

RECOMMENDATIONS:
- Counter-offer suggestion (if below market)
- Negotiation points to raise
- Whether to accept, negotiate, or decline

Return as structured JSON with these exact keys:
{
  "brief_details": {
    "brand_name": string,
    "campaign_name": string | null,
    "products": string[],
    "deliverables": { "count": number, "format": string, "length": string }[],
    "deadline": string | null,
    "guidelines": string[],
    "required_hashtags": string[],
    "usage_rights": string
  },
  "compensation": {
    "base_pay": number,
    "base_pay_type": "per_video" | "total",
    "bonus_structure": { "type": string, "amount": number, "conditions": string }[],
    "commission_rate": number | null,
    "product_gifting_value": number,
    "total_potential": number
  },
  "assessment": {
    "rate_per_video": number,
    "hourly_rate": number,
    "rating": "🟢 Great" | "🟡 Fair" | "🔴 Below Market",
    "market_comparison": string,
    "red_flags": string[]
  },
  "recommendations": {
    "counter_offer": string | null,
    "negotiation_points": string[],
    "verdict": "accept" | "negotiate" | "decline"
  }
}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      messages: [
        {
          role: 'user',
          content: `${systemPrompt}\n\nCREATOR CONTEXT:\n- Active brands: ${creatorContext.brands || 'None yet'}\n- Products: ${creatorContext.products || 'None yet'}\n\nBRIEF TEXT:\n${briefText.slice(0, 12000)}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error('AI analysis failed');
  }

  const data = await response.json();
  const content = data.content[0]?.text || '';
  
  // Try to extract JSON from response
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return JSON.parse(jsonMatch[0]);
  }
  
  throw new Error('Failed to parse AI response');
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getApiAuthContext(request);
    if (!auth.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body
    const body = await request.json();
    const { text, image, pdf_text, type = 'text' } = body;

    let briefText = '';

    // Extract text based on input type
    if (type === 'image' && image) {
      console.log('[brief-analyze] Extracting text from image...');
      briefText = await extractTextFromImage(image);
    } else if (type === 'pdf' && pdf_text) {
      briefText = pdf_text;
    } else if (type === 'text' && text) {
      briefText = text;
    } else {
      return NextResponse.json(
        { error: 'Invalid request: provide text, image (base64), or pdf_text' },
        { status: 400 }
      );
    }

    if (!briefText || briefText.trim().length < 20) {
      return NextResponse.json(
        { error: 'Could not extract enough text from the brief. Please try again or paste text manually.' },
        { status: 400 }
      );
    }

    // Fetch creator context
    const [brandsRes, productsRes] = await Promise.all([
      supabaseAdmin
        .from('brands')
        .select('name')
        .eq('user_id', auth.user.id)
        .limit(20),
      supabaseAdmin
        .from('products')
        .select('name, brand')
        .eq('user_id', auth.user.id)
        .limit(50),
    ]);

    const creatorContext = {
      brands: (brandsRes.data || []).map(b => b.name).join(', '),
      products: (productsRes.data || []).map(p => `${p.name} (${p.brand})`).join(', '),
    };

    // Analyze with Claude
    console.log('[brief-analyze] Analyzing brief with Claude...');
    const analysis = await analyzeBriefWithClaude(briefText, creatorContext);

    return NextResponse.json({
      success: true,
      analysis,
      extracted_text: briefText.slice(0, 1000), // First 1000 chars for verification
    });

  } catch (error) {
    console.error('[brief-analyze] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
