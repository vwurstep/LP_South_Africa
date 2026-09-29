# Brief: fact-check place summaries against their own guidebook excerpts

Working dir: /Users/philippevonwurstemberger/Documents/Github Projects/LP_South_Africa
Input: data/private/summaries/qa-batch-<NN>.json — items {id, name, kind, chapter, summary,
excerpts[]} with the FULL excerpts (guide paragraphs that mention this place). Each summary
(1–3 sentences) was written by an agent from ONLY that item's excerpts.

Known failure modes (found in ~8% of a sample): a detail that belongs to a *different* place
mentioned in the same paragraph; an invented specific (a name, number, rule, price, tour
detail) that appears nowhere in the excerpts; a misread fact (reversed meaning, wrong time).

For each item check every specific claim in the summary against that item's excerpts:
- OK: all claims supported and about this place (a paragraph describing this place, or
  something located in/at it, counts). Paraphrase and mild adjectives are fine.
- FIX: any claim unsupported, about another place, or misstated. Write a corrected summary:
  1–3 sentences, ≤ ~60 words, plain text, only this item's excerpts, paraphrased. Keep the
  well-supported specifics of the original.
Be strict about specifics, lenient about tone. Don't "fix" style.

Output:
1. data/private/summaries/fix-qa-<NN>.json — {"<id>": "<corrected summary>"} ONLY for FIX items
   (write {} if none).
2. data/private/summaries/qa-batch-<NN>-report.md — id | FIX | reason (one line per FIX), totals.
Do the work yourself in this session — do not spawn subagents or forks. Helper scripts only in
data/private/summaries/work-qa-<NN>/. Don't modify other files.
Final reply: checked / OK / FIX counts, under 50 words.
