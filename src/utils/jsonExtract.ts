/**
 * Robust JSON extraction from LLM responses that often violate "JSON only" instructions.
 *
 * Handles objects `{...}` and arrays `[...]`.
 * Strategies:
 * 1. Extract from ```json ... ``` code fences.
 * 2. Find balanced braces/brackets from the first `{` or `[`.
 * 3. Strip trailing commas.
 * 4. Remove BOM.
 */

export function extractJson(text: string): string | null {
  let json = text.trim();

  // Remove UTF-8 BOM if present
  if (json.charCodeAt(0) === 0xfeff) {
    json = json.slice(1);
  }

  // Strategy 1: code fence
  const fenceMatch = json.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) {
    json = fenceMatch[1].trim();
  }

  // Find first structural character: { or [
  const firstBrace = json.indexOf('{');
  const firstBracket = json.indexOf('[');

  // Determine whether we are extracting an object or an array
  let startIdx: number;
  let isArray: boolean;

  if (firstBrace === -1 && firstBracket === -1) return null;
  if (firstBrace === -1 || (firstBracket !== -1 && firstBracket < firstBrace)) {
    startIdx = firstBracket;
    isArray = true;
  } else {
    startIdx = firstBrace;
    isArray = false;
  }

  const openChar = isArray ? '[' : '{';
  const closeChar = isArray ? ']' : '}';

  let depth = 0;
  let endIdx = -1;
  let inString = false;
  let escapeNext = false;

  for (let i = startIdx; i < json.length; i++) {
    const ch = json[i];

    if (inString) {
      if (escapeNext) {
        escapeNext = false;
        continue;
      }
      if (ch === '\\') {
        escapeNext = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === openChar) {
      depth++;
    } else if (ch === closeChar) {
      depth--;
      if (depth === 0) {
        endIdx = i;
        break;
      }
    }
  }

  if (endIdx === -1) return null;

  json = json.slice(startIdx, endIdx + 1);

  // Strategy 3: strip trailing commas before } or ]
  json = json.replace(/,?\s*([}\]])/g, '$1');

  return json;
}

/**
 * Attempt to repair common LLM JSON mistakes so the app works with models
 * that don't strictly follow JSON formatting rules (e.g. unquoted keys).
 *
 * Fixes applied (safest → most aggressive):
 * 1. Remove leading/trailing Unicode BOM
 * 2. Remove control characters \x00-\x1F except \t, \n, \r
 * 3. Strip inline C-style comments
 * 4. Remove trailing commas before `}` or `]`
 * 5. Replace single-quoted strings with double-quoted ones
 * 6. Replace unquoted keys with quoted keys (only top-level + nested objects)
 */
export function repairJson(text: string): string {
  let s = text.trim();

  // 1. BOM
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);

  // 2. Remove illegal control chars except whitespace
  s = s.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');

  // 3. Remove C-style comments
  s = s.replace(/\/\*[\s\S]*?\*\//g, '');
  s = s.replace(/\/\/.*$/gm, '');

  // 4. Strip trailing commas
  s = s.replace(/,?\s*([}\]])/g, '$1');

  // 5. Replace single-quoted strings with double-quoted (naive, handles simple cases)
  s = s.replace(/'((?:[^'\\]|\\.)*)'/g, '"$1"');

  // 6. Unquoted keys -> quoted keys  (only where key is identifier-like)
  //    Only fix keys that appear outside strings.
  let result = '';
  let inString = false;
  let escapeNext = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (escapeNext) {
        escapeNext = false;
        result += ch;
        continue;
      }
      if (ch === '\\') {
        escapeNext = true;
        result += ch;
        continue;
      }
      if (ch === '"') inString = false;
      result += ch;
      continue;
    }
    if (ch === '"') {
      inString = true;
      result += ch;
      continue;
    }
    // Not in string — check for unquoted key before colon
    if (/[a-zA-Z_]/.test(ch)) {
      // Look ahead to see if this is followed by optional whitespace then colon
      let j = i + 1;
      while (j < s.length && /\s/.test(s[j])) j++;
      if (j < s.length && s[j] === ':') {
        // It's an unquoted key
        let k = i;
        while (k < s.length && /[a-zA-Z0-9_]/.test(s[k])) k++;
        // Only quote if it's a valid identifier
        if (k > i) {
          result += '"' + s.slice(i, k) + '"';
          i = k - 1;
          continue;
        }
      }
    }
    result += ch;
  }

  return result;
}
