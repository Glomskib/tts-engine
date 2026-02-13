/**
 * Runway Prompt Builder
 *
 * Uses Claude to generate a specific, detailed Runway video prompt
 * from product data and skit context. Keeps output under 300 chars
 * to stay within Runway's effective prompt window.
 */

const RUNWAY_PROMPT_MAX_CHARS = 300;

// Map product categories to filming settings
const CATEGORY_SETTINGS: Record<string, string> = {
  skincare: "bright bathroom vanity with mirror",
  beauty: "well-lit vanity with ring light",
  health: "clean kitchen counter",
  supplement: "kitchen counter near water glass",
  supplements: "kitchen counter near water glass",
  wellness: "bright bedroom nightstand",
  fitness: "gym bench or home workout area",
  food: "kitchen island with natural light",
  beverage: "kitchen counter with natural light",
  drink: "kitchen counter with natural light",
  tech: "clean desk with monitor in background",
  electronics: "modern desk setup",
  home: "living room coffee table",
  pet: "living room floor with pet nearby",
  baby: "nursery changing table",
  fashion: "full-length mirror in bedroom",
  cleaning: "bright kitchen counter",
};

function inferSetting(category: string | null): string {
  if (!category) return "clean, well-lit indoor surface";
  const lower = category.toLowerCase();
  for (const [key, setting] of Object.entries(CATEGORY_SETTINGS)) {
    if (lower.includes(key)) return setting;
  }
  return "clean, well-lit indoor surface";
}

// Map category to a default action if no skit context
function inferAction(category: string | null, productName: string): string {
  if (!category) return `holds ${productName} at chest height, turning it to show label`;
  const lower = category.toLowerCase();
  if (lower.includes("skincare") || lower.includes("beauty"))
    return `applies ${productName} to hand, then holds bottle toward camera`;
  if (lower.includes("supplement") || lower.includes("health"))
    return `opens ${productName} bottle, shakes out capsule, holds bottle to camera`;
  if (lower.includes("food") || lower.includes("beverage") || lower.includes("drink"))
    return `picks up ${productName}, reads label, takes a sip/bite`;
  if (lower.includes("tech") || lower.includes("electronics"))
    return `unboxes ${productName}, holds it up to show design`;
  return `picks up ${productName}, reads label, holds it toward camera`;
}

export interface RunwayPromptInput {
  productName: string;
  brand: string;
  productImageUrl?: string | null;
  productDescription?: string | null;
  category?: string | null;
  scriptText?: string | null;
  onScreenText?: string | null;
}

export interface RunwayPromptResult {
  prompt: string;
  charCount: number;
  setting: string;
  action: string;
  aiGenerated: boolean;
  model?: string;
}

/**
 * Build a Runway video prompt using AI.
 * Falls back to a deterministic template if AI is unavailable.
 */
export async function buildRunwayPrompt(
  input: RunwayPromptInput
): Promise<RunwayPromptResult> {
  const setting = inferSetting(input.category ?? null);
  const action = inferAction(input.category ?? null, input.productName);

  // Try AI-powered prompt generation
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey) {
    try {
      return await buildWithAI(input, setting, action, apiKey);
    } catch (err) {
      console.error("[runway-prompt-builder] AI call failed, using template:", err);
    }
  }

  // Fallback: deterministic template
  return buildFromTemplate(input, setting, action);
}

async function buildWithAI(
  input: RunwayPromptInput,
  setting: string,
  action: string,
  apiKey: string
): Promise<RunwayPromptResult> {
  const systemPrompt = `You write Runway AI video prompts. Output ONLY the prompt, nothing else. Max ${RUNWAY_PROMPT_MAX_CHARS} characters. Be hyper-specific about the product, setting, action, and lighting. The product label must be legible.`;

  const userPrompt = [
    `Write a Runway video prompt for this product:`,
    `Product: ${input.brand} ${input.productName}`,
    input.category ? `Category: ${input.category}` : null,
    input.productDescription ? `Description: ${input.productDescription}` : null,
    input.scriptText ? `Script context: ${input.scriptText.slice(0, 200)}` : null,
    input.onScreenText ? `On-screen text: ${input.onScreenText}` : null,
    ``,
    `Requirements:`,
    `- Setting: ${setting}`,
    `- Action: person ${action}`,
    `- Include: soft natural lighting, 9:16 vertical, smartphone-shot feel`,
    `- Product label must be legible and centered in frame throughout`,
    `- Mention what the packaging looks like (bottle, box, tube, can, etc.)`,
    `- Max ${RUNWAY_PROMPT_MAX_CHARS} characters total`,
  ]
    .filter(Boolean)
    .join("\n");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      temperature: 0.6,
      messages: [
        { role: "user", content: systemPrompt + "\n\n" + userPrompt },
      ],
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`Claude ${response.status}: ${errText.slice(0, 200)}`);
  }

  const data = await response.json();
  const textBlock = data.content?.find(
    (b: { type: string; text?: string }) => b.type === "text"
  );
  let prompt = (textBlock?.text || "").trim();

  // Enforce max length
  if (prompt.length > RUNWAY_PROMPT_MAX_CHARS) {
    prompt = prompt.slice(0, RUNWAY_PROMPT_MAX_CHARS - 1).replace(/\s+\S*$/, "") + ".";
  }

  if (!prompt || prompt.length < 20) {
    // AI returned garbage — fall back to template
    return buildFromTemplate(input, setting, action);
  }

  return {
    prompt,
    charCount: prompt.length,
    setting,
    action,
    aiGenerated: true,
    model: "claude-haiku-4-5-20251001",
  };
}

function buildFromTemplate(
  input: RunwayPromptInput,
  setting: string,
  action: string
): RunwayPromptResult {
  // Build a deterministic prompt within char limit
  let prompt = `9:16 vertical smartphone video. ${setting}. Person ${action}. ${input.brand} ${input.productName} label legible and centered. Soft natural indoor lighting.`;

  if (prompt.length > RUNWAY_PROMPT_MAX_CHARS) {
    prompt = `9:16 vertical video. Person holds ${input.brand} ${input.productName} at chest height, label centered. ${setting}. Natural lighting.`;
  }

  if (prompt.length > RUNWAY_PROMPT_MAX_CHARS) {
    prompt = prompt.slice(0, RUNWAY_PROMPT_MAX_CHARS - 1).replace(/\s+\S*$/, "") + ".";
  }

  return {
    prompt,
    charCount: prompt.length,
    setting,
    action,
    aiGenerated: false,
  };
}
