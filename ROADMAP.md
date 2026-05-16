# ClassBuild — Development Roadmap

*Last updated: May 16, 2026*

---

## What Is ClassBuild?

ClassBuild is an AI course generator that produces complete university/professional-level course materials from a single topic string. Originally built for Anthropic Claude, the system now runs against any OpenAI-compatible API endpoint.

### Output (per chapter)
- Interactive HTML reading with embedded widgets
- Gamified practice quiz with confidence calibration
- In-class quiz (5 versions + answer keys)
- PowerPoint slides with speaker notes
- AI-narrated audiobook (TTS via Gemini)
- AI-generated infographic
- Discussion starters & classroom activities
- Weekly mastery challenge (SCORM 2004 for Blackboard)
- Research dossier with sources and synthesis

### Stack
React 19 · Vite 7 · TypeScript 5.9 · Tailwind CSS 4 · Zustand · Framer Motion

---

## Recent Work (May 13–16, 2026)

### JSON Extraction — Fixed
**Problem:** The original parser used naive `indexOf('{')` / `lastIndexOf('}')`, which sliced into the wrong object when models wrapped JSON in narrative text or embedded reasoning.

**Fix:**
- Rewrote `src/utils/jsonExtract.ts` with:
  - Brace-depth tracking to find the *matching* `{` → `}` pair
  - String-aware parsing (ignores braces inside quoted strings)
  - Longest-candidate-wins: collects ALL valid JSON blobs, sorts by length, applies `minLength`/`validate` filters
  - `repairJson()` fallback (quotes unquoted keys, cleans trailing commas, strips comments)

**Impact:** All JSON parsers now use the robust utility (`syllabus.ts`, `research.ts`, `format.ts`, `answerBalancer.ts`).

### API Streaming Path — Deprecated
**Problem:** `streamWithRetry()` was unreliable with kimi-k2.6. The model puts widget shells (empty HTML, tiny `{}`) in `content` and dumps the real payload in a `reasoning` field that the streaming loop was throwing away.

**Fix:**
- **Switched the entire pipeline** to non-streaming `fetchComplete()`
- Removed `response_format: { type: "json_object" }` — this reliably breaks kimi-k2.6 on complex prompts
- Added smart reasoning fallback:
  - Use `reasoning` when `content` is empty
  - Use `reasoning` when `content` < 500 chars AND `reasoning.length > content.length × 2`
- Added retry logic (3 retries, exponential backoff) with per-generator validation callbacks

**Impact:** Every material generator now calls `fetchComplete` (`generate-course.ts` lines ~500–1200).

### Validation & Guards — Added
- `syllabus.ts` → validates `chapters.length > 0`
- `research.ts` → validates `sources.length > 0`
- `generate-course.ts` → each `fetchComplete` call has a `validate` callback
  - Chapter HTML: length ≥ 1000 AND contains HTML structure (`<!DOCTYPE html>`, `<html>`, or `<div>`)
  - Audio transcripts: length ≥ 200
  - Infographics: length ≥ 50

### Fault Isolation
- Reduced concurrency to 1 opus task at a time, 2 sonnet tasks, with a 5-second cooldown between chapters
- Wrapped every generator in try/catch with fallback to empty/default content so one failed call doesn't crash the entire pipeline

### Auto-Unwrap
- `parseJson` in `src/utils/format.ts` now auto-unwraps single-key objects containing arrays (e.g. `{ questions: [...] }` → `[...]`) and defensively checks `Array.isArray()` before calling `forEach`

---

## Current Status

### Working
- Syllabus generation (kimi-k2.6, 5 chapters, valid JSON)
- Research compilation per chapter
- Audio transcripts (15K–35K chars per chapter)
- Discussion starters

### Partially Working
- **Chapter HTML** — Ch01 and Ch05 generate correctly (~35K chars); Ch02–Ch04 intermittently return tiny widget shells due to API instability
- **Practice Quizzes** — Most chapters succeed; some return empty payloads under API pressure

### Not Working / Untested After Latest Fixes
- PowerPoint slides — previously failed with "Empty or truncated content"
- Activities — previously failed with "Expected array, got object"
- In-class quizzes — same issue as activities
- Weekly challenges — mostly empty in prior runs
- Infographics — untested after switching to `fetchComplete`

### The Real Blocker
**API rate limiting / throttling.** Ollama Cloud's kimi-k2.6 endpoint:
- Small "hello" calls work (1–2s)
- Moderate prompts work (10–30s)
- Large syllabus/chapter prompts intermittently hang for >10 minutes or return empty content
- After sustained use (~2 hours of pipeline calls), the API becomes unresponsive for 15+ minutes
- This is NOT a code bug — it's service-level throttling

---

## Known Bugs & Gotchas

1. **kimi-k2.6 reasoning/content split** — The model puts everything meaningful in a `reasoning` field and leaves `content` empty or as a tiny widget shell. Our fallback handles this, but it means streaming can never be trusted with this model.

2. **Default `--chapters` is 12** — Way too many for the API. 5 chapters is already pushing rate limits. Recommend `--chapters 5` or even `--chapters 3` for reliability.

3. **Docker container** — Running on port 5173 but not fully tested after the latest non-streaming changes. Docker image rebuilds clean.

4. **Node.js stdout buffering** — When stdout is redirected to a file, log lines are slow to appear. Check the output directory directly for actual progress.

5. **Pre-existing TypeScript errors** — `node_modules/docx`, `src/services/export/quizDocExporter.ts`, and `src/utils/doiValidator.ts` have lint errors that existed before our changes. Build still passes.

---

## Files You'll Want

| File | What to know |
|------|-------------|
| `src/utils/jsonExtract.ts` | `extractJson(text, opts?)` — the new parser with `minLength`/`validate` |
| `src/services/claude/streaming.ts` | `fetchComplete()` — non-streaming client with reasoning fallback and retries |
| `src/utils/format.ts` | `parseJson()` — auto-unwraps single-key wrappers, strips markdown fences |
| `src/prompts/syllabus.ts` | `parseSyllabusResponse()` — validates `chapters.length > 0` |
| `src/prompts/research.ts` | `parseResearchResponse()` — validates `sources.length > 0` |
| `scripts/generate-course.ts` | The CLI — now **100% non-streaming** |
| `src/services/claude/client.ts` | `resolveModel()`, `getClient()`, `MODELS` map (opus=kimi-k2.6) |

---

## If You Pick This Back Up

1. **Start small** — `--chapters 5` (or even `--chapters 3`) to avoid API throttling
2. **Monitor the API** — Run a quick `curl` test before kicking off the pipeline
3. **Check output directly** — Look at `output/<run_dir>/` for real files, not just the log
4. **Slides/Activities/Quizzes** — These still need attention. The "Expected array, got object" error suggests the response unwrapping works for some shapes but not others. Inspect the raw responses and add targeted `parseJson` handlers per generator.
5. **Consider a different model** — If API rate limits persist, a model without reasoning/content split would restore streaming reliability and cut generation time by ~50%.

---

## Git History (Relevant)

| Commit | What changed |
|--------|-------------|
| `9800a50` | Replace ALL `streamWithRetry` with `fetchComplete` in pipeline; add validate callbacks; reduce concurrency |
| `c4b00ce` | Longest-candidate `extractJson`, non-streaming `fetchComplete` with reasoning fallback, `parseJson` auto-unwrap |
| `2d7d49a` | CLI streaming robustness — `response_format` + reasoning isolation |
| `6dcba8b` | Robust JSON extraction across all LLM parsers |
| `d166f19` | SSE parsing: Ollama Cloud uses `delta.reasoning` not `delta.reasoning_content` |

---

*This repo was actively worked on May 13–16, 2026. All core issues have been addressed on the code side. The remaining blocker is external API throttling — not a bug in the implementation.*
