# Brief: place summaries from guidebook excerpts

Write short place summaries for a personal travel map app, based only on Lonely Planet
guidebook excerpts. Working dir: the repo root
(/Users/philippevonwurstemberger/Documents/Github Projects/LP_South_Africa).

Input: data/private/summaries/todo-<NN>.json — array of {id, name, category, subcategory,
area, region, price, excerpts[]}. Each excerpt is a guide paragraph mentioning the place;
some only mention it in passing or are about something bigger.
Output: data/private/summaries/done-<NN>.json — one JSON object {"<id>": "<summary>", ...}
with an entry for EVERY input id. Don't touch other files in that folder.

Rules:
- 1–3 sentences, max ~60 words, plain text. Neutral and concise, like a friend's note: what
  it is, why the guide recommends it, practical tips the excerpts give (booking, best time,
  price level, access, duration/difficulty of hikes). For towns/areas/parks: character and
  2–4 highlights the excerpts name there.
- Use ONLY what the excerpts say about this specific place. No invented facts. Paraphrase,
  don't copy long passages.
- If the excerpts say little, say what little they say ("Listed among the town's cafes.").
Process: read with Python, write the summaries yourself (no API calls), save, verify with
Python that every input id has a non-empty string. Final reply: one line with the count.
Scratch files: other agents run in parallel and share the scratchpad — put any helper
scripts in data/private/summaries/work-<NN>/ (your batch name), never in shared paths.
