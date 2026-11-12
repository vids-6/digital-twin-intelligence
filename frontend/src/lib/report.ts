/**
 * The investigate endpoint returns one `answer` string.
 *  - retrieval_only mode: fixed-format text built in backend/app/rag/investigator.py. We split it into its labelled paragraphs
 *    so the UI can lay it out as sections. The hypotheses/checks paragraphs are fixed template wording in that mode.
 *  - llm_generated mode: free text from the configured model; rendered as-is (light markdown).
 */
export interface ParsedAnswer {
  hypotheses?: string;
  checks?: string[];
  limitation?: string;
  weakEvidence?: string;
  free?: string;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const after = (p: string) => cap(p.slice(p.indexOf(':') + 1).trim());

export function parseAnswer(answer: string, mode: 'retrieval_only' | 'llm_generated'): ParsedAnswer {
  if (mode === 'llm_generated') return { free: answer };
  const out: ParsedAnswer = {};
  for (const raw of answer.split(/\n\s*\n/)) {
    const p = raw.trim();
    if (p.startsWith('Plausible hypotheses')) out.hypotheses = after(p);
    else if (p.startsWith('Recommended checks'))
      out.checks = after(p)
        .split(/;\s*|\.\s+(?=[A-Z])/)
        .map((s) => s.trim().replace(/\.$/, ''))
        .filter(Boolean)
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1));
    else if (p.startsWith('Evidence limitation')) out.limitation = after(p);
    else if (p.startsWith('Retrieved documentation is weak')) out.weakEvidence = p;
  }
  if (!out.hypotheses && !out.checks && !out.limitation && !out.weakEvidence) out.free = answer;
  return out;
}
