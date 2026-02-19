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
import { callAnthropicAPI } from "./anthropic";
import { trackUsage } from "@/lib/command-center/ingest";

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
// Internal Claude caller — delegates to centralized anthropic.ts (tracked)
// ---------------------------------------------------------------------------

async function callClaude(
  prompt: string,
  options?: {
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
    model?: string;
    correlationId?: string;
  },
): Promise<{ text: string; model: string }> {
  const model = options?.model || "claude-sonnet-4-20250514";
  const result = await callAnthropicAPI(prompt, {
    model,
    systemPrompt: options?.systemPrompt,
    temperature: options?.temperature,
    maxTokens: options?.maxTokens || 2048,
    agentId: "ai-router",
    requestType: "routed_chat",
    correlationId: options?.correlationId,
  });
  return { text: result.text, model: result.model };
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
    correlationId?: string;
  },
): Promise<AIRouterResult> {
  // Force provider override
  if (options?.forceProvider === "ollama") {
    const start = Date.now();
    const response = await callOllama(prompt, {
      system: options.systemPrompt,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
    });
    trackUsage({
      provider: "ollama",
      model: "llama3.1:8b",
      input_tokens: 0,
      output_tokens: 0,
      latency_ms: Date.now() - start,
      request_type: taskType,
      agent_id: "ai-router",
      correlation_id: options?.correlationId,
      meta: { note: "local inference, no token metering" },
    }).catch(() => {});
    return { response, model: "llama3.1:8b", provider: "ollama" };
  }

  if (options?.forceProvider === "claude") {
    const result = await callClaude(prompt, { ...options, correlationId: options?.correlationId });
    return { response: result.text, model: result.model, provider: "claude" };
  }

  // Auto-route based on task type
  if (OLLAMA_TASKS.includes(taskType)) {
    const ollamaUp = await isOllamaAvailable();
    if (ollamaUp) {
      try {
        const start = Date.now();
        const response = await callOllama(prompt, {
          system: options?.systemPrompt,
          temperature: options?.temperature,
          maxTokens: options?.maxTokens,
        });
        trackUsage({
          provider: "ollama",
          model: "llama3.1:8b",
          input_tokens: 0,
          output_tokens: 0,
          latency_ms: Date.now() - start,
          request_type: taskType,
          agent_id: "ai-router",
          correlation_id: options?.correlationId,
          meta: { note: "local inference, no token metering" },
        }).catch(() => {});
        return { response, model: "llama3.1:8b", provider: "ollama" };
      } catch {
        // Fall through to Claude as fallback
        console.warn("[ai-router] Ollama failed, falling back to Claude");
      }
    }
  }

  // Use Claude for quality-critical tasks or as fallback
  const result = await callClaude(prompt, { ...options, correlationId: options?.correlationId });
  return { response: result.text, model: result.model, provider: "claude" };
}
