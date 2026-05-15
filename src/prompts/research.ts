import { extractJson, repairJson } from '../utils/jsonExtract';
import type { ResearchSource, ResearchDossier, SearchResult } from '../types/course';

export const RESEARCH_SYSTEM_PROMPT = `You are a research assistant building a research dossier for a university course chapter. Your job is to find real, verifiable academic sources and synthesize them into a structured dossier.

You will be given:
- The chapter topic, narrative, and key concepts
- A set of real web search results (titles, URLs, snippets) that have been pre-fetched for you

YOUR TASK:
1. Analyze the provided search results
2. Identify 5-8 high-quality academic sources (peer-reviewed papers, seminal textbooks, authoritative reviews)
3. Build a structured dossier as JSON output

OUTPUT FORMAT (ONLY JSON):
{
  "sources": [
    {
      "title": "Full paper/book title",
      "authors": "Author names",
      "year": "Publication year",
      "url": "URL if found",
      "doi": "DOI if available",
      "summary": "Brief summary of key findings relevant to the chapter",
      "relevance": "How this source supports the chapter content",
      "isVerified": true
    }
  ],
  "synthesisNotes": "How these sources collectively inform the chapter content and key pedagogical takeaways"
}

RULES:
- Use ONLY sources that appear in the provided search results
- Verify URLs are valid and match the source described
- If a DOI is not provided, leave it blank (do not hallucinate one)
- For any source you're unsure about, set isVerified: false
- If fewer than 5 real academic sources are found, note that in synthesisNotes
- Output ONLY valid JSON — no markdown wrappers, no preamble, no commentary`;

export function buildResearchUserPrompt(
  chapterTitle: string,
  chapterNarrative: string,
  keyConcepts: string[],
  searchResults: SearchResult[]
): string {
  const searchBlock = searchResults.length === 0
    ? 'No web search results were found. Please work from your training knowledge and clearly note which sources cannot be verified.'
    : searchResults.map((r, i) =>
        `[${i + 1}] ${r.title}\nURL: ${r.url}\nSnippet: ${r.snippet}`
      ).join('\n\n');

  return `Research the following chapter topic and build a dossier of real academic sources.

**Chapter**: "${chapterTitle}"
**Description**: ${chapterNarrative}
**Key concepts**: ${keyConcepts.join(', ')}

**SEARCH RESULTS** (use ONLY these for URLs and titles):
${searchBlock}

Build a JSON dossier using the sources above. DO NOT hallucinate URLs or DOIs.`;
}

export function parseResearchResponse(text: string, chapterNumber: number): ResearchDossier | null {
  try {
    let jsonStr = extractJson(text);
    if (!jsonStr) return null;

    let raw: unknown;
    try {
      raw = JSON.parse(jsonStr);
    } catch {
      raw = JSON.parse(repairJson(jsonStr));
    }

    return {
      chapterNumber,
      sources: (((raw as Record<string, unknown>).sources || []) as Record<string, unknown>[]).map((s): ResearchSource => ({
        title: (s.title as string) || '',
        authors: (s.authors as string) || '',
        year: (s.year as string) || '',
        url: s.url as string | undefined,
        doi: s.doi as string | undefined,
        summary: (s.summary as string) || '',
        relevance: (s.relevance as string) || '',
        isVerified: (s.isVerified as boolean) ?? false,
      })),
      synthesisNotes: ((raw as Record<string, unknown>).synthesisNotes as string) || '',
    };
  } catch {
    return null;
  }
}
