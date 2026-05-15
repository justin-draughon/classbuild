export interface ProviderConfig {
  id: 'claude' | 'gemini';
  heading: string;
  connectedHeading: string;
  tagline: string;
  required: boolean;
  costNote: string;
  deepLink: string;
  deepLinkLabel: string;
  steps: { text: string }[];
  placeholder: string;
  warnings: { type: 'alert' | 'info'; text: string }[];
  validationFailHint: string;
}

export const CLAUDE_COST_NOTE =
  'Ollama Cloud — pay-as-you-go via Ollama credits.';

export const GEMINI_COST_NOTE =
  'Free to start — Google gives you $300 in trial credits. Covers infographics plus voice narration.';

export const CLAUDE_CONFIG: ProviderConfig = {
  id: 'claude',
  heading: 'Connect LLM Provider',
  connectedHeading: 'Connected to LLM',
  tagline:
    'Your OpenAI-compatible API key (Ollama Cloud, LiteLLM, etc.) powers all course generation. This connection is required.',
  required: true,
  costNote: CLAUDE_COST_NOTE,
  deepLink: 'https://ollama.com/blog/ollama-cloud',
  deepLinkLabel: 'Open Ollama Cloud',
  steps: [
    { text: 'Create a free account at ollama.com' },
    { text: 'Add API credits in your account settings' },
    { text: 'Create an API key and paste it below' },
  ],
  placeholder: 'sk-...',
  warnings: [
    {
      type: 'info',
      text: 'Your API key is only shown once when created — save it somewhere safe.',
    },
  ],
  validationFailHint:
    'Check that you copied the full key and that your account has API credits. If using a custom endpoint, ensure the URL is correct.',
};

export const GEMINI_CONFIG: ProviderConfig = {
  id: 'gemini',
  heading: 'Add infographics & voice narration',
  connectedHeading: 'Infographics & voice connected',
  tagline:
    'Generate custom illustrations for each chapter and a full spoken audiobook from your transcripts.',
  required: false,
  costNote: GEMINI_COST_NOTE,
  deepLink: 'https://aistudio.google.com/apikey',
  deepLinkLabel: 'Open Google AI Studio',
  steps: [
    { text: 'Sign in to Google AI Studio with your Google account' },
    { text: 'Click "Create API Key" and copy it' },
    { text: 'Enable Cloud billing if prompted (free trial works)' },
  ],
  placeholder: 'AIza...',
  warnings: [
    {
      type: 'info',
      text: 'School/university Google accounts may block AI Studio. Use a personal Google account if needed.',
    },
    {
      type: 'info',
      text: 'Image generation requires Cloud billing to be enabled, but the $300 free trial covers it.',
    },
  ],
  validationFailHint:
    'Check that you copied the full key from AI Studio and that your Google account has API access enabled.',
};

export const PROVIDER_CONFIGS = [CLAUDE_CONFIG, GEMINI_CONFIG] as const;
