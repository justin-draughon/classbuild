import { extractJson, repairJson } from './jsonExtract';

/**
 * String helpers shared between the web app (BuildPage) and the headless CLI
 * (scripts/generate-course.ts). Kept deliberately small and side-effect-free
 * so both entry points can import cheaply.
 */

/** Lowercase, hyphenate, clip to 40 chars. For filenames and URL slugs. */
export function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}

/**
 * Extract a standalone HTML document from a Claude response that may wrap it
 * in a ```html fence, start mid-prose, or include commentary after </html>.
 */
export function extractHtml(text: string): string {
  const htmlMatch = text.match(/```html\s*\n?([\s\S]*?)\n?```/);
  if (htmlMatch) return htmlMatch[1];
  const trimmed = text.trim();
  if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) return trimmed;
  const docIdx = text.indexOf('<!DOCTYPE');
  const htmlIdx = text.indexOf('<html');
  const startIdx = docIdx !== -1 ? docIdx : htmlIdx;
  if (startIdx !== -1) {
    const endIdx = text.lastIndexOf('</html>');
    if (endIdx !== -1) return text.slice(startIdx, endIdx + 7);
    return text.slice(startIdx);
  }
  return text;
}

/**
 * Parse JSON from an LLM response. Tolerates:
 *  - ```json fences
 *  - leading / trailing prose or thinking text containing stray braces
 *  - trailing commas
 *  - occasional unescaped quotes inside strings (up to 10 repair attempts)
 *  - single-quoted strings, unquoted keys, comments (via repairJson)
 *
 * `wrapType` requests the expected top-level shape. Array mode accepts common
 * wrappers like `{ questions: [...] }` and `{ data: { slides: [...] } }`.
 */
export function parseJson(text: string, wrapType?: '[' | '{'): unknown {
  let jsonStr = extractJson(text);
  if (!jsonStr) {
    throw new SyntaxError('No valid JSON found in response');
  }

  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const parsed = JSON.parse(jsonStr);
      // Unwrap common LLM wrappers: { "questions": [...] } → [...]
      if (wrapType === '[') {
        return coerceArrayJson(parsed);
      }
      if (wrapType === '{') {
        return coerceObjectJson(parsed);
      }
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const keys = Object.keys(parsed);
        if (keys.length === 1 && Array.isArray(parsed[keys[0]])) {
          return parsed[keys[0]];
        }
      }
      return parsed;
    } catch (e) {
      if (e instanceof SyntaxError) {
        const posMatch = e.message.match(/position (\d+)/);
        if (posMatch) {
          const pos = parseInt(posMatch[1]);
          if (pos >= 0 && pos < jsonStr.length && jsonStr[pos] === '"') {
            jsonStr = jsonStr.slice(0, pos) + '\\"' + jsonStr.slice(pos + 1);
            continue;
          }
        }
      }
      // Try aggressive repair on first failure, then give up
      if (attempt === 0) {
        jsonStr = repairJson(jsonStr);
        continue;
      }
      throw e;
    }
  }

  throw new SyntaxError('Failed to parse JSON after 10 attempts');
}

function coerceArrayJson(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed;

  const candidates = findArrayCandidates(parsed);
  if (candidates.length > 0) {
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0].value;
  }

  throw new SyntaxError('Expected JSON array or object containing an array');
}

function coerceObjectJson(parsed: unknown): Record<string, unknown> {
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const record = parsed as Record<string, unknown>;
    const keys = Object.keys(record);
    if (keys.length === 1) {
      const only = record[keys[0]];
      if (only && typeof only === 'object' && !Array.isArray(only)) {
        return only as Record<string, unknown>;
      }
    }
    return record;
  }
  throw new SyntaxError('Expected JSON object');
}

function findArrayCandidates(value: unknown, depth = 0): Array<{ value: unknown[]; score: number }> {
  if (!value || typeof value !== 'object' || depth > 3) return [];
  if (Array.isArray(value)) {
    const objectBonus = value.some(item => item && typeof item === 'object') ? 1000 : 0;
    return [{ value, score: objectBonus + value.length * 100 - depth }];
  }

  const candidates: Array<{ value: unknown[]; score: number }> = [];
  for (const child of Object.values(value as Record<string, unknown>)) {
    candidates.push(...findArrayCandidates(child, depth + 1));
  }
  return candidates;
}
