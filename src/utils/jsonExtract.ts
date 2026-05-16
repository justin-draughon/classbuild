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

export function extractJson(text: string, opts?: { minLength?: number; validate?: (obj: unknown) => boolean }): string | null {
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

  // Collect ALL valid candidates, then prefer the longest (most content)
  const candidates: Array<{ text: string; len: number }> = [];

  let i = 0;
  while (i < json.length) {
    const braceIdx = json.indexOf('{', i);
    if (braceIdx === -1) break;

    const candidate = _extractBalanced(json, braceIdx, '{', '}');
    if (candidate) {
      const cleaned = _cleanJson(candidate);
      const parsed = _tryParse(cleaned, opts?.validate);
      if (parsed) {
        candidates.push({ text: cleaned, len: cleaned.length });
      }
      i = braceIdx + candidate.length;
    } else {
      i = braceIdx + 1;
    }
  }

  i = 0;
  while (i < json.length) {
    const bracketIdx = json.indexOf('[', i);
    if (bracketIdx === -1) break;

    const candidate = _extractBalanced(json, bracketIdx, '[', ']');
    if (candidate) {
      const cleaned = _cleanJson(candidate);
      const parsed = _tryParse(cleaned, opts?.validate);
      if (parsed) {
        candidates.push({ text: cleaned, len: cleaned.length });
      }
      i = bracketIdx + candidate.length;
    } else {
      i = bracketIdx + 1;
    }
  }

  // Prefer the longest valid candidate (avoids tiny degenerate JSON)
  candidates.sort((a, b) => b.len - a.len);

  if (opts?.minLength && candidates.length) {
    const bigEnough = candidates.find(c => c.len >= opts.minLength!);
    if (bigEnough) return bigEnough.text;
  }

  if (candidates.length) return candidates[0].text;

  // No valid candidate parsed — return the first raw candidate for repair fallback
  const firstBrace = _extractBalanced(json, json.indexOf('{'), '{', '}');
  if (firstBrace) return _cleanJson(firstBrace);
  const firstBracket = _extractBalanced(json, json.indexOf('['), '[', ']');
  if (firstBracket) return _cleanJson(firstBracket);
  return null;
}

/** Clean trailing commas and whitespace. */
function _cleanJson(s: string): string {
  return s.replace(/,?\s*([}\]])/g, '$1');
}

/** Try to parse; optionally run a validator. Returns true if valid. */
function _tryParse(text: string, validate?: (obj: unknown) => boolean): boolean {
  try {
    const obj = JSON.parse(text);
    if (validate && !validate(obj)) return false;
    return true;
  } catch {
    try {
      const repaired = repairJson(text);
      const obj = JSON.parse(repaired);
      if (validate && !validate(obj)) return false;
      return true;
    } catch {
      return false;
    }
  }
}

/** Walk from startIdx and find the matching closeChar, respecting strings. */
function _extractBalanced(text: string, startIdx: number, openChar: '{' | '[', closeChar: '}' | ']'): string | null {
  let depth = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = startIdx; i < text.length; i++) {
    const ch = text[i];

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
        const raw = text.slice(startIdx, i + 1);
        return raw.replace(/,?\s*([}\]])/g, '$1');
      }
    }
  }

  return null;
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
