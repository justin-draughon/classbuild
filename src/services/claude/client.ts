// Ollama Cloud OpenAI-compatible API client (replaces Anthropic SDK)

const API_BASE = 'https://api.ollama.com/v1';

let currentKey = '';
let currentBaseUrl = API_BASE;

export function getClient(apiKey: string, baseUrl?: string): void {
  currentKey = apiKey;
  currentBaseUrl = baseUrl || API_BASE;
}

export function getApiKey(): string {
  return currentKey;
}

export function getBaseUrl(): string {
  return currentBaseUrl;
}

export const MODELS = {
  opus: 'kimi-k2.6',
  sonnet: 'kimi-k2.6',
  haiku: 'kimi-k2.6',
} as const;

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
