# OBDX Library: audit and remediation

The OBDX Library (Knowledge Center) answers OBDX questions from Oracle's manuals and the bank's own documents. This
report records what was inspected, what was wrong and how it was found, what was changed, and how it is measured. It
is kept with the code so later changes can be checked against it.

## 1. How the Library works (traced end to end)

```
Oracle's documentation index ─► OracleLibrary (releases, library pages, PDFs; HTTPS to Oracle's hosts only)
folders, uploads ──────────────┐            │ conditional GET (ETag), PdfSafety check
                               ▼            ▼
                     KnowledgeImporter: read (PDFBox pages + bookmarks; Word, text, Markdown, HTML)
                               │  ManualSplitter: sections at the bookmarks / headings, with their parents and pages
                               │  KnowledgeRevisions: a changed file replaces its older revision, notes go to review
                               ▼
        knowledge_document / knowledge_chunk (full-text index + embedding per section; which model embedded it)
                               │
  question (+ conversation) ─► KnowledgeService.retrieve
                               │  standalone(): a follow-up rewritten from the conversation (chat model)
                               │  KnowledgeSearch: words (rarity-weighted, heading counted twice, OBDX glossary)
                               │                   + meaning (embeddings, query/passage prefixes) ─► fused (RRF)
                               │  shortList(): best section of each manual first, then the best of the rest (15)
                               │  choose(): the chat model keeps the sections that answer the question (≤ 5)
                               ▼
                  prompt: rules, conversation, sources with the next/previous part of their section,
                  each labelled with manual, version, patchset, section path and page
                               │
                  ModelGateway (any OpenAI-compatible server: Ollama, vLLM, OpenAI, Groq, a bank's gateway)
                               │  streamed answer; KnowledgePolicy keeps the knowledge from servers outside the bank
                               ▼
                  Library page / AI Assistant panels: streamed text, numbered citations (factory copy and
                  Oracle's page), administrators' diagnostics; KnowledgeEvaluation measures it all
```

## 2. Audit findings

| Area | What exists | Problem found (evidence) | Correction |
|---|---|---|---|
| Documentation discovery | `OracleLibrary` reads Oracle's FSGBU documentation index, each release's library page (22.x tech/um folders per patchset, 25.x book-data JSON), keeps the newest patchset's file per manual | Works (39 technical guides of 25.2 found and imported, re-check 0 downloads). robots.txt is not read; HTML books are not ingested, only their PDFs | Kept. Recorded as a limitation (section 6) |
| Parsing | PDFBox page text; PDF bookmarks as headings | 25.x manuals indexed their *Contents*, *Index*, *Diversity and Inclusion*, *Critical Patches* pages as content; 22.x contents lines ending "… 39-1" became headings | Front and back matter skipped by title; contents lines with page ranges recognised (`ManualSplitter`, reader version 4) |
| Chunking | Sections at bookmarks or numbered headings, ≤ 1,800 characters, parts keep their pages | A subsection had only its own heading: "3.5.1 Custom Domain Objects" did not know it is under "3.5 Domain Extensions", so a question about domain extensions missed it (evaluation q005, q006, q007) | Every heading carries its two nearest parents ("3 Extensible Points in Service Tier › 3.5 Domain Extensions › 3.5.1 …"): in the full-text index, the embeddings, the model's short list and the citations |
| Embeddings | `nomic-embed-text` on Ollama; per-document record of the model; re-embedding on model change | Fixed earlier this round: query/passage prefixes, model change detection, privacy checked per batch | Kept; Qwen3-Embedding instruction added, bge-m3 instruction removed |
| Vector retrieval | pgvector, or in-memory cosine on the trial database | Works (0.1–0.3 s) | Kept |
| Hybrid search | Full text + embeddings, reciprocal rank fusion | Fixed earlier this round: rare words weigh more, heading words count twice, filler words ignored, OBDX glossary | Kept; headings now include their parents |
| Reranking | The chat model chooses ≤ 5 of a 15-section short list | No cross-encoder: the choice is as good as the chat model (a 3B local model keeps a wrong section now and then) | Kept; a dedicated reranking model is a recommended improvement |
| Context construction | 5 sources, each cut to its first 1,000 characters | A section is up to 1,800 characters and a procedure often runs into the next part: steps were cut off | Each source whole (1,800), then the parts before and after the best sources within an 8,000-character budget (`factory.knowledge.context-chars`) |
| Conversation | Every question was sent alone; the AI Assistant panels kept messages only on screen | Follow-ups ("and how do I clone one?") were searched as they stand and failed (evaluation q115) | The conversation's last three turns go with the question; a follow-up is rewritten into a standalone question for the search; the Library shows what it continues from and offers a new conversation |
| LLM integration | `ModelGateway`, OpenAI-compatible, chat + streaming + JSON + embeddings, separate embedding server | Provider-agnostic already (Ollama, vLLM, OpenAI, Groq, any OpenAI-compatible gateway); Anthropic's API is reached through its OpenAI-compatible endpoint, not a native adapter | Kept. Saving the Models page now tests the embedding model |
| Source citations | [n] with manual, version, patchset, heading, page; link to the factory's copy at the page | No link to Oracle's own page | Manuals fetched from Oracle's site link to Oracle's PDF at the page as well ("On Oracle's site") |
| Diagnostics | None | Why an answer used a source could not be seen | Administrators see, under each answer, the question as searched, the short list with scores, the sections kept, the search time and the size of the text sent |
| Answer accuracy | No measurement | "Works" could not be shown or kept | An evaluation set (119 questions, both releases, follow-ups, unanswerable ones) and a runner in the factory (section 4) |

## 3. Root causes of the answers that were wrong

1. **The search matched words, not what the manuals call things.** "Onboard a new retail customer" is "User
   Management - Create" with user type Retail; "customer" is "party". Fixed by the glossary, rare-word weighting,
   heading weighting and the model choosing from a short list.
2. **Sections lost their place in the manual.** Numbered steps were headings (fixed with bookmarks), and subsections
   had no parent (fixed now).
3. **Only part of a section reached the model.** Fixed by whole sections plus their neighbouring parts.
4. **Follow-ups had no conversation.** Fixed.
5. **A small model on a laptop.** A 3B model on a CPU writes slowly and loosely; the retrieval now gives it the right
   sections, but its wording and occasional extra lines are the model's. A larger model (a bank GPU server, or a cloud
   model where policy allows) answers better from the same sources.

## 4. Evaluation

`factory-server/src/main/resources/knowledge/evaluation.json`: 119 questions in a developer's, consultant's or
administrator's own words, for 25.2 and 22.2, each with the manual sections that answer it, checked against the
headings in the library (one that did not exist was removed). It covers architecture, extensibility, UI and the
workbench, APIs, security and SSO, configuration, integration, deployment, administration and retail features; three
follow-up pairs; four questions the manuals cannot answer.

Run it from the server (administrators): `POST /api/knowledge/evaluation {"mode": "SEARCH" | "CHOOSE" | "ANSWER"}`,
then `GET /api/knowledge/evaluation` for the report.

| Mode | What runs | Measures |
|---|---|---|
| SEARCH | search only, no model | Recall@5 (an expected section among the 5 sources), Recall@15 (in the short list), MRR |
| CHOOSE | search + the model's choice | the same, after the model chose |
| ANSWER | the whole answer | also: every [n] cites a given source, an answer cites at all, unanswerable questions are said to be so |

Results on the test factory (67 manuals; llama3.2 3B and nomic-embed-text on Ollama, on a laptop CPU):

| Run | Recall@5 | Recall@15 | MRR | Notes |
|---|---|---|---|---|
| Before this round's changes (SEARCH) | 0.826 | 0.826 | 0.723 | misses: subsections without their chapter, follow-up, vocabulary |
| After (SEARCH) | see section 7 | | | |
| After (CHOOSE) | see section 7 | | | |

What is not measured automatically: whether every sentence of an answer is supported by its sources (faithfulness)
needs a judge model or a person; the ANSWER mode checks citations and refusals only.

## 5. What changed in this round (files)

- `knowledge/ManualSplitter.java`: headings with parents; front and back matter skipped; contents lines with page ranges.
- `knowledge/KnowledgeImporter.java`: bookmarks with their parents; reader version 4 (documents read again at startup).
- `knowledge/KnowledgeService.java`: conversation (turns, standalone follow-ups), `retrieve`, context expansion,
  Oracle URLs on sources, diagnostics.
- `knowledge/KnowledgeRepository.java`: neighbouring section parts, Oracle URLs of documents.
- `knowledge/KnowledgeController.java`: `history` on ask, diagnostics for administrators, evaluation endpoints.
- `knowledge/KnowledgeEvaluation.java`, `resources/knowledge/evaluation.json`: the evaluation.
- `knowledge/KnowledgeProperties.java`, `application.yml`: `source-chars` 1,800, `context-chars` 8,000.
- UI: `viewModels/library.js`, `views/library.html` (conversation, Oracle links, diagnostics), `services/assistant.js`
  (conversation in the AI Assistant panels).
- Tests: `KnowledgeEvaluationTest`, splitter and update tests for the heading paths.

## 6. Limitations and recommended next steps

- **HTML books and robots.txt.** The 25.x libraries also publish each book as HTML pages with section anchors; the
  factory ingests the PDF of each book. robots.txt is not read: the factory requests only the index page, the library
  pages and the PDFs an administrator chose, a few dozen requests a week with a pause between them.
- **Reranking** is done by the chat model. A dedicated reranking model (a cross-encoder) would choose better on a small
  laptop model; it needs a model server that offers reranking.
- **Faithfulness** is not judged automatically (section 4).
- **Version differences** are answered from the workspace's version line (22 or 25); a side-by-side 22.x/25.x view is
  not built.
- **Categories** (technical guide, user manual) are known while fetching from Oracle but not stored per document; the
  search does not filter by them.
- **A native Anthropic adapter** is not built; Anthropic's OpenAI-compatible endpoint works through the same gateway.
- **The laptop.** Re-reading all manuals after a reading change re-embeds them: 20–30 minutes on a laptop CPU.

## 7. Results after the changes

(Filled in from the evaluation runs below.)
