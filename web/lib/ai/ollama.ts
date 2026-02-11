/**
 * Ollama client for local LLM inference.
 * Used as a cost-saving fallback for simple tasks and when Claude is rate-limited.
 */

const OLLAMA_BASE_URL = process.env.OLLAMA_URL || "http://localhost:11434";

interface OllamaGenerateResponse {
  model: string;
  response: string;
  done: boolean;
}

interface OllamaChatResponse {
  model: string;
  message?: { role: string; content: string };
  done: boolean;
}

interface OllamaModel {
  name: string;
  size: number;
  modified_at: string;
}

/**
 * Call Ollama's /api/generate endpoint for simple prompt-in, text-out tasks.
 */
export async function callOllama(
  prompt: string,
  options?: {
    model?: string;
    system?: string;
    temperature?: number;
    maxTokens?: number;
  },
): Promise<string> {
  const model = options?.model || process.env.OLLAMA_DEFAULT_MODEL || "llama3.1:8b";

  const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt,
      system: options?.system || "",
      stream: false,
      options: {
        temperature: options?.temperature ?? 0.7,
        num_predict: options?.maxTokens ?? 2048,
      },
    }),
    signal: AbortSignal.timeout(120000), // 2 min timeout for local inference
  });

  if (!response.ok) {
    throw new Error(`Ollama error: ${response.status} ${response.statusText}`);
  }

  const data: OllamaGenerateResponse = await response.json();
  return data.response;
}

/**
 * Call Ollama's /api/chat endpoint (OpenAI-compatible messages format).
 */
export async function callOllamaChat(
  messages: { role: string; content: string }[],
  options?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
  },
): Promise<string> {
  const model = options?.model || process.env.OLLAMA_DEFAULT_MODEL || "llama3.1:8b";

  const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      options: {
        temperature: options?.temperature ?? 0.7,
        num_predict: options?.maxTokens ?? 2048,
      },
    }),
    signal: AbortSignal.timeout(120000),
  });

  if (!response.ok) {
    throw new Error(`Ollama chat error: ${response.status}`);
  }

  const data: OllamaChatResponse = await response.json();
  return data.message?.content || "";
}

/**
 * Check if Ollama is running and available.
 */
export async function isOllamaAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * List available models on the local Ollama instance.
 */
export async function listOllamaModels(): Promise<string[]> {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return [];
    const data = await response.json();
    return (data.models as OllamaModel[])?.map((m) => m.name) || [];
  } catch {
    return [];
  }
}

/**
 * Get Ollama health info for diagnostics.
 */
export async function getOllamaHealth(): Promise<{
  available: boolean;
  models: string[];
  latency_ms: number;
}> {
  const start = Date.now();
  try {
    const models = await listOllamaModels();
    return {
      available: true,
      models,
      latency_ms: Date.now() - start,
    };
  } catch {
    return {
      available: false,
      models: [],
      latency_ms: Date.now() - start,
    };
  }
}
