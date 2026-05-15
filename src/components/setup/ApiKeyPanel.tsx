import { useCallback, useEffect, useRef } from 'react';
import { useApiStore } from '../../store/apiStore';
import { getClient, MODELS } from '../../services/claude/client';
import { ProviderCard } from './ProviderCard';
import { CLAUDE_CONFIG, GEMINI_CONFIG } from './providerConfigs';

export function ApiKeyPanel() {
  const {
    claudeApiKey, geminiApiKey, llmBaseUrl,
    claudeKeyValid, geminiKeyValid,
    isValidatingClaude, isValidatingGemini,
    setClaudeApiKey, setGeminiApiKey, setLlmBaseUrl,
    setClaudeKeyValid, setGeminiKeyValid,
    setIsValidatingClaude, setIsValidatingGemini,
  } = useApiStore();

  const validateClaude = useCallback(async () => {
    if (!claudeApiKey.trim()) return;
    setIsValidatingClaude(true);
    try {
      getClient(claudeApiKey.trim(), llmBaseUrl);
      const response = await fetch(`${llmBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${claudeApiKey.trim()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: MODELS.haiku,
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 10,
        }),
      });
      setClaudeKeyValid(response.ok);
    } catch {
      setClaudeKeyValid(false);
    } finally {
      setIsValidatingClaude(false);
    }
  }, [claudeApiKey, llmBaseUrl, setClaudeKeyValid, setIsValidatingClaude]);

  const validateGemini = useCallback(async () => {
    if (!geminiApiKey.trim()) return;
    setIsValidatingGemini(true);
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${geminiApiKey.trim()}`,
      );
      setGeminiKeyValid(res.ok);
    } catch {
      setGeminiKeyValid(false);
    } finally {
      setIsValidatingGemini(false);
    }
  }, [geminiApiKey, setGeminiKeyValid, setIsValidatingGemini]);

  // Auto-validate stored keys on mount
  const mountedRef = useRef(false);
  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    if (claudeApiKey.trim() && claudeKeyValid === null) validateClaude();
    if (geminiApiKey.trim() && geminiKeyValid === null) validateGemini();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-5">
      <h3 className="text-sm font-medium text-text-primary">
        Connect Your Services
      </h3>
      <div className="flex items-start gap-2.5 rounded-lg bg-emerald-500/5 border border-emerald-500/15 px-3.5 py-3">
        <svg className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        <div>
          <p className="text-xs font-medium text-emerald-400 mb-0.5">Your keys never leave your computer</p>
          <p className="text-xs text-text-muted leading-relaxed">
            ClassBuild has no server and no accounts. Everything happens right here in your browser — we never see, store, or have access to your keys.
          </p>
        </div>
      </div>
      <div className="space-y-3">
        <label className="text-xs text-text-muted">LLM Base URL (optional)</label>
        <input
          type="text"
          value={llmBaseUrl}
          onChange={(e) => setLlmBaseUrl(e.target.value)}
          placeholder="https://api.ollama.com/v1"
          className="w-full px-3 py-2 rounded-lg bg-bg-elevated border border-violet-500/15 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-violet-500/40 transition-colors"
        />
        <p className="text-[11px] text-text-muted/70">
          For Ollama Cloud, leave as default. For LiteLLM or other OpenAI-compatible proxies, enter the base URL.
        </p>
      </div>
      <ProviderCard
        config={CLAUDE_CONFIG}
        apiKey={claudeApiKey}
        keyValid={claudeKeyValid}
        isValidating={isValidatingClaude}
        setKey={setClaudeApiKey}
        validate={validateClaude}
        defaultExpanded={!claudeApiKey}
      />
      <ProviderCard
        config={GEMINI_CONFIG}
        apiKey={geminiApiKey}
        keyValid={geminiKeyValid}
        isValidating={isValidatingGemini}
        setKey={setGeminiApiKey}
        validate={validateGemini}
      />
    </div>
  );
}
