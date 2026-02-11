/**
 * AI Router — smart model selection for FlashFlow.
 *
 * Claude for quality-critical tasks (script generation, enrichment).
 * Ollama for simple/bulk tasks (classification, formatting, summarization).
 * Falls back gracefully if one provider is unavailable.
 *
 * IMPORTANT: This is ADDITIVE. Existing direct Claude calls in generate-skit,
 * score-skit, etc. continue to work unchanged. The router is for NEW features
 * and for migrating bulk tasks to local inference over time.
 */

import { callOllama, isOllamaAvailable } from "./ollama";

// ---------------------------------------------------------------------------
// Task types — determines which provider handles the request
// ---------------------------------------------------------------------------

export type TaskType =
  | "script_generation"   // Claude — core product, quality critical
  | "ai_enrichment"       // Claude — nuanced analysis
  | "script_variation"    // Ollama OK — variations of existing scripts
  | "product_formatting"  // Ollama — simple text restructuring
  | "classification"      // Ollama — categorization tasks
  | "summarization"       // Ollama — basic summarization
  | "seo_meta"            // Ollama — meta descriptions, title tags
  | "email_template"      // Ollama — filling in email templates
  | "data_extraction"     // Ollama — pulling structured data from text
  | "general";            // Claude — default for anything unspecified

const OLLAMA_TASKS: TaskType[] = [
  "script_variation",
  "product_formatting",
  "classification",
  "summarization",
  "seo_meta",
  "email_template",
  "data_extraction",
];

// ---------------------------------------------------------------------------
// Internal Claude caller (raw fetch, same pattern as existing endpoints)
// ---------------------------------------------------------------------------

async function callClaude(
  prompt: string,
  options?: {
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
    model?: string;
  },
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const model = options?.model || "claude-sonnet-4-20250514";
  const messages: { role: string; content: string }[] = [];

  if (options?.systemPrompt) {
    messages.push({ role: "user", content: options.systemPrompt + "\n\n" + prompt });
  } else {
    messages.push({ role: "user", content: prompt });
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: options?.maxTokens || 2048,
      temperature: options?.temperature ?? 0.7,
      messages,
    }),
    signal: AbortSignal.timeout(90000),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`Claude API error ${response.status}: ${errText.slice(0, 200)}`);
  }

  const data = await response.json();
  const textBlock = data.content?.find(
    (b: { type: string; text?: string }) => b.type === "text",
  );
  return textBlock?.text || "";
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export interface AIRouterResult {
  response: string;
  model: string;
  provider: "claude" | "ollama";
}

export async function routeAIRequest(
  prompt: string,
  taskType: TaskType,
  options?: {
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
    forceProvider?: "claude" | "ollama";
  },
): Promise<AIRouterResult> {
  // Force provider override
  if (options?.forceProvider === "ollama") {
    const response = await callOllama(prompt, {
      system: options.systemPrompt,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
    });
    return { response, model: "llama3.1:8b", provider: "ollama" };
  }

  if (options?.forceProvider === "claude") {
    const response = await callClaude(prompt, options);
    return { response, model: "claude-sonnet-4-20250514", provider: "claude" };
  }

  // Auto-route based on task type
  if (OLLAMA_TASKS.includes(taskType)) {
    const ollamaUp = await isOllamaAvailable();
    if (ollamaUp) {
      try {
        const response = await callOllama(prompt, {
          system: options?.systemPrompt,
          temperature: options?.temperature,
          maxTokens: options?.maxTokens,
        });
        return { response, model: "llama3.1:8b", provider: "ollama" };
      } catch {
        // Fall through to Claude as fallback
        console.warn("[ai-router] Ollama failed, falling back to Claude");
      }
    }
  }

  // Use Claude for quality-critical tasks or as fallback
  const response = await callClaude(prompt, options);
  return { response, model: "claude-sonnet-4-20250514", provider: "claude" };
}
