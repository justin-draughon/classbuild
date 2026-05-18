// OpenAI-compatible API client configuration.

const API_BASE = 'https://ollama.com/v1';

let currentKey = '';
let currentBaseUrl = API_BASE;
let customModel = '';

export function getClient(apiKey: string, baseUrl?: string, modelName?: string): void {
  currentKey = apiKey;
  currentBaseUrl = baseUrl || API_BASE;
  customModel = modelName || '';
}

export function getApiKey(): string {
  return currentKey;
}

export function getBaseUrl(): string {
  if (currentBaseUrl && currentBaseUrl !== API_BASE) return normalizeOpenAiBaseUrl(currentBaseUrl);
  // Fallback: read from persisted apiStore localStorage
  try {
    const raw = localStorage.getItem('classbuild-api-keys');
    if (raw) {
      const parsed = JSON.parse(raw);
      const state = parsed.state ?? parsed;
      const url = state.llmBaseUrl;
      if (typeof url === 'string' && url.trim()) return normalizeOpenAiBaseUrl(url);
    }
  } catch { /* ignore */ }
  return normalizeOpenAiBaseUrl(currentBaseUrl || API_BASE);
}

export function getCustomModel(): string {
  return customModel;
}

export const MODELS = {
  opus: 'kimi-k2.6',
  sonnet: 'kimi-k2.6',
  haiku: 'kimi-k2.6',
} as const;

export function normalizeOpenAiBaseUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim().replace(/\/+$/, '');
  if (!trimmed) return API_BASE;
  if (trimmed.endsWith('/v1')) return trimmed;
  return `${trimmed}/v1`;
}

export function resolveModel(fallback: keyof typeof MODELS = 'sonnet'): string {
  if (customModel) return customModel;
  // Fallback: read from persisted apiStore localStorage (zustand persist format)
  try {
    const raw = localStorage.getItem('classbuild-api-keys');
    if (raw) {
      const parsed = JSON.parse(raw);
      const state = parsed.state ?? parsed;
      const name = state.customModelName;
      if (typeof name === 'string' && name.trim()) return name.trim();
    }
  } catch { /* ignore */ }
  return MODELS[fallback];
}

export type ThinkingBudget = 'max' | 'high' | 'medium' | 'low';

const BUDGET_TOKENS: Record<ThinkingBudget, number> = {
  max: 32000,
  high: 16000,
  medium: 8000,
  low: 4000,
};

export function getThinkingTokens(budget: ThinkingBudget): number {
  return BUDGET_TOKENS[budget];
}
