# Issue Analyzer: Phase 2 plan

**Built** (see "Issue Analyzer" in `DEVELOPMENT.md`). Differences: the Oracle note's `kind` is not copied to
`knowledge_chunk` (search results look the kind up on the document instead, so the Library search is unchanged);
the bank's "It works now" / "Still failing" answers are kept as fix checks (no separate table); questions are open to
every member of the workspace, like filing issues.

Phase 1 (see `ISSUE-ANALYZER-PLAN.md`) diagnoses an issue from its logs, screenshots and the bank's code. Phase 2 adds
four things, each built on what the factory already has:

| Part | What it adds | Built on |
|---|---|---|
| A. Oracle knowledge | Oracle support notes, bug texts and patch readmes found for an issue, cited in the diagnosis | the OBDX Library (`knowledge`) |
| B. Bank admins file issues | a link a bank administrator uses to report an error and follow it, without a factory account | the customer review links (`design`) |
| C. Fix check and follow-ups | new logs after a fix compared with the original error; questions inside an issue | Phase 1 evidence and signatures |
| D. Repeated issues | the same error reported several times in a short time is grouped | Phase 1 signatures |

One migration, `V41__issue_phase_2.sql`. No new dependencies.

## A. Oracle knowledge

The OBDX Library already stores documents per OBDX version and patchset, shared or per workspace, with hybrid search
that matches error codes exactly. Oracle notes become Library documents of a new kind; they are not a separate store.

- `knowledge_document.kind` (`MANUAL` default, `ORACLE_NOTE`) and `reference` (what Oracle calls it, as the uploader
  typed it: "Doc ID 2345678.1", "Bug 34567890", "Patch 35123456"). `kind` is copied to `knowledge_chunk` for filtering.
- Library upload gets a choice: Manual or Oracle support note (bug, patch readme, knowledge article), and the
  reference field. Who may upload stays as in the Library (see question 3).
- Analysis searches the Library with the issue's evidence (error codes, exception and message, top frame class),
  for the workspace's OBDX version line, shared and this bank's documents. Oracle notes become evidence `O1, O2...`,
  manual sections `M1, M2...` (a few each). The model cites them; the factory keeps only ids it gave.
- The diagnosis gets **Oracle references**: title, reference, version and patchset of the note, why it matches, and
  a link to open it in the Library. A note for another patchset than the bank's is marked "check the version".
- The SR draft lists the Oracle notes already checked.
- Still no My Oracle Support login or scraping; notes come only from what people upload.

## B. Bank admins file issues

- A lead creates an **issue link** for a workspace (like a review link: random token, stored hashed, expires after 30
  days by default, 1 to 90, can be revoked; several links allowed, each with a label such as "Bank A UAT admins").
- The link opens a page without the factory's menu (`?ojr=report&embed=1&token=...`): name (required), email
  (optional), what happened, environment, logs and screenshots (same types and limits as Phase 1). The issue is
  filed as "bank: <name>" with source BANK, and analysis starts.
- After sending, the bank admin gets a **follow link** for that issue: its status, the summary in plain words, the
  steps meant for them (configuration and checks, never code, files or evidence ids), and two buttons: "It works now"
  and "Still failing" (with more logs or screenshots, which runs a fix check, part C). See question 1 for when the
  diagnosis becomes visible to them.
- The model writes two kinds of steps: for a bank administrator and for an engineer. The follow link shows only the
  administrator's.
- Limits: 20 issues a day per link and 60 requests a minute per address; uploads checked as in Phase 1; tokens never
  in logs.

## C. Fix check and follow-ups

- **Check the fix**: upload new logs or screenshots (or paste) on an issue. The factory parses them like the first
  ones and compares, without a model:
  - *Original error gone*: none of the original signature tokens, no new error lines.
  - *Still failing*: the original exception or error code is still there (with the lines).
  - *A different error*: the original is gone but others appear (they are listed).
  Each check is kept with its files and result. This is the "technically checked" state; "Resolved" stays the
  person's confirmation.
- **Questions**: engineers ask about an issue ("why configuration?", "which file?", "what else to collect?"). The
  model answers with the issue's evidence, code, Oracle references and diagnosis, citing ids, in the background like
  analysis. The questions and answers stay on the issue.

## D. Repeated issues

- When an analysis finishes, issues of the same workspace with the same error (two or more signature tokens in
  common, or the same error code) filed within 24 hours (`FACTORY_ISSUE_REPEAT_WINDOW`) join one group.
- The Issues page shows a bar ("5 issues with the same error in the last 24 hours: probably one outage or
  configuration problem") and a group filter; an issue shows the others in its group.
- A lead can apply one outcome to the whole group (resolved with the same fix, or escalated).
- Across workspaces: see question 4.

## Data (V41)

- `knowledge_document.kind`, `.reference`; `knowledge_chunk.kind`.
- `issue.source` (FACTORY, BANK), `issue.reporter_email`, `issue.group_id`, `issue.released_at` (question 1).
- `issue_link` (id, workspace_id, label, token_hash, expires_at, revoked_at, created_by, created_at).
- `issue_follow` (issue_id, token_hash, created_at).
- `issue_check` (id, issue_id, result, evidence JSONB, created_by, created_at); `issue_file.check_id`.
- `issue_question` (id, issue_id, question, answer, status, model, asked_by, created_at, answered_at).

## Tests

Unit: the fix comparison (gone, still failing, different error), grouping rules, the admin view hiding engineer data,
Oracle reference checking (ids kept, version mismatch). Integration: an Oracle note uploaded to the Library and cited;
a bank admin files through a link, follows it and reports "still failing" with a new log; revoked and expired links
refused; the rate limit; a question answered; three issues grouped and resolved together.

## Decisions

1. A bank admin sees the diagnosis on the follow link only **after an engineer releases it** ("Release to the bank"
   on the issue); until then the link says the issue is being looked at.
2. **One link per workspace**, reused by the bank's admins (label, expiry, revoke); each report gets its own follow
   link.
3. Oracle notes are uploaded **as in the Library**: administrators for notes shared with every workspace, code
   managers (developers, leads) for one workspace's notes.
4. Repeated issues are grouped **within a workspace** only.
