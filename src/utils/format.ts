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
 * `wrapType` is legacy; `extractJson` now auto-detects objects vs arrays.
 */
export function parseJson(text: string, _wrapType?: '[' | '{'): unknown {
  let jsonStr = extractJson(text);
  if (!jsonStr) {
    throw new SyntaxError('No valid JSON found in response');
  }

  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      return JSON.parse(jsonStr);
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
