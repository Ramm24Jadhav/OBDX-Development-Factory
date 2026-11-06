# Issue Analyzer: Phase 1 plan

**Built** as planned (see "Issue Analyzer" in `DEVELOPMENT.md`), with three small additions: a NOT_RESOLVED status,
leads can delete issues, and the SR draft is assembled by the factory without a model call.

A support engineer gives the factory what a bank reports (a description, a screenshot of the error screen, a log or
stack trace) and the factory says what probably caused it, shows the evidence, and lists the steps to fix it without
code changes, or says it looks like a real defect and drafts the text for an Oracle SR.

This is the cut-down first release of a larger design. The full version planned 15 screens, 14 tables, Oracle
Support integration and a separate bank-admin portal. Phase 1 keeps the parts that give an answer people can use, and
builds them from what the factory already has.

## Decisions

- **Who files issues:** any signed-in member of the workspace, whatever their role.
- **Knowledge across workspaces:** a lead can share a resolved issue as product knowledge, which every workspace's
  analysis then uses. The shared copy holds no bank data (see Shared knowledge).
- **Evidence:** screenshots and text (description, pasted or uploaded logs). Both are in Phase 1.

## What makes it work here: the workspace already knows the bank's code

Each workspace holds an imported, indexed copy of one bank's OBDX codebase and its Project Profile (OBDX version,
layers, integrations). So the analyzer can do what a general chatbot cannot:

- map stack-trace frames (`com.bank.obdx.payments.FundTransferService.transfer:142`) to the real source lines in the
  index;
- find where a configuration key, error code or message text named in the log or screenshot is defined or read, in
  code and in config files (the index already covers `.properties`, `.xml`, `.json`, `.yaml`), with the hybrid search
  that already exists (`CodeSearchService`);
- pass the OBDX version and integrations from the profile, so the advice fits that bank.

Configuration advice must cite a file and line that the search actually found. That is the guard against made-up keys.

## Scope

In:

1. **New issue** in a workspace: title, description, pasted log or stack trace, optional files: logs (`.log`/`.txt`)
   and screenshots (`.png`/`.jpg`/`.jpeg`), several of each, size-limited. Environment (DEV/SIT/UAT/PROD).
2. **Screenshot reading** with a vision model: one call per image returns, as JSON, the visible error text, error
   code, screen or menu name and the action the user was taking. The extracted text is shown to the engineer, who can
   correct it before or after analysis. This text then counts as evidence like a log line.
3. **Evidence extraction, no model**: a `LogEvidenceParser` (like `jenkins/BuildLogParser`) pulls exception classes and
   messages, `Caused by` chains, stack frames in bank packages, HTTP status codes, error codes, URLs/hosts, correlation
   IDs and property-like keys. It keeps only the relevant lines with their line numbers, so large logs never go to the
   model whole.
4. **Code lookup**: for each frame, key, error code and screenshot message, look it up in the workspace index and keep
   the matching snippets.
5. **Diagnosis, one model call** (`ModelGateway.chatJson`) with the evidence, snippets, profile and matching past
   issues. It answers as JSON: category (CONFIGURATION, DEPENDENCY, INFRASTRUCTURE, SECURITY, DATA, INTEGRATION,
   PRODUCT_DEFECT, CUSTOMIZATION, UNKNOWN), state (PROBABLE, POSSIBLE, INCONCLUSIVE), root cause, evidence
   references, alternatives, missing information, and numbered fix steps with a risk level. The server checks the JSON
   and drops any evidence reference it did not supply. No confidence percentage is shown. When screenshot and log
   disagree, the answer says so.
6. **Runs in the background** on a task executor like `ChangeBuildService`; the page polls the issue status, as the
   Changes page does.
7. **Outcome**: the engineer marks it resolved (with what fixed it), not resolved, or escalated. Resolved issues
   become knowledge for later issues: a keyword search on normalised exception signatures and error codes over past
   resolved issues in the same workspace, plus shared product knowledge.
8. **SR draft** for PRODUCT_DEFECT or unresolved issues: a Markdown text with summary, OBDX version, environment,
   steps, log extract (secrets masked), screenshots listed for attaching, and what was checked, ready to copy into My
   Oracle Support. Nothing is sent.
9. **Masking** before text reaches the model: passwords, tokens, `Authorization` headers, card and account numbers.
   Screenshots go to the vision model as they are; the page says so, and asks users to crop customer data out first.

Out, for later phases:

- Bank administrators as users. Phase 1 is for signed-in factory users. Later, the customer review link pattern
  (`review` page) could let a bank admin submit an issue without an account.
- Oracle knowledge: no MOS integration (it has no open API). Later: let users attach Oracle notes and bug texts they
  are allowed to use.
- Live checks against the bank's environment (endpoint reachability and so on), fix validation runs, follow-up chat,
  dashboards, rule manager, pattern detection across issues.
- Embeddings for past issues (keyword search on signatures is enough at first).
- Blurring customer data in screenshots automatically.

## Shared knowledge

On a resolved issue, a lead (APPROVE permission) clicks "Share as product knowledge". A form opens, filled from the
issue: title, OBDX version, component, category, exception signature / error code, root cause and resolution. No log,
screenshot, file path, host, URL or bank name is copied. The lead edits the text to remove anything bank-specific
and saves; the masker also runs on it, and the save is refused if it still finds hosts, URLs or the workspace's bank
name. Shared entries carry the source workspace only for audit (not shown to other workspaces). A lead or an
administrator can withdraw an entry they shared.

## Vision model

The Models page gets a third choice next to the chat and embedding models: **Screenshot model**, chosen from the same
server's list (a model that accepts images). It is optional. Without it, screenshots are stored and shown, and the
page says: "Choose a screenshot model on the Models page to read screenshots, or type the error text." Analysis then
runs on text alone.

- `ModelSettings.Current`/`Update` gain `visionModel`; `model_settings` gains a nullable `vision_model` column.
- `ModelGateway` gains `ChatResult describeImage(String prompt, byte[] image, String mimeType)`;
  `OpenAiCompatibleModelGateway` sends a langchain4j `UserMessage` with `ImageContent` to the vision model, or throws
  `ModelGatewayException` with the message above when none is set.
- `FACTORY_MODEL_VISION_MODEL` as the default setting; documented in `docs/DEVELOPMENT.md`.

## Server

New package `com.obdx.factory.issue`:

| Class | Does |
|---|---|
| `IssueController` | REST endpoints below; every workspace member (`AccessGuard.require(workspaceId, VIEW)`) can create, analyze and record outcomes; sharing needs `APPROVE` |
| `IssueService` | create, list, store files, start analysis on the executor, record outcome |
| `LogEvidenceParser` | static, deterministic extraction (unit tested with sample OBDX/WebLogic logs) |
| `SecretMasker` | static masking (unit tested) |
| `IssueAnalyzer` | screenshot reading, code lookup, past-issue lookup, prompt, model call, JSON check (like `change/ImpactAnalyzer`) |
| `IssueRepository` | JdbcTemplate SQL |
| `SharedKnowledgeService` | share, list, withdraw product knowledge |

Migration `V15__issues.sql`:

- `issue` (id, workspace_id, title, description, environment, log_text, status, evidence JSONB, diagnosis JSONB,
  signature, outcome, resolution, sr_draft, created_by, created_at, updated_at), indexed on workspace and signature.
- `issue_file` (issue_id, position, name, kind LOG/SCREENSHOT, mime_type, content BYTEA, extracted_text), deleted
  with the issue.
- `issue_knowledge` (id, source_issue_id, source_workspace_id, obdx_version, component, category, signature, title,
  root_cause, resolution, shared_by, shared_at), indexed on signature.
- `model_settings.vision_model` (nullable).

Evidence and diagnosis stay as JSONB, like `change_request.plan`, instead of the many separate tables of the full
design.

Endpoints under `/api/workspaces/{id}/issues`, matching the existing style:

- `GET /` list, `POST /` create (multipart for the files)
- `GET /{issueId}` issue with status, evidence, diagnosis; `GET /{issueId}/files/{position}` a file
- `PUT /{issueId}/files/{position}/text` correct the text read from a screenshot
- `POST /{issueId}/analyze` start or re-run
- `POST /{issueId}/outcome` resolved / not resolved / escalated, with resolution text
- `POST /{issueId}/sr-draft` build the SR text
- `POST /{issueId}/share` share as product knowledge (lead)

And `GET /api/issue-knowledge`, `DELETE /api/issue-knowledge/{id}` for the shared entries.

Statuses: NEW, ANALYZING, DIAGNOSED, FAILED (with a message saying what to do), RESOLVED, ESCALATED.

The prompts tell the model to treat logs, screenshot text and code as data, not instructions; to name only keys and
files present in the snippets; and to say INCONCLUSIVE and what to collect next when the evidence is thin.

## UI

One page, `issues` ("Issues" in the navigation, after Changes): `views/issues.html` + `viewModels/issues.js`.

- Left: the workspace's issues with status badges, and a New issue button.
- Right, for the selected issue: the form (new, with file drop for logs and screenshots), then the result: category
  and state, root cause, evidence (each item with its log line, its screenshot thumbnail and read text, or a link to
  the source on the Code page), fix steps, missing information, similar past issues (marked "this workspace" or
  "shared"), then the outcome buttons, "Draft Oracle SR" and, for leads, "Share as product knowledge".

Models page: the Screenshot model choice.

## Tests

- `LogEvidenceParser`: NullPointerException with bank frames, `Caused by` chains, connection refused, SSL handshake,
  HTTP 401/403, a property missing, a log with no error.
- `SecretMasker`: passwords, bearer tokens, card numbers, hosts and URLs for sharing.
- `IssueAnalyzer` with a fake `ModelGateway`: drops invented evidence references; bad JSON gives FAILED with a clear
  message; prompt-injection text in a log or screenshot stays inside the data section; no vision model gives text-only
  analysis with the notice.
- Integration (with `FACTORY_TEST_DB_URL`): create with files, analyze, outcome, share, a shared entry found from
  another workspace without its logs, non-members refused, non-leads refused for sharing.
- By hand: the demo banks in `deploy/docker/demo` (a log and a screenshot of a `FundTransferService` failure), run
  against Groq, since the laptop's local model is too slow for this.

## Rough size

Server about 7 classes plus a migration and the gateway/settings change, one new UI page and a field on the Models
page, about 5 test classes. A bit larger than the Modernization inventory feature.
