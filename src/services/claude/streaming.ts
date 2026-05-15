// OpenAI-compatible streaming client for Ollama Cloud (replaces Anthropic SDK)
// Works with any OpenAI-compatible endpoint including Ollama Cloud, LiteLLM, etc.

import { getBaseUrl, resolveModel, type ThinkingBudget } from './client';

export interface WebSearchResult {
  title: string;
  url: string;
  pageAge?: string | null;
}

export interface StreamCallbacks {
  onText?: (text: string) => void;
  onThinking?: (text: string) => void;
  onToolUse?: (name: string, input: Record<string, unknown>) => void;
  onWebSearch?: (query: string) => void;
  onWebSearchResults?: (results: WebSearchResult[]) => void;
  onDone?: (fullText: string) => void;
  onError?: (error: Error) => void;
}

interface MessageParam {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface StreamOptions {
  apiKey: string;
  model?: string;
  system?: string;
  messages: MessageParam[];
  thinkingBudget?: ThinkingBudget;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tools?: any[];
  maxTokens?: number;
}

async function* sseReader(reader: ReadableStreamDefaultReader<Uint8Array>): AsyncGenerator<Record<string, unknown>> {
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') continue;
      try {
        yield JSON.parse(data) as Record<string, unknown>;
      } catch {
        // ignore malformed SSE lines
      }
    }
  }

  if (buffer.startsWith('data:')) {
    const data = buffer.slice(5).trim();
    if (data !== '[DONE]') {
      try {
        yield JSON.parse(data) as Record<string, unknown>;
      } catch {
        // ignore
      }
    }
  }
}

export async function streamMessage(
  options: StreamOptions,
  callbacks: StreamCallbacks
): Promise<string> {
  const {
    apiKey,
    model = resolveModel('sonnet'),
    system,
    messages,
    maxTokens = 16000,
  } = options;

  const openAiMessages: Array<{ role: string; content: string }> = system
    ? [{ role: 'system', content: system }, ...messages.map(m => ({ role: m.role, content: m.content }))]
    : messages.map(m => ({ role: m.role, content: m.content }));

  let fullText = '';

  try {
    const response = await fetch('/api/proxy', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-Target-Base-Url': getBaseUrl(),
      },
      body: JSON.stringify({
        model,
        messages: openAiMessages,
        max_tokens: maxTokens,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => 'Unknown error');
      throw new Error(`HTTP ${response.status}: ${errText}`);
    }

    if (!response.body) {
      throw new Error('No response body');
    }

    const reader = response.body.getReader();

    try {
      for await (const parsed of sseReader(reader)) {
        const choices = parsed.choices as Array<Record<string, unknown>> | undefined;
        if (!choices || choices.length === 0) continue;

        const delta = choices[0]?.delta as Record<string, unknown> | undefined;
        if (!delta) continue;

        const text = delta.content as string | undefined;
        if (text) {
          fullText += text;
          callbacks.onText?.(text);
        }

        const reasoning = (delta.reasoning as string | undefined) || (delta.reasoning_content as string | undefined);
        if (reasoning) {
          callbacks.onThinking?.(reasoning);
          // kimi-k2.6 sends output in reasoning, not content — treat it as text too
          if (!text) {
            fullText += reasoning;
            callbacks.onText?.(reasoning);
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    callbacks.onDone?.(fullText);
    return fullText;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    callbacks.onError?.(err);
    throw err;
  }
}

export async function streamWithRetry(
  options: StreamOptions,
  callbacks: StreamCallbacks,
  maxRetries = 3,
): Promise<string> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await streamMessage(options, callbacks);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isRateLimit = msg.includes('429') || msg.toLowerCase().includes('rate');
      if (isRateLimit && attempt < maxRetries) {
        await new Promise(r => setTimeout(r, (attempt + 1) * 1500));
        continue;
      }
      throw err;
    }
  }
  throw new Error('Max retries exceeded');
}

// Non-streaming stub — kept for backward compatibility with any lingering imports
export async function sendMessage(
  options: Omit<StreamOptions, 'maxTokens'> & { maxTokens?: number }
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const fullText = await streamMessage(
    { ...options, maxTokens: options.maxTokens ?? 16000 },
    {}
  );
  return { content: [{ type: 'text', text: fullText }] };
}
