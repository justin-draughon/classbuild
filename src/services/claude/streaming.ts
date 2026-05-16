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
  /** Optional validation callback. Return {valid:false} to trigger a retry. */
  validate?: (text: string) => { valid: boolean; error?: string };
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
  let hasSeenContent = false;  // once we see real content, ignore reasoning text
  let accumulatedReasoning = ''; // collect reasoning for fallback if content stays empty

  // Detect CLI (Node) vs browser and use direct API calls in Node
  const isNode = typeof window === 'undefined' || typeof globalThis.fetch !== 'function';
  const baseUrl = getBaseUrl();

  try {
    let url: string;
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };

    if (isNode) {
      url = `${baseUrl}/chat/completions`;
    } else {
      url = '/api/proxy';
      headers['X-Target-Base-Url'] = baseUrl;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
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
          hasSeenContent = true;
          fullText += text;
          callbacks.onText?.(text);
        }

        const reasoning = (delta.reasoning as string | undefined) || (delta.reasoning_content as string | undefined);
        if (reasoning) {
          callbacks.onThinking?.(reasoning);
          accumulatedReasoning += reasoning;
          // When response_format is used (CLI / Node), reasoning and content are
          // cleanly separated — reasoning goes ONLY to onThinking, never to fullText.
          // When streaming without response_format (browser), fall back to treating
          // reasoning as content for models like kimi-k2.6 that emit output there.
          if (!hasSeenContent && !isNode) {
            fullText += reasoning;
            callbacks.onText?.(reasoning);
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    // Fallback: models like kimi-k2.6 sometimes emit real output in reasoning
    // fields while content only contains a tiny snippet (or nothing).
    // If reasoning is substantial, prefer it over content.
    const contentLen = fullText.trim().length;
    const reasoningLen = accumulatedReasoning.trim().length;
    if (reasoningLen > 1000 && reasoningLen > contentLen) {
      fullText = accumulatedReasoning;
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
      const result = await streamMessage(options, callbacks);
      // Default validation: suspiciously short output likely means the model
      // emitted only a tiny snippet (e.g. widget shell) and put real content
      // in reasoning that we failed to capture.
      if (!result || result.trim().length < 500) {
        throw new Error(`Response validation failed: content too short (${result?.length || 0} chars)`);
      }
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isRateLimit = msg.includes('429') || msg.toLowerCase().includes('rate');
      const isValidation = msg.includes('Response validation failed');
      if ((isRateLimit || isValidation) && attempt < maxRetries) {
        await new Promise(r => setTimeout(r, (attempt + 1) * 2000));
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

/**
 * Non-streaming request for CLI — returns the complete response text.
 * Use for JSON-heavy prompts where streaming reasoning tokens would
 * steal from the output token budget.
 */
export async function fetchComplete(
  options: StreamOptions,
  maxRetries = 3,
): Promise<string> {
  const { apiKey, model = resolveModel('opus'), system, messages, tools, maxTokens = 16000, validate } = options;

  const openAiMessages = system
    ? [{ role: 'system', content: system }, ...messages]
    : messages;

  const baseUrl = getBaseUrl();
  const url = baseUrl.endsWith('/v1') ? baseUrl : baseUrl + '/v1';

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const body = JSON.stringify({
    model,
    messages: openAiMessages,
    max_tokens: maxTokens,
    stream: false,
    ...(tools ? { tools } : {}),
  });

  // 10-minute timeout per attempt — Ollama Cloud can take 4-5 min for
  // complex prompts before headers arrive.
  const TIMEOUT_MS = 600_000;

  async function attempt(): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await globalThis.fetch(url + '/chat/completions', {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Ollama Cloud API error ${response.status}: ${errText.slice(0, 200)}`);
      }

      const data = await response.json() as Record<string, unknown>;
      const msg = (data.choices as Array<Record<string, unknown>>)?.[0]?.message as Record<string, unknown> | undefined;
      let content = String(msg?.content ?? '');
      const reasoning = String(msg?.reasoning ?? msg?.reasoning_content ?? '');
      // Fallback: if content is empty OR a tiny shell (< 500 chars) but reasoning
      // contains substantial structured output, use reasoning instead.
      const contentLen = content.trim().length;
      const reasoningLen = reasoning.trim().length;
      if (reasoningLen > 0) {
        if (!content.trim()) {
          content = reasoning;
        } else if (contentLen < 500 && reasoningLen > contentLen * 2) {
          // Content is a tiny widget shell; reasoning is the real payload
          content = reasoning;
        }
      }

      // Default validation: empty or near-empty content is a retryable failure.
      // This catches API flakiness where HTTP 200 is returned with no content.
      if (!content || content.length < 10) {
        throw new Error(`Response validation failed: Empty or truncated content (${content?.length || 0} chars)`);
      }

      // Run optional custom validation — if it fails, throw so the retry loop handles it.
      if (validate) {
        const vr = validate(content);
        if (!vr.valid) {
          throw new Error(`Response validation failed: ${vr.error || 'Invalid content'}`);
        }
      }

      return content;
    } finally {
      clearTimeout(timer);
    }
  }

  let lastErr: Error | undefined;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await attempt();
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      const errMsg = lastErr.message;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const causeMsg = (lastErr as any).cause instanceof Error ? (lastErr as any).cause.message : '';
      const isRetryable =
        errMsg.includes('Headers Timeout') ||
        causeMsg.includes('Headers Timeout') ||
        errMsg.includes('UND_ERR') ||
        causeMsg.includes('UND_ERR') ||
        errMsg.includes('ECONNRESET') ||
        causeMsg.includes('ECONNRESET') ||
        errMsg.includes('ETIMEDOUT') ||
        causeMsg.includes('ETIMEDOUT') ||
        errMsg.includes('aborted') ||
        causeMsg.includes('aborted') ||
        errMsg.includes('429') ||
        causeMsg.includes('429') ||
        errMsg.includes('rate') ||
        errMsg.includes('Response validation failed');
      if (!isRetryable || i >= maxRetries) throw lastErr;
      const delay = (i + 1) * 2000;
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastErr ?? new Error('Max retries exceeded');
}
