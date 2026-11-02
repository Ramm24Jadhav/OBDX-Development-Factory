# Development guide

## Project layout

| Folder | What it is |
|---|---|
| `factory-ui/` | Oracle JET web UI (Knockout MVVM, same style as OBDX). Built into static files and packaged into a jar. |
| `factory-server/` | Spring Boot backend (Java 21): REST API, model gateway, database access. Serves the UI. |
| `target-packs/` | UI target packs (Oracle JET, React Native, React): component mapping, templates, rules and starter projects. Packaged into the server; the UI build bundles the starters' components for the previews. |
| `deploy/` | Linux service file and settings template for installing on a server. |
| `docs/` | Architecture and this guide. |
| `Jenkinsfile` | Jenkins pipeline that builds, tests and archives the jar. |

Backend packages (`factory-server/src/main/java/com/obdx/factory/`):

- `workspace/`: workspaces (one bank's codebase and settings): entity, repository, service, REST controller.
- `svn/`: runs the Subversion command-line client (`svn info`, `checkout`, `update`). Passwords go to svn on stdin, never on the command line, and are not cached.
- `importing/`: import jobs that check out or update a workspace's code and index it in the background.
- `indexing/`: turns source files into searchable pieces ("chunks"): Java by class and method (JavaParser), other files by windows of lines. Stores them with full-text and vector search data.
- `search/`: code search combining keyword and semantic (embedding) search.
- `profile/`: the Project Profile. One detector per area (`ObdxDetector`, `UiDetector`, `BackendDetector`, `DataDetector`, `IntegrationDetector`, `ConventionsDetector`) scans the working copy and returns facts with evidence; `ProjectProfileService` stores them and merges developers' confirmed or corrected values.
- `requirements/`: requirement documents and their specs. `DocumentTextExtractor` reads Word/PDF/text (Apache POI, PDFBox); `SpecDrafter` holds the prompts and asks the model for JSON; `SpecParser` reads the model's JSON leniently; `SpecMerger` combines the sections of long documents; `RequirementService` runs the draft → answer → update → approve workflow.
- `design/`: the screen designer. `ScreenModel` is the target-neutral screen description; `ComponentCatalog` lists component types and their JET components; `ScreenModels` creates (from a spec screen), parses and normalizes models; `ScreenModelEditor` applies plain-language changes through the model; `ScreenDesignService` handles versions, comments, review links and approval.
- `change/`: impact analysis and code generation. `ImpactAnalyzer` asks the model for a `ChangePlan`; `PlanParser` makes plans safe (paths, create/modify, layers); `CodeGenerator` writes each file and asks for fixes when `FileChecks` fail; `PatchWriter` writes Subversion-style patches; `ChangeService` runs the workflow and commits branches with `svnmucc`; `ChangeBuildService` runs the quick checks and Jenkins builds with the fix loop.
- `pack/`: version packs. `VersionPacks` loads the YAML rule and recipe files (`RecipeLoader` for recipes and templates); `LocalChecks` runs syntax checks and rules on a file; `PackService` gives each workspace its rules and on/off settings; `RecipeService` finds and pins reference examples.
- `target/`: UI targets. `TargetPacks` loads `target-packs/`; `ScreenScaffolder` turns an approved Screen Model into a screen, test and texts for React Native or React; `TargetService` holds each workspace's target and app folder, the starter download and the planner's guide.
- `modernization/`: the modernization inventory. `InventoryScanner` scans a working copy into screens, services, roles and flows; `InventoryService` stores it after each import and exports the screens as CSV.
- `jenkins/`: Jenkins settings, REST client and build log parsing.
- `auth/`: sign-in and roles. `SecurityConfig` sets up sessions, CSRF and the sign-in options (local accounts, LDAP, OIDC, SAML); `AccessGuard` checks the signed-in user's permissions and is called by every controller; `UserDirectory` manages users; `AuditLog` records who did what.
- `security/`: encryption of stored secrets such as SVN passwords.
- `model/`: the model gateway. `ModelGateway` is the only way the factory calls AI models; `OpenAiCompatibleModelGateway` works with Ollama, vLLM and private OpenAI-compatible endpoints.
- `common/`: shared exceptions and the error handler that returns problem details to the UI.

Database changes are Flyway scripts in `factory-server/src/main/resources/db/migration/` (`V2__...sql`, `V3__...sql`, and so on). Never edit a script that has already run; add a new one.

## Prerequisites

- JDK 21 and Maven 3.9+
- PostgreSQL 14+ with the pgvector extension
- The Subversion command-line tools (`svn`, and `svnmucc` for delivering branches; both are in the `subversion` package) on the factory server, and network access from it to the banks' SVN servers. On Linux: `apt install subversion` or `dnf install subversion`.
- A model server for real answers, for example [Ollama](https://ollama.com) (optional for building and tests)

Node.js does not need to be installed: the Maven build downloads it into `factory-ui/target/`. For offline or bank builds, point it at an internal mirror: `mvn -Dnode.download.root=https://mirror.local/nodejs/ ...`. npm packages come from the npm registry, or from an internal one configured in `factory-ui/.npmrc`.

## One-time database setup

As a PostgreSQL superuser (usually the DBA):

```sql
CREATE USER factory WITH PASSWORD 'factory';
CREATE DATABASE factory OWNER factory;
\c factory
CREATE EXTENSION vector;
```

Tables are created automatically by Flyway when the server starts.

## Build and run

```bash
mvn clean verify                                  # builds UI + server and runs the tests
java -jar factory-server/target/obdx-factory.jar  # starts on http://localhost:8080
```

Settings come from environment variables (defaults in `factory-server/src/main/resources/application.yml`):

| Variable | Default |
|---|---|
| `FACTORY_PORT` | `8080` |
| `FACTORY_DB_URL` | `jdbc:postgresql://localhost:5432/factory` |
| `FACTORY_DB_USER` / `FACTORY_DB_PASSWORD` | `factory` / `factory` |
| `FACTORY_ENVIRONMENT_NAME` | empty. A short name for this installation (for example `Development`, `UAT` or `Production`, at most 30 characters), shown as a label on the sign-in page. Empty: no label |
| `FACTORY_TRIAL_DATABASE` | `false`. `true`: the factory starts its own PostgreSQL (data in `FACTORY_DATA_DIR/trial-database`) and ignores the `FACTORY_DB_*` settings. For trials only |
| `FACTORY_LOCAL_FOLDERS` | the value of `FACTORY_TRIAL_DATABASE`. `true`: workspaces can be created from folders on the factory's computer (see Creating a workspace) |
| `FACTORY_UPDATES` | `false`. `true`: check GitHub for newer builds and install them with Update now (only with the download's start scripts) |
| `FACTORY_SECRET_KEY` | none. Required before saving an SVN password. Generate with `openssl rand -base64 32` and keep it stable |
| `FACTORY_DATA_DIR` | `data` (SVN working copies are kept under it) |
| `FACTORY_SVN_COMMAND` | `svn` |
| `FACTORY_SVN_TRUST_UNKNOWN_CA` | `false` (accept SVN server certificates from an unknown CA) |
| `FACTORY_INDEX_EMBEDDINGS` | `true` (create embeddings for semantic search while indexing) |
| `FACTORY_REQUIREMENTS_MAX_CHARS` | `12000` (characters of a document sent to the model per call) |
| `FACTORY_MODEL_BASE_URL` | `http://localhost:11434/v1` (Ollama) |
| `FACTORY_MODEL_API_KEY` | `not-needed` |
| `FACTORY_MODEL_CHAT` | `qwen2.5-coder:7b` |
| `FACTORY_MODEL_EMBEDDING` | `nomic-embed-text` |
| `FACTORY_MODEL_TIMEOUT` | `120s` |
| `FACTORY_MODEL_EMBEDDING_BASE_URL` | empty (the embedding model is on `FACTORY_MODEL_BASE_URL`) |
| `FACTORY_MODEL_EMBEDDING_API_KEY` | empty |
| `FACTORY_MODEL_MAX_CONTEXT` | `16384`: the most context (tokens) asked of an Ollama server |
| `FACTORY_MODEL_MAX_OUTPUT_TOKENS` | `0`: the most tokens a model may write in one answer on an OpenAI-compatible server (0: the server decides). Groq stops at 2,048 unless asked; set 8192 there so long plans and code files are not cut off |
| `FACTORY_MODEL_NO_THINK` | empty: models whose name contains `qwen3` are asked not to think out loud, others are not. `true` or `false` decides for any model. When on, the system prompt ends with `/no_think` and OpenAI-compatible servers get `reasoning_effort: "none"`; a server that refuses that parameter (400) is asked again without it, and the factory does not send it there again. `<think>...</think>` blocks are always removed from answers, and an answer that stopped while still thinking counts as empty |

To try the model gateway with Ollama:

```bash
ollama pull qwen2.5-coder:7b
ollama pull nomic-embed-text
```

Then open the **Models** page and send a prompt.

**Choosing the model server.** On the Models page administrators choose the server and models while the factory runs:
**On this computer** finds Ollama (port 11434), vLLM (8000) and LM Studio (1234) on the factory's computer and lists
their models; **Another server** takes any OpenAI-compatible URL (usually ending with `/v1`, for example a GPU server
or a private cloud endpoint) and an API key, and lists that server's models through `/models`. Pick the chat model
(code models are listed first) and the embedding model, and **Use these models**: the factory switches at once, without a
restart. The choice is kept in the database (`model_settings`; the API key encrypted with `FACTORY_SECRET_KEY`) and
replaces the `FACTORY_MODEL_*` settings, which apply until something is chosen. Changing the embedding model removes the
stored embeddings, because embeddings of different models cannot be compared; import each workspace
again to search by meaning.

**Code search on another server.** Under **Code search**, **On another server** takes a second URL and API key for the
embedding model, for example chat from a cloud API without embedding models (Groq:
`https://api.groq.com/openai/v1`) and code search from Ollama on this computer (`http://localhost:11434/v1`,
`nomic-embed-text`, which needs little memory). It is filled in with a server on this computer that has an embedding
model, if one is found. With **On the same server** (the default) both come from the chat model server, as with a single
local Ollama.

## Creating a workspace

On the Workspaces page, **New workspace** (or **Connect a code base** on Home) walks administrators through five steps:
the source, the check, the details to confirm, the import and index, and the detected profile. The check connects and
reads the code, and suggests the name, bank and OBDX version with the evidence it found; a version the code does not
show, or that both versions point to, is for the administrator to choose. After **Create and import** each stage shows
what the server reports (workspace created, SVN sign-in saved, import started, checkout, indexing, profile detection),
with the server's error and **Try again** where a stage failed; nothing is shown as done before the import job says so.
The last step shows the OBDX version the profile detected, its confidence and evidence files, and **Confirm the detected
version** (the profile fact `obdx.version`). A workspace's details open in a side sheet from the list: the index, the
version with its evidence, the repository with **Test the connection**, members, **Update code** (an import: SVN update
from the indexed revision, then only files whose content changed are indexed again) and **Delete**, which first names the
requirements, screens, changes and index that go with it. Sources:

- **SVN server (URL)**, with a username and password if the server asks. **Check** connects and reads the code.
- **Folder on this computer** (the computer the factory runs on): a TortoiseSVN checkout (the factory imports from the
  checkout's URL, so it sees what is committed), an SVN repository folder, or a plain folder, which the factory copies
  into a new SVN repository under `FACTORY_DATA_DIR/local-repositories` so changes can still be delivered as branches.
  **Browse...** opens the computer's folders; repositories in `demo-svn` and `local-repositories` are listed to pick.
  This option exists when `FACTORY_LOCAL_FOLDERS` is true, which is the default with the trial database; on a shared
  server it is off, because administrators would browse the server's folders, not their own.

SVN URLs are checked wherever they are entered (`SvnUrls`): a server name that starts with `-` is refused (with
`svn+ssh://` it would reach ssh as an option), and a `file://` URL, which reads a repository on the factory's own
computer, only from an administrator and only when `FACTORY_LOCAL_FOLDERS` is true. The demo and trial repositories
the factory adds itself are not affected.

A stored SVN password or Jenkins API token is sent only to the server it was entered for. When the URL is changed to
another server (scheme, host or port), the stored secret is removed and has to be entered again; the audit entry
says so.

The check fills in the workspace name, bank and OBDX version from the code and says why, strongest evidence first:
OBDX's `about.json` (`channel/framework/json/about.json` in 22.2), Oracle's OBDX libraries (`com.ofss.digx`) or an
`obdx.version` in the build files, the Oracle JET version, the Java level (8 for 22.x, 11 for 25.x) and a version in
the repository or folder name. The bank comes from the repository or folder name, the build's group id, or the most
common Java package that is not Oracle's (`CodeDetector`). Everything can be changed before **Create workspace and
import**, which also starts the import and opens the Code page.

## How SVN import and indexing work

1. On the **Code** page, pick a workspace and enter its SVN URL (the folder to index, usually `trunk`) and the SVN service account. **Test connection** runs `svn info` with those credentials.
2. **Import / update code** starts a background job. The first run checks the code out into `FACTORY_DATA_DIR/workspaces/<id>/checkout`; later runs run `svn update`. If the URL changed, it checks out again.
3. The indexer walks the working copy, skipping `.svn`, `node_modules`, `target`, `build`, `dist`, minified files and files over 512 KB (configurable under `factory.indexing`). It compares each file's SHA-256 hash with the last import and re-indexes only changed files; files deleted in SVN are removed from the index.
4. Java files are split into a class outline plus one piece per method or constructor. Other files (JavaScript, HTML, JSON, SQL, properties, XML, CSS) are split into windows of 60 lines.
5. Each piece gets an embedding from the embedding model. If the model is unavailable, the import still succeeds with keyword search only, and the next import fills in the missing embeddings.
6. **Search** combines PostgreSQL full-text search (identifiers are split into words, so "fund transfer" finds `FundTransferService`) with vector similarity, and merges the two rankings.

## Project Profile

After every successful import the factory scans the working copy and records facts about the codebase, each with a confidence level and the files it was found in:

| Area | Facts |
|---|---|
| OBDX | OBDX version (from version settings, OBDX/DIGX dependencies in POMs, manifests or file names); whether Oracle product source (`com.ofss`) is in the repository |
| User interface | JET version, UI architecture (Knockout MVVM or VDOM), module system (RequireJS or ES modules), views/view models and composite components, resource bundles and translations, styling and theme, third-party libraries |
| Backend | Build tools, Java version, frameworks (from imports), javax vs jakarta namespace, packaging, application server, logging, REST endpoints |
| Database | Database type (JDBC URLs, else SQL dialect), table name prefixes, script folders |
| Integration | Host systems (FLEXCUBE, OBPM and others), adapter classes |
| Bank conventions | Bank Java packages, customization folders, class name suffixes, error code format, exception base classes, indentation |

On the **Profile** page a developer can **Confirm** a detected value, **Correct** it (or **Enter** one that was not found), and **Reset** back to the detected value. Confirmed and corrected values are stored separately and survive later scans. If the detected OBDX version disagrees with the workspace's version, the page shows a warning. The page groups the facts by area, marks each Detected (high confidence: declared in a file), Inferred (medium or low), Confirmed, Corrected or not found, lists each fact's evidence files and its changes (from the audit log), and names the facts code generation reads (`ui.jetVersion`, `ui.moduleSystem`, `backend.eeNamespace`, `backend.javaVersion`, `conventions.customizationFolders`) when they are missing; keep that list in `viewModels/profile.js` in step with the version packs and `pack/CheckScope`. To add a fact, add it to the matching detector; every detector returns all of its facts, with "not found" where nothing was detected, so the profile doubles as a checklist.

## Requirements (document ingestion)

1. On the **Requirements** page, upload a BRD/FSD (`.docx`, `.doc`, `.pdf`, `.txt`, `.md`, up to 25 MB); a larger file is refused before it is read, a Word file whose parts unpack to more than 100 MB or 100 times their size is refused, and PDF parsing keeps its objects in a temporary file rather than memory. Design and knowledge uploads keep the 150 MB limit or describe the change in text. The uploaded file is kept under `FACTORY_DATA_DIR/workspaces/<id>/requirements/`.
2. The text is extracted (Word headings become `#` lines and tables become `|` rows) and sent to the chat model in sections of up to 12,000 characters (`FACTORY_REQUIREMENTS_MAX_CHARS`). Confirmed Project Profile facts (OBDX and JET version, database, host systems, error codes) are given as context.
3. Before the model drafts, nothing in the document's own tables is left to it: tables whose rows carry IDs (FR-001 functional requirements, BR-001 business rules, AC-001 acceptance criteria, NFR-001 non-functional requirements, OQ-001 open questions), the traceability matrix that links requirements to criteria, or any table whose rows map requirement IDs to lists of IDs only ("Requirement ID | Acceptance criteria"), and a column of ID lists in a requirements table, a table of message or error codes (first column headed Code, not a "Rule code" header; a Message or Text column, or a Description column under an error, message, response, status, return or reason codes heading; rows such as DIGX_BV_001 or F1001, never FR, REQ, AC, NFR, BR or OQ IDs, which other tables read; at most 2,000 per document) whose codes and wording become the spec's messages (type error when the table or heading says error codes; the model's other messages follow), and the lists under the scope, out-of-scope and assumption headings are read exactly as written and replace what the model wrote for them (keeping the screens it linked requirements to). Requirements, criteria and rules the model found elsewhere (in the prose, or from an answer) that the tables do not have follow the document's rows; the model's copies of a row, under its ID or in similar words, are left out. A table of R-01 or F-01 rows counts as rules or requirements only when its header or heading says so (R-01 is as often a risk), and a bold label on its own line ("**Out of scope**") under the scope heading starts that list. A requirement ID is never taken twice. The spec is then kept to the document: APIs the document never names are dropped, (an API counts as named when its method and every fixed segment of its path are words of the document, as in "POST, GET, GET /{instructionId}, DELETE on /payments/standingInstructions"), and an API the document names as "METHOD /path" that the draft left out is added, with the requirement ID of its line (not from out-of-scope, assumption, example or appendix sections, nor from lines that say "e.g.", "for example", "existing" or "out of scope"; an API is the same whether its path is in its name or its description; updating a spec with answers adds none, so one the analyst removed stays removed), screens with the same words are merged, and a screen a requirement needs that the document names is added. The model answers in JSON mode with a spec: screens (new or enhance) with fields, actions, business rules, roles, APIs, host interactions, messages and **open questions**. An unusable answer is retried once. Sections are merged and each screen gets up to three possibly related files from code search.
4. Each open question asks about one thing in plain words and comes with 2 to 4 short options and the usual choice
   (`options`, `suggestedAnswer`). Analysts pick options (several picks are combined), type their own answer or use
   **Use suggested answers** for every empty one, and click **Update spec with answers**: answered questions become decisions, and the model updates the spec with them. The spec can also be edited as JSON. Every change is stored as a new spec version. Updating with answers sends the model the screens, fields, rules and questions only; the document's own lists (scope, requirements, criteria, non-functional) are kept as they are, and its tables are read again, so its open questions that are still unanswered stay open. A requirement being drafted when the server restarts must be drafted again (Retry); one being updated with answers keeps its spec and answers and is ready to update again.
Saving an edited spec refuses a body with none of a spec's fields ("Send the spec itself"; a body wrapped as {"spec": {...}} is read) and an edit that would replace a spec with an empty one. When a drafted screen has no fields, the spec's message names it ("Screens without fields: ..."), to add them by editing the spec or to draft again. 5. **Approve** locks the spec. It needs no open questions, and screens, or for a backend-only change (a REST API without UI) functional requirements or APIs; such a change is planned without screen designs.

The spec keeps the document's own structure for traceability: its scope, out of scope and assumptions, its functional requirements (ID, priority, the screens each needs), its acceptance criteria (ID, the requirements each verifies), its non-functional requirements and its business rules, all with the document's own IDs (FR-001, AC-001, NFR-001, BR-001; items without one are numbered after them). The document's own open questions become the spec's. The Requirements page shows them, with a traceability table (requirement, priority, screens, the criteria that verify it), and impact analysis and code generation receive them with the rest of the spec.

Scanned PDFs have no text layer and need OCR before upload. With a local model, drafting a long BRD can take minutes. Drafting, impact analysis and code generation are streamed where the server allows it, so `FACTORY_MODEL_TIMEOUT` counts from the last piece the model wrote, not from the start; a server that refuses JSON in a stream (some cloud APIs) answers JSON calls in one piece. On an Ollama server the factory chats through Ollama's own API and asks for a context large enough for each prompt and its answer (Ollama otherwise runs a model with 4,096 tokens and cuts longer prompts without a word), up to the model's own limit and `FACTORY_MODEL_MAX_CONTEXT` (16,384; a larger context needs more memory on the model server). If Ollama is started after the factory, the factory notices within a minute (or at once when the model settings are saved). Lower `FACTORY_REQUIREMENTS_MAX_CHARS` for models with a small context window. A server that takes too little input to draft from sections of at least 2,000 characters fails the draft with a message to use a model or plan with a larger limit.

Cloud servers on a free plan limit tokens per minute (Groq: 7,000 input tokens a minute for some models). The factory works within them:
- When the server answers "rate limit reached, try again in 7.66s", the call waits that long and is made again (up to 3 minutes a wait). A daily limit ("tokens per day") is rolling, so a short wait it asks for is waited out the same way. A longer wait, a daily limit that gives no time, or a limit that stays after eight tries stops at once with a message saying when to try again ("about 15 minutes", the server's estimate, which changes if others use the same key). Code generation then stops too: the files not written yet stay pending, and **Continue generation** on the Changes page writes only those when the limit resets. Continue keeps the revision the first files were read at, and is refused when the code was imported again since (analyze again, or use Write again); files that can only be changed by hand (too large, or a link outside the working copy) are not tried again but still count as not written for delivery. A streamed answer that hits the limit after part of it was shown is not asked for again, so no part shows twice.
- When a request is larger than the server takes at once ("Request too large ... Limit 7000, Requested 7663", or a model's maximum context length), the factory remembers the limit and builds the prompt again with less context. A maximum context length holds the answer too, so `FACTORY_MODEL_MAX_OUTPUT_TOKENS` (or 1,024 tokens when it is not set) is kept free of it for the answer. The spec, designs, code excerpts and examples shrink, and drafting uses smaller sections of the document. A limit on all tokens a minute (Groq "tokens per minute (TPM)") counts max_tokens with the prompt, so the factory learns the prompt's share of the refused request, keeps room for an answer, and from then on asks for max_tokens no larger than what is left of 90% of that limit after the prompt (at least 256). The log has a line for each request: prompt characters, estimated tokens, max_tokens and how far the context was scaled. A server that says its tokens a minute in its response headers (Groq and OpenAI send `x-ratelimit-limit-tokens`) has max_tokens sized the same way from its first answer, before anything is refused. An answer without a finish reason that ends at about max_tokens (a stream the server ended early) counts as cut off.
- When one answer asks for more than the server writes in a minute (Groq: "output tokens per minute (OTPM): Limit 1000, Requested 8192"), the factory learns the limit as output tokens a minute (logged; a server that counted more than was asked allows that much less of it) and asks again at once for what is left of the minute. It counts the output of this server's answers over the last minute, and each answer asks for no more than 90% of the limit less what was used; when under 256 tokens are left, it waits the few seconds until enough frees up instead of asking for a tiny answer. A refusal that says what the minute had used ("Used 400") is taken into account for that retry. A learned limit is tried without once an hour, and an answer the server takes without it (or one longer than it) clears it. A per-answer cap stored by earlier versions is cleared when read ("Cleared a stored output cap of N"). If the server refuses that too (it counted more than was asked for), the cap is lowered by the same ratio at once; no answer waits for a limit it can never meet. The limits learned (input, characters per token, output cap) are kept in the database per model server and model, so a restart starts with them, and are forgotten when the server or model is changed in the settings. A code file cut off at that size is continued: the model is asked to go on where it stopped, up to 6 times (2 on Ollama, where each takes minutes). A continuation is a short prompt (the file's path, purpose and rules, an excerpt of the spec, its current content when it is modified, and the signatures of the change's files it uses; no examples, designs or knowledge) at the scale the first piece needed or smaller, plus the file's last 3,000 characters cut back to its last complete line: the line cut off in the middle is left out, and the model is asked to begin by repeating the last complete line and is joined on it. A piece that neither repeats that line nor repeats the file's end is asked for once more. For a Java file the continuation also says what is already written ("Already written, do not write these again: methods ...; fields ...") and which methods the part calls but has not written yet. Only the model talking to itself ("Wait, ...", "Let's check ...", "I already wrote ...", "The prompt says ...") cuts a piece; other reasoning in comments is taken out comment by comment (never inside a text block, never a comment that does not close or spans more than 10 lines, and the answer stays as it was if taking it out would break it). Each piece is read for the model's reasoning in comments ("// Wait, ...", "// Let's check ...", "// The prompt says ...", "// I already wrote ..."): a piece that is mostly reasoning is asked for again once, more strictly, otherwise it is cut back to the line before the reasoning; reasoning is never kept as a partial file. Once joined, a Java or JavaScript file must parse. An error before the last seam is the model's own, in text it wrote whole: the file is kept and goes to the fix ("The model's answer does not parse at line N: ..."), which on a small limit sends only the method around the error, found by its text. An error at or after the last seam is a bad join: the file fails ("the pieces did not join cleanly; write it again") on every path (first write, Continue, Write again, a build fix): its content and any kept part are cleared, so it counts as not written and the next Continue writes it whole. This is logged as one warning line. A joined Java file that parses is then put right: a method a later piece wrote again with the same parameters is left out (the first is kept), and methods it calls that no piece wrote are asked for once and added before the class's closing brace (kept only if the file still parses and needs fewer); both are noted in the file's check. If a limit stops the file part-way, the part written is kept as the file's content with a failed "Cut off" check; it still counts as not written for delivery, and Continue generation goes on from it instead of writing the whole file again. A Write again stopped part-way keeps the version written before as the file's content (for review and delivery) and its new part beside it (shown as "Rewrite in progress: N characters written; Write again (or Continue) goes on from it"); the next Write again or Continue goes on from that part, cleaned the same way, and the finished rewrite replaces the version before. A rewrite whose pieces do not join is dropped and the version before kept. Before going on, Continue cleans the kept part and saves it so: the model's reasoning is cut off, and so is everything from the line before its first parse error that is not just the cut-off end (Java as JavaParser reads it, JavaScript's brackets); a clean part is resumed however short it is, and a part is dropped (the file then written whole) only when it has no class or other type declaration, or when this cleaning took most (four fifths) of it away. The pieces are joined: an exact repeat of the end (at least 20 characters that are not spaces) is written once, anything shorter is kept, a continuation that starts the file again is taken whole when it covers what was written and else asked for once more, strictly; code fences and up to two short lines of prose before them are dropped (a Markdown file keeps its own fences). A JSON answer cut at that cap fails with a message to use a model or plan with a higher output limit. A server that writes under 256 tokens a minute is reported as too small.
- On a server with a small per-minute token limit (under 12,000 tokens, prompt and answer together, as learned), the first prompt for a file leaves room for its whole answer, so it comes in one call: the answer is expected to be about as long as the current file (a change to it) or a typical size for its layer (a test about 3,000 tokens, a screen 2,500, a service 2,000), and prompt and answer are kept within 90% of the limit by leaving out, in this order, the examples, the OBDX knowledge, the designs and the change's files the plan item does not name, then by shortening the rest. A fix attempt (a file that failed its checks) is fitted the same way: only the file, its rules and the findings are sent (no examples, knowledge, designs or other files), and when even that leaves no room for the answer, only the Java methods with findings are sent with the file's outline, and the methods that come back replace them by name (the file is checked again). Comments that carry the model's reasoning ("// The prompt asks ...") are taken out of a whole answer before it is checked, instead of asking for the file again ("Removed N comment line(s) of the model's reasoning from X"). A whole answer whose fix the limit stopped is kept: as the content of a file that had none, with the check it failed, or beside the file's version as its rewrite, which the next Write again checks and fixes rather than continues.
- max_tokens is never above `FACTORY_MODEL_MAX_OUTPUT_TOKENS` (8,192 when it is not set and a limit gives a size); a per-minute total sizes it only when the total is small (under 12,000), so a large plan's headers (OpenAI's 30 million, Groq's 300,000) do not. A refusal such as "max_tokens must be less than or equal to 32768" is learned and kept as the most one request may ask for, and a model that asks for `max_completion_tokens` instead gets that. Learned limits below 1,024 input or 2,048 tokens a minute are taken as unknown, input and per-minute totals are learned only from refusals of size (413, 429, or a 400 about the context or tokens), a larger prompt the server takes raises a learned input limit, and stored limits older than 7 days are not used. Administrators can forget the learned limits on the Models page (Model Evaluation, **Forget learned limits**; `POST /api/model/limits/forget`). One job (an analysis or a generation) waits on rate limits for at most 10 minutes in all; then it stops as at a limit, and its files can be continued. The model server address may not carry a user, password or query, and the log shows only its scheme, host and port.
- What each call did is in the log (INFO): the prompt's size, max_tokens and scale; each wait for a rate limit (how long and the server's reason); the limits used at start ("Using stored limits for <model>: input N, output N, total N (at <server>)", or "No stored limits for <model> at <server>"), whether thinking is turned off ("Thinking turned off for model 'x' (/no_think, reasoning_effort none)") and each per-minute token limit learned, from a refusal or the response headers; and a continuation dropped (it started the file again, was the model's reasoning, or did not repeat the last line) or an empty answer. Every request made again says why: a fix attempt (the first finding), each continuation (the output limit, or why the last piece was dropped), the missing methods asked for, a prompt refused as too large (asked again smaller, never larger than the refused one), a rate limit waited out.
- When a model stops at its output limit (on Ollama, at the end of its context), the answer is incomplete. A spec is asked for again, shorter. A change plan is continued: the files it planned whole are kept, and the model is asked (with the same context) for only the files still missing, up to 6 times (2 on Ollama), until an answer is whole or adds no file (a plan still unusable after its continuations fails the analysis rather than being asked for all over again); with a known output limit under 2,000 tokens it is asked for short purposes and details from the start. If the plan is still cut off, or the model's limit stops a continuation, it is kept with a risk saying files may be missing. A cut-off code file fails its checks with that reason rather than passing silently. A cut-off test file whose code (not its comments) already names each acceptance criterion its plan item names (AC-001 in a test name, a DisplayName or a test body) is asked once to finish and close; if that is cut off too, it is closed after its last whole test. A method a continuation writes again with the same parameters is left out (the first is kept) before the joined file is checked, even when the file does not parse; when the first copy was never closed, that copy goes instead, up to the next member of its class, and the whole second one stays.

The spec goes to impact analysis and code generation without empty values or the answered questions, with requirements and acceptance criteria first, so a prompt that has to shorten it drops the background lists (scope, assumptions) rather than the requirements. While code is generated the change shows which file is being written ("Writing file 3 of 16: ...").

After generation, and on **Check again**, checks that need more than one file add warnings:
- **Unresolved imports:** a Java file imports a class from the bank's own packages (those starting like the file's package, such as `com.bank`) that is neither in the imported code nor in the change. An import under the bank's root package (the common prefix of the indexed code's packages, such as `com.bank.obdx`) is reported even when its package has no file at all (`com.bank.obdx.payments.payments`, a package the model made up), unless a folder of the package is named generated, gen or stub. This is a warning: a bank library jar under the same root (com.bank.common) that this repository does not hold is reported too, and can be left as it is. Outside the bank's root only packages that the code or the change has files in are checked: the others come from libraries, such as OBDX's own `com.ofss.digx` jars for extension code. A nested class (`com.bank.x.Outer.Inner`) is looked for in `Outer.java`.
- **View bindings:** a JET view binds names its view model does not define. The view model is the `.js` file of the same name, or a `model.js` with observables beside the view. Both function view models (`self.x =`) and class view models (fields, methods, getters, `this.x =` in the constructor, `Name.prototype.x =`) are read.
- **Invalid bindings:** a binding is not a valid expression, such as `nls.fund-transfer.title` (a subtraction such as `items().length-1` is fine).
- **Classes not written:** a Java file uses a class of its own package that the plan creates but that is not written yet.
- **Methods that do not exist:** a Java file calls a method on a class of the change (a resource calling its service) that the class does not declare, or with another number of arguments. Static calls (Class.method()) and nested types (Outer.Inner, new Outer.Inner()) of classes of the change are checked the same way. Names in comments and strings do not count as uses. Only the called class's own methods count: a nested class in it that implements an interface (HostLookupCallable implements Callable) does not turn the check off, while the class itself extending or implementing another does.
- **Methods never written, or written twice** (errors, the file fails; in the file's own check and in the Write again note): a Java file calls a method without a qualifier (createValidEntry(...)) that no class in the file declares and that is not statically imported, or declares a method twice with the same parameter types. The first is not checked when a type in the file extends a class or implements an interface that is not the JDK's (it may inherit the method), or with a static import of all of a class's members; a call the file had before the change is not reported.
- **Names nothing declares:** a Java file calls a method on a name (validationService.validateFormat(...)) that is no field, parameter or local variable of the file. Not checked in a class that extends another, or inside an anonymous class of a type not of the JDK or a nested class extending one (they may inherit the field), with Lombok, or with a static import of all of a class's members.
- **Missing JDK imports:** a Java file uses common JDK classes outside java.lang (HashMap, List, Optional, ResourceBundle, Collectors, ExecutorService, AtomicInteger, Function, Pattern, BigDecimal, LocalDate, DateTimeFormatter, SimpleDateFormat, IOException, StandardCharsets, SQLException ...) without importing them, and no class of its own package has that name; not checked for a name when the file has a wildcard import of a package that could hold it (com.ofss.fc.datatype.*, java.sql.* for Date), or a type in it inherits from one that is not the JDK's.
- **Classes that are nowhere:** a Java file uses a class of its own package (AuditRepository) that is not planned, not written and not in the imported code. Checked only when Java code is imported, and not with a wildcard import or when a type in the file inherits from one that is not the JDK's (it may bring nested types).
- **View model order and names:** a JET view model calls this.load() at the top of its constructor before the line that sets this.load, calls a name (this.amount()) it sets nowhere, or loads a module in its define list that no other file loads and the RequireJS configuration does not name (JET's own modules are known).
- **Define list and resource bundles** (errors; a destructured parameter keeps its position and is not judged; files over 200 KB or with lines over 4 KB are not read): a parameter receives a module of another position than its name says (`oj` receiving `ojs/ojknockout` instead of `ojs/ojcore` or `ojs/ojcore-base`, `ko`, `$`, `ArrayDataProvider` ...) or is used as an object although its module only registers elements (`ojs/ojbutton`), a module of the code base (`./model`) that this change writes is listed after the last parameter so nothing receives it while the file calls its functions, or the resource bundle (`ojL10n!nls/x`, when the change writes it) is used with `.get(...)` (a bundle is a plain object) or with keys its file does not define.

Methods or nested types the called class of the change lacks, names nothing declares, missing JDK imports and the define list and bundle findings are errors: the other files make them certain, so the file fails, and after a full generation each such file the model wrote in that run is fixed once (at most 5 files; never a reviewer's edit, never on Continue): the model gets the file and the findings, and the fix is kept only when it is whole and the file's own checks find it no worse; when the model's limit stops these fixes, the change says the files are written and which fixes were not made; **Check again** and the quick checks before a build report them as errors too. The others are warnings because a class can come from a library jar, and a view model can take names from elsewhere. Each cross-check replaces the findings of the previous one, so a file written again shows only its current findings, and goes back to its own status when none are left. When a file is written again (**Write again**), its cross-file findings go to the model as problems to fix.

## UI Design Studio

The **UI Design Studio** (`?ojr=studio`, "UI Design Studio" in the menu) is the way from a BRD to approved screens; the
Visual Designer below is for detailed work on one screen. See `docs/DESIGN-STUDIO.md` for the design note.

- A **workflow bar** stays at the top while the page scrolls: the BRD, the five stages (BRD, Spec, Screens, Approve,
  Code) and the next action: upload a BRD (it is drafted as on the Requirements page), review and approve the spec
  (opens it on the Requirements page), **Generate screens**, approve them all, and **Generate code** (starts the change
  and opens it on the Changes page; before the workspace's code is imported it says so instead).
- **Requirements** (left): the BRD's functional requirements (FR-001 ...) with priority, screens, how many are approved
  and what is still open (criteria not covered, decisions open, values to confirm); a search and a priority filter;
  **All screens**, and **Other screens** for screens no requirement names.
- **Screen flow** (middle; above the preview below 1440 px): the selected requirement's description, rules and criteria
  (each marked covered or not), then one node per screen in the order the customer meets them, with its status, the
  criteria it helps meet and its open items. Clicking a node, or the arrow keys, shows that screen in the preview.
  Below the nodes: **Approve the n screens**, the criteria no screen covers, the design decisions still open, and a
  summary of the channels, fields and OBDX components used.
- **The selected screen** (right): its preview as a **phone** (390 px), **tablet** (820 px) or **desktop** (1280 px)
  page, never shown below 80% so the text stays readable (a wider page scrolls inside the preview). The preview shows the
  BRD's labels and values only: a choice or table the BRD gives no values for reads "To be confirmed by the analyst"
  and is outlined; other values are left empty for run time. **Approve screen** or **Reopen** (Approve permission) and
  **Open in designer**, then one row of tabs: **Coverage** (the criteria this screen helps meet, values to confirm,
  decisions it waits for, and **Add them** when an input screen has no review and confirmation screens), **Refine**
  (Change with AI; **Regenerate this screen**, which saves the version generated from the approved spec again as a new
  version), **Edit** (title, labels and mandatory flags, saved as a new version) and **Compare versions** (what changed
  between two versions, and a preview of the earlier one). Refine and Edit show to the Analyst and Developer roles.

## Screen designer

1. On the **Designer** page (from a screen's **Open in designer** in the UI Design Studio), pick an **approved** requirement and click **Create designs**: one design per screen of its spec, with every field mapped to a component (dropdown fields become selects, "max length 35" becomes a 35-character limit, and so on). Only a maximum length becomes a limit ("Max 5 chips", "Max 2 decimals", "Min length 8", and "Up to 13 digits and 2 decimals" on an amount do not). A screen whose fields are mandatory, validated or choices keeps its inputs even when its name sounds like an inquiry ("Retail Dashboard"), and a review takes the fields of the nearest earlier screen with inputs. A field listing records ("Last five runs") is a table, read-only, with the columns its text names ("Table with Date, Amount, Status, Failure Reason for last 5 entries"); a list screen drafted without fields takes its columns from what its requirement says the list shows; payee chips or quick-picks are an optional checkbox set; a lone "Done" on a confirmation gets "Go to dashboard"; a list whose requirement lets the customer cancel gets Cancel (unless it has a button such as "Cancel Instruction"). A design with no channel named is for all channels, as the preview and code generation treat it; the designer's checks say so, and warn about a screen without fields. Choice fields offer the values the spec names ("One of: Daily, Weekly, Monthly" in the field, values in parentheses such as "User selection (Own Account / Payee)", or a business rule such as "Frequency can be Daily, Weekly or Monthly"), and a field noted "shown when Later", "shown when Later is selected" or "shown and mandatory when Transfer Timing is Later" is shown (and, for the last, required) only when the field offering Later has it ("visible if Frequency is Monthly" names the field). Review and confirmation screens (but not a step where the customer enters an OTP, PIN or password, such as "Verify OTP") show the captured fields read-only, with Confirm, Back and Cancel (review) or Go to dashboard and Start another (confirmation); a review the spec drafted with no field or a single "details" placeholder takes the fields of the initiate screen before it; a field of its own is never replaced. A list or history shows its fields as table columns; a details screen shows them read-only. The channels are those the spec names (summary, scope, requirements, answers) together with those the document states in its scope and non-functional sections ("NFR-003: desktop and mobile web"), else those the whole document names, else all. A sentence that excludes a channel ("the desktop must see no change", "out of scope"), a question answered no ("on the tablet app? No"), quoted message text ("Use desktop banking ...") and "browser" alone do not count. A blank screen can also be started.
2. The designer is one workspace: a **top bar** (workspace and screen, status, unsaved changes, preview size, Import, Share, Approve, Discard, Save; **+ New screen** opens a drawer to create screens from an approved requirement or a blank one), on the left **Components** (the palette) and **Layers** (sections, components and buttons as a tree; drag to reorder), the **canvas** in the middle (the live preview: click a component, section or button to select it, drop palette components on it; **Ask AI** below it), and on the right the **inspector**: **Properties** of the selection (a component's basics, data, rules and help; a section's title and columns; a button's label and style; the screen's title and name when nothing is selected), **Comments**, **History** (versions, with loading an earlier one), and **Code** for React Native or React workspaces.
   Without a screen open, the page lists each approved requirement with its screens, their status and how many are approved. A screen made from a requirement shows the **journey** above the canvas: all screens of the requirement in the order of its spec, each with its status, with "plan the change" once all are approved. The canvas shows the screen inside an OBDX page (the workspace's bank in the header, a breadcrumb, sections as cards) filled with realistic sample data chosen from field names (accounts with balances, share symbols, order references, amounts, dates). **Checks** (in the inspector with nothing selected, and as a chip in the top bar; problems are also marked on the canvas): every field of the requirement's screen is placed (**Add** places a missing one), no placeholder choices or columns are left (**Fix with AI** passes what the requirement says about the field), mandatory is set, the bank's components have their parameters, no section is empty, and there is exactly one main button. The requirement's business rules for the screen are listed below the checks.
   The side panels float over the canvas; « and » collapse them to rails at the sides (the canvas then uses the full width), and the rails open them again; this browser remembers which are open. A component's **Code** group (HTML, CSS, JS) holds the designer's own code for that element (`html`, `css`, `script`, up to 20,000 characters each): CSS styles the element where it is (declarations, or rules where `&` is the element); HTML replaces how the element is drawn, and JS runs with it, in a sandboxed frame without the factory's origin (`sandbox="allow-scripts"`), so a script cannot reach the factory or a reviewer's session; **Start from the generated markup** fills in plain markup for the element. Code generation uses the html as the element's template, the css in its styles and the script's behaviour in the view model.
   **Three zones (UI declutter step 10).** The title row keeps **Design / Code**, **More** (new screen, create a component, import, all screens), **Preview** and **Save Version**; the breadcrumb names the page. On the left, three tabs: **Components**, **Layers** (a tree: ↑ ↓ Home End move between rows, Enter selects, Alt+↑ / Alt+↓ moves the selected component; a grip marks what can be dragged and a line shows where a drop lands) and **Screens**. Above the canvas a toolbar sets the screen size (desktop, tablet, phone, or an exact width), the zoom (− Fit/100/75/50 % +), **Validation** (each field shows the messages it gives when checked: "required" follows what is typed on the canvas; written validations are shown as text, not run) and **Focus order** (numbers in the order the Tab key reaches the fields, then the buttons; read-only values, tables and elements with their own code are left out). The inspector on the right is one list of sections: **Properties**, **Data Binding**, **Validation**, **Visibility Conditions**, **Events and Actions**, **Style** and **Accessibility** (for the screen: checks, properties, data binding, events, the focus order, and what the requirement says). Business rules, APIs, host interfaces, roles, validations, comments, history and the AI Assistant share one drawer under the canvas, closed until a tab is chosen; **History** compares two versions (or the unsaved changes) in plain words, and shows or restores the earlier one. Leaving the page with unsaved changes asks first.
   **Compatibility** with the workspace's OBDX version comes from evidence only (`GET /api/workspaces/{id}/design-compatibility?element=…`): **verified** when the bank's imported code uses or defines the element, **unsupported** when a rule of the version pack forbids it in views (for example `oj-select-one` on 25.x), and **unverified** otherwise, including every element before the code is imported. Layers mark each element (✓ ✕ ?), the inspector shows the evidence, and the canvas toolbar counts them. Form controls are the factory's own types (written as Oracle JET elements); nothing is called an OBDX component because of its name.
   **Undo** and **Redo** (Ctrl+Z, Ctrl+Y) step through every edit since the screen was opened; **↺ Previous** and **Restore this version** in History save an earlier version again as the newest one (origin `RESTORED`), so no version is lost; **Show on canvas** puts an earlier version on the canvas to look at or save. **Ask AI** changes only the selected component, section or button (the bar shows which; ✕ or selecting nothing makes it the whole screen): the model is told the element, and the factory keeps only that element from its answer, plus components it adds right after a selected component. The **screen size** picker shows the canvas at desktop 1440, laptop 1280, tablet landscape 1024, tablet 768, phone 390, small phone 360 or a custom width, scaled down to fit when wider than the canvas; the OBDX page in the preview is responsive (the menu collapses below 900 px; on phones the margins shrink and buttons stack). **+ Create component** has the model write a reusable component as HTML, CSS and JS from a description, an image (with a model that reads images) or PDF, or a Figma frame; it is stored for the workspace (`custom_component`) and listed under **Custom components** in the palette, and placing it copies its code into the element, where it can still be changed.
   **Values from an API**: a dropdown, account selector, radio, checkbox or table can load its values from an API (`dataSource`: `api`, `path` of the list in the response, `valueField`, `labelField`; the requirement's APIs are offered), shown on the canvas as "⇄ GET …"; code generation calls it through the screen's model. **Conditions**: "Show only when" and "Mandatory only when" another element has a value, is empty, is or is not a value (`visibleWhen`, `requiredWhen`); the canvas follows what is typed in the other element (while designing a hidden element stays, faded; on the review link it is hidden). **Stage**: each screen is initiate, review, confirm or inquiry (guessed from its name when made from a requirement); **Create review and confirmation screens** makes both from an initiate screen (every field read-only with Confirm, Back and Cancel; the outcome with a reference and Go to dashboard), and a check flags an initiate screen without them; code generation builds them as one OBDX flow, the way the bank's code does. **Channels**: desktop web, tablet, mobile web and mobile app (none: all), detected from the requirement's text when the screens are made; the canvas opens at a phone or tablet size for mobile- or tablet-only screens, and code generation builds for those channels.
   The **Components** palette on the left lists what can be dragged onto a section (or before a component), or clicked to add after the selected one, grouped as in the OBDX UX Extensibility Toolkit: **Forms** (the standard types, including a table whose options are its columns), **Controls** (a button), and what the workspace's code contains: **OBDX framework components** (folders under `framework/`, and account-input, amount-input, page-section, row and others when screens use them), **Business components** (a folder `name/` with `name.html` and `name.js`, or a `loader.js`, under the module folder), **JET composite components** (`component.json`), **Partials** (HTML under `partials/`), the **JET components** the code uses, and other custom elements and Knockout components it uses. Parameters come from the definition (`params.x` in the component's script, `properties` of `component.json`) and from how screens pass them (`params="..."`, `component: {name, params}`). A component from the code is stored with type `component`, its name (`component`) and parameter values (`params`); the preview shows account-input, amount-input and page-section like OBDX and others as a labelled placeholder, "Ask AI to change the screen" may use them, and code generation uses them as the code does. The palette is read from the working copy and rebuilt after each import.
   **Import a design** turns a design made elsewhere into the screen's next version (origin `IMPORTED`): a **Figma** frame (its link from "Copy link to selection" and a personal access token, which is used for that request only and not stored; the factory reads the frame through the Figma REST API as an outline of frames, texts and component instances in reading order, without hidden layers and decorative shapes), a **PDF** exported from any design tool (Adobe XD, Sketch, Figma; its text in reading order, so it works with any model), or an **image** (PNG, JPG, WebP up to 10 MB; sent to the chat model, which must read images). The model follows the design's sections, order, labels and buttons, picks component types (and the bank's components from the palette), keeps the id, name and validations of fields that match the current screen, and keeps fields from the requirement that the design leaves out at the end. Load an earlier version to undo.
3. The preview on the right renders the design with real Oracle JET components and sample data, at desktop, tablet or phone width. It runs in an iframe (`?ojr=preview&embed=1`) and receives the model with `postMessage`. Clicking a component in the preview selects it.
4. **Ask AI** applies a change described in words ("move remarks to the end and make it optional") and saves it as a new version. Every save is a version; older versions can be loaded back into the editor.
5. **Share for review** creates a review link (valid 14 days, replaced by **New review link**, ended by **Close link**). The customer sees the preview without the factory's navigation, can click a field to comment on it, and can approve. **Approve** in the designer does the same for the team. Approved designs are locked until reopened.

Limitations: the preview uses this factory's JET version and the Redwood theme, not each bank's own JET version and theme. Enhancing an existing screen starts from the spec's fields, not from the screen's current layout in the code. Anyone with a review link can comment and approve, so share it only with the intended reviewers.

## Changes: impact analysis and code generation

1. On the **Changes** page pick an approved requirement and click **Analyze impact** (Developer or Lead). All screen designs created for the requirement must be approved, and the workspace's code must be imported.
2. **Impact analysis** searches the code for each screen, field, business rule, API and host interaction, and sends the model the approved spec and designs, the Project Profile, the folder structure and up to 25 relevant code excerpts. The model answers with a plan: each file to create or modify, its layer (data, integration, service, ui, test, config), its purpose, the files whose patterns it follows, and risks. The plan is checked: paths must stay inside the repository, "modify" is only kept for files that exist, and files are ordered data → integration → service → config → ui → test.
3. A **Lead approves** the plan (it can be edited as JSON first, or analyzed again). Only then is code written. The plan's risks also say when the spec has acceptance criteria but the plan writes no test, when a new class has the name of an existing class in another package (reuse it rather than make a parallel one), when an API of the spec has no planned REST resource or controller whose name matches its path (in a plan with Java code, or in any plan when the scope or the functional requirements ask for new REST endpoints, "a new REST service", "shall expose REST endpoints", "shall expose POST /x", and the existing code does not serve the API), and when a new REST resource would sit on a path the existing code already serves (from its `@Path` annotations) or under a path of OBDX's own services (`/payments`, `/accounts` and so on). A plan item that is a build or CI file (`Jenkinsfile`, `pom.xml`, `build.gradle`, `package.json`, `Dockerfile`, `*.sh`, `*.bat`, `.github/`) starts its purpose with "[Build or CI file]", and the plan gets a risk naming those files: the build runs them on the build agent, so a requirement document must not slip a step in there. Plan paths and example files are read only when they really are in the working copy: a symbolic link to a file outside it is not followed.
   **Impact Analysis page** (route `impact`, opened from Changes): the change and its plan's status come first: its title, status, revision, OBDX version and requirement, a line saying what approval unblocks ("Code generation is blocked until the plan is approved"), an open request for changes, the plan's description (editable while it waits), its numbers, and **Approve Plan** (asks first), **Request Changes** and **Analyze Again**. One row of tabs follows:
   - **Affected Files**: path, operation (Create or Modify: a plan cannot delete files or list unchanged ones), module (from the path), reason and details, requirement (the FR/AC/BR references in the reason, else the change's requirement), and evidence (exists in the code or new, the files whose patterns it follows, named in a risk); filters by layer (chips with counts), operation, module, text and "named in a risk". The plan records no confidence per file, so none is shown.
   - **Dependencies**: the layered view, where a file is a button that focuses on it and the files of the layers next to it, the legend switches layers off and on, with zoom and full screen; the arrows are inferred from the layer order.
   - **Risks**: the analysis's risks grouped by what PlanReview checks (missing tests for the acceptance criteria, an API of the spec no file serves, a new REST resource under an OBDX product path or a path the bank's code serves, a class named like an existing one) and those the model named; the tests in the plan, and files no test names (a name match only). Version compatibility is not checked on a plan: the version pack's checks run on the generated code.
   - **Revisions**: every plan from the analysis and every edit before approval (`change_plan_revision`, V29; plans made before it are revision 1), compared in plain words (files added, removed or changed, description, risks).
   - **Review**: comments (COMMENT right), **Request Changes** with its reason (APPROVE right, only while the plan waits; it does not change the status, so the plan stays unapproved and no code is generated until it is edited or analyzed again and approved), and the approval, in one history (`change_plan_comment`, V29).
   - **Requirement**: the spec's screens and APIs.
4. **Generation** writes each file completely, in plan order, with the files already written that it most likely uses (those its plan item names, those sharing its name's stem, those in its package), Java as signatures only (fields, method signatures, nested types), so a prompt fits a small input limit; (within a layer, data types first, then services, then REST resources; in a UI, resource bundles, models, view models, then views) with the current content (for modified files), example files to follow, the start of files already written in this change, and the spec, designs and profile. Java, JSON and XML must parse; if not, the model gets the error and tries again (twice at most). JavaScript and HTML get a basic bracket and tag check that only warns. Existing files over 80 KB are not rewritten; change those by hand.
5. **Review**: each file shows its diff and full new content. Reviewers can edit a file or have it written again with an instruction. If writing it again fails, the previous version and its checks are kept and the change's message says why.
   **Changes workbench** (route `changes`): the change comes first: its name, workspace and OBDX version, requirement, status ("Partly written" while planned files are missing; Delivered only once the SVN commit succeeded), the files by state (created, modified, cut off, failed, not written, unchanged; each count filters the tree), the validation state (quick checks, Jenkins), and the next action with its button where the user may do it. A partial generation is named in a warning: how many files are written, cut off by the model's limit (their part is kept) or not written, that Continue generation goes on from where it stopped, and that delivering now leaves them out. Below, three panels with two draggable dividers (`changes-files`, `changes-code`; stacked on narrow screens): the file tree, marked by state and usable with the keyboard (arrows, Home, End, Enter, left and right for folders); the open file as a diff, side by side (original and generated) or whole, with line numbers and syntax colours (`services/syntax.js`: Java, JavaScript and TypeScript, HTML and XML, SQL, CSS, JSON, properties), with Write again and Edit only while the code is being reviewed (the server allows them then); and a side panel with one row of tabs: **File** (the requirement items its plan entry names, else the change's requirement; the reason and details from the plan; the generation: state, attempts, edits, a kept rewrite; the quick check and the last build's errors that name it), **Validation** (quick checks per file, build errors, test failures, build history, Build with Jenkins), **Plan** (with Edit the plan, Download patch and Approve), **Assistant** and **History**. For a cut-off file, Write again without a note goes on from the kept part; with a note it starts afresh. Submitting for review, an incomplete submission or patch, closing as merged and abandoning all ask first, as before.
   **Build, Test & Review** (route `build`) is a quality gate dashboard for one change. Six gates, each from the results the factory has: **Build** (the Jenkins jobs, last round of the last run), **Unit tests** (the failed cases of the Jenkins JUnit report; Jenkins sends no counts, so a passed build with no failed case is "passed"), **Integration tests** (nothing reports them separately: always "not run"), **Static checks** (the quick checks of the written files), **Security checks** (the version pack's security rules among them: hard-coded credentials, SQL built by concatenation, eval, inline scripts; no security scanner reports to the factory) and **Requirement coverage** (`GET /api/changes/{id}/coverage`: the acceptance criteria the written tests name, those named only in code, and those named nowhere; traceability, not a test result). Each is Not run, Running, Passed, Passed with warnings, Failed or Blocked (could not run or finish because of an earlier step); the verdict is never "passed" while a gate has not run. Findings (severity, check, file and line, summary, linked criteria, the round's log, the code around the line) come from the last run only. Runs lists every build of the change (quick checks, Jenkins rounds, fix rounds) and compares two (result, new errors, fixed, still failing). Build with Jenkins, Run quick checks, Write the file again, Submit for Review and the patch are offered only when the server takes them; an incomplete change or patch asks first, as on Changes. A round that never got a result (Jenkins could not be reached, or the server restarted) is closed as NOT_BUILT with the reason.
   **Agent Runs** (route `agents`) is an audit view of the AI work, built from the records the factory keeps (it has no run table): specification drafts, screens generated for a requirement, impact analyses, code generation, build fix rounds and code imports. Each run has one outcome: Succeeded, Partially completed (code generation that wrote some planned files), Failed, Timed out, Quota exhausted, Interrupted (server restart), Running or Queued; the stop reason comes from the message the factory wrote. Filters: search, agent, workspace (the top bar's when the page opens, or all), requirement and the date started; the outcome tabs count what the other filters leave. A run shows a timeline (timed events in order: the record's own times, the plan's revisions and review comments, and for administrators the audit log entries that name the record; events kept without a time follow), its inputs and outputs as links to the requirement, designs, plan and change, the duration (with ~ when it comes from a record's created and last-updated times) and the failure reason. The model, prompt version and token usage of a run are not recorded and the page says so; prompts are not shown. Retry (a failed draft, analysis or import), Analyze again (a plan waiting for approval) and Continue generation (`POST /api/changes/{id}/continue`, a change with planned files not written) are offered only where the server takes them and the user has the permission; runs cannot be cancelled. Impact Analysis and Build, Test & Review open the change Agent Runs links to (`pageRequests.change`).
   **Knowledge Explorer** (route `knowledge`) is the workspace's bank code as the factory indexed it. A bar at the top gives the index's revision, file and piece counts and last import, and its freshness: Up to date or N revisions behind only after "Check for new commits" on the Code page (kept per workspace for the browser session, `workspaceSelection.headChecks`); the page itself never asks SVN. Tabs (arrow keys): Code (tree, folder files, viewer, compact file details, AI insights), Search (file names from the index's file list, then the indexed code with kind and symbol), APIs, Screens, Service calls and Diagram (the modernization scan), Business rules. AI insights are marked AI-generated, get the file with line numbers and are asked to cite lines; cited lines are listed, marked in the viewer and open in the Code page; any manual or note the knowledge base added is listed apart, named by kind. Open in Code opens the file in the Code page's viewer at the cited lines (`pageRequests.codeFile`). An unreachable factory gives a plain sentence, not "Failed to fetch".
   **Version Packs & Bank Standards** (route `packs`) shows one pack per OBDX version: its status (active with the number of workspaces on it, or supported), the UI targets its workspaces build for (OBDX's JET UI, plus React or React Native where a workspace has an app folder), its Java level, and its rules by source. **Rules & Standards** lists them in three groups, the factory's version pack rules, the bank's standards (files in `FACTORY_PACKS_DIR`, read at startup) and the UI target pack's, each with its file, severity, enforcement (blocks the build, a warning, not checked for this codebase, or off), approval (ships with the factory, set in the bank's pack folder, or turned off by whom and when) and evidence (findings in the last quick checks of the workspace's changes). Recipes say which OBDX versions they apply to (recipes.yml and common files: both). **History & Impact** lists the workspaces on the version with their open changes (each opens on Build, Test & Review), the rules turned off for the shown workspace, and for administrators the audit log's rule and reference-example changes on that version. It states that a pack change is never applied to existing work by itself: generated changes keep their check results until the quick checks run again or a Jenkins build checks first.
   **AI Prompt Library** (route `prompts`) is a governance view of the instructions the factory gives the model; it changes no prompt and not how prompts are loaded. **Editable templates** are the version pack recipes (the factory's and those in the bank's pack folder), **protected system prompts** are the factory's built-in tasks (part of its code). Each shows its purpose, category, target agent or task, version, status (In effect or Protected: the factory records no draft, review or retirement), the model it runs on (whichever chat model is set; none is tied to a model), last updated and approval (shipped in the version pack, set in the bank's pack folder, or factory code). **Versions** compares a recipe's guidance with the same recipe in the other OBDX version's pack (`GET /api/version-packs/{version}/recipes`); rollback is done in the pack files' source control. **Evaluation** shows the OBDX Library question set's last run for the answer task and runs the search evaluation (administrators). Text that looks like a secret (password, token, key = value, bearer tokens) is masked wherever a prompt is shown or copied, and a prompt that holds one says so. Edit stays disabled: templates change in the pack files, reviewed in source control, and take effect on restart.
   **Models & AI Providers** (route `models`) shows a provider as connected only after a test of it succeeded: tests (Test Connection, finding local servers) are remembered on the server since it started, with the last success and the last error, so a provider in use but not tested reads "In use" with its status "Not tested". Model Routing lists the tasks (BRD analysis, query enhancement, UI design, impact analysis, code generation, code review, knowledge Q&A, search) with the model each uses: one chat model and one embedding model for all, so a model per task is not offered; it states the fallback behaviour (no fallback provider; waits at a rate limit within a budget, stops at a daily limit, prompts built smaller to fit learned limits) and lists the limits learned from the provider. Privacy & Policies classifies the content: the OBDX Library's content is kept inside the bank unless FACTORY_KNOWLEDGE_EXTERNAL_MODELS is on (enforced), while bank code goes to the configured chat model wherever it is (not blocked), and explains rotating an API key (test with the new key, then save; the old one stays in use until then). Keys are never sent to the browser.
6. **Deliver**: A delivery made without them says so ("Committed 3 of 5 file(s) ... ; not delivered: ..."), the audit entry has the counts, and the file tree marks those files "not written". Delivery and the patch are refused while planned files are not written (pending, or the model could not write them), naming them; the page then asks whether to deliver without them (`?incomplete=true`). Only the confirmed request carries the flag, and the audit log records a delivery made without them. A Jenkins build in patch mode builds what is written and logs the files left out. **Download patch** gives a Subversion-style unified diff that applies with TortoiseSVN "Apply Patch" or `svn patch` on a working copy at the base revision. **Commit to SVN branch** creates `branches/factory/cr-<id>` from the base revision and puts the files into it in one commit (`svnmucc`); trunk is not changed. The SVN service account then needs write access to `branches/factory/`.

## OBDX Library (knowledge base)

The **OBDX Library** page (Workflow menu) holds Oracle's OBDX manuals per version, a bank's own documents for one
workspace, and knowledge notes. Code generation, impact analysis, requirement drafting and the AI Assistant panels use it.
It is about documents, not the bank's code (Code and Knowledge Explorer search that). A status line gives how many documents are
indexed, when the last one was, and the failed, running, not fully searchable and older ones and the notes to check, each
opening the Documents tab filtered to them. Documents filter by title, OBDX version, type (Oracle manual, bank document, patchset)
and source (Oracle's site, a watched folder, an upload), and show when each was last indexed and why a failed one failed. **Ask**
keeps Improve My Question and the answer detail and adds the OBDX version to answer for (the workspace's by default). An answer lists
the sources it cites (title, kind, OBDX version and patchset, section, pages) with **Open at page N** (the factory's copy) and Oracle's
page when known, and folds the sources searched but not cited. When the documents hold nothing on the question, an answer cites none
of them, or the check finds the evidence insufficient, the page says so first; an answer with no sources at all stays folded until
asked for.

- **Import**: an administrator imports Oracle's manuals of a version from a folder on the factory's computer (needs
  `factory.local-folders.enabled`; folder import and **Check now** are for administrators only, and the factory's own
  data folder `FACTORY_DATA_DIR` cannot be imported) or by uploading files (up to 150 MB each). With "bank's own documents" ticked, the
  files belong to the selected workspace only; a workspace's Managers import those too. The bank's own and
  patchset-specific documents can be PDF, Word (.docx, .doc), text, Markdown or HTML (an exported wiki page), and any
  import can carry a **patchset** (25.2.0.1, a patch number), shown with every citation. Each file is copied to
  `<storage>/knowledge/<id>.<type>`, read (PDF page by page with PDFBox; Word headings become sections), split into
  sections of at most about 1,800 characters with their own pages (headers, footers and contents pages dropped), and
  embedded in the background, one document at a time. The headings are the PDF's bookmarks when it has them (Oracle's
  manuals do: "2.2 User Management - Search and View"), so a procedure stays under its real section; otherwise numbered
  headings ("4.3 Transfer Limits", not the numbered steps of a procedure) and Word/Markdown headings. Without the
  embedding model a document is searched by keywords; **Embed again** finishes it later. Imports the factory stopped
  carry on at the next start. When the reading improves (`KnowledgeImporter.READER_VERSION`), the documents read before
  are read and embedded again at startup, in the background, one at a time.
  Each document remembers which embedding server and model embedded it. When the models change on the Models page,
  documents embedded by another model are embedded again and those whose embedding stopped (the model was
  unavailable, or outside the bank) are finished, in the background; the same happens at startup. Whether the
  embedding model is inside the bank is checked before every batch, so a model changed while a document is embedded
  never receives the rest of it.
- **Keeping it current**: Oracle republishes manuals for patchsets and fixes, and banks update their own documents. A
  file already imported (same content) is skipped. A changed file with the name of one already imported for that
  version and owner is a **newer revision**: the older one answers until the newer one is ready, then it is kept as
  history (Show older revisions) without its sections. Notes citing it move to the newer revision; a note whose cited
  section changed or is gone gets a "to check after updates" reason, and an approved one goes back to suggested, so code
  generation does not follow outdated guidance until someone approves it again. Every imported folder is **watched**:
  checked again every `factory.knowledge.folder-check-interval` (default 6 hours, `FACTORY_KNOWLEDGE_FOLDER_CHECK_INTERVAL`)
  and on **Check now**. Put Oracle's updated PDFs (or the bank's) in the folder, a shared drive works, and the factory does
  the rest.
- **Oracle's manuals from Oracle's site**: an administrator picks an OBDX version and **Get and keep current**
  (technical guides, or all manuals with the user manuals). The factory reads Oracle's documentation index
  (`factory.knowledge.oracle.index-url`) for the version's releases, each release's library page for its manuals, and
  takes the newest patchset's file of each (22.2 has a folder per patchset, 22.2.1 to 22.2.6). Then, and every
  `check-interval` after (default 7 days, looked at hourly; **Check now** too), it asks Oracle for each file only if it
  changed since the last check (ETag, Last-Modified): an unchanged manual is one small request, so a weekly check of 40
  manuals is about 45 requests and no downloads. Requests go one after another with a pause (`pause`, 2 s), one check at
  a time; downloads go through the same queue as uploads, one document read and embedded at a time. Every file must pass
  a safety check before it is kept: HTTPS to Oracle's documentation hosts only (`hosts`; every redirect is checked
  too, links to Oracle's staging copy go to the published site), at most `max-file-size` (150 MB), a real PDF that
  opens without a password, with no scripts, automatic or launch actions and no embedded files. Only GET requests
  without cookies: nothing of the bank's is sent to Oracle. A manual already in the library (the same file) is linked,
  not imported twice; a changed one is a newer revision, as above. Nothing contacts Oracle until a version is followed;
  `FACTORY_KNOWLEDGE_ORACLE=false` turns it off for factories without internet access, which import from folders.
  The factory uses the computer's proxy settings (`-Djava.net.useSystemProxies=true`, in the start scripts).
- **Search** is hybrid, as in code search: PostgreSQL full text and embeddings merged by reciprocal rank fusion, limited
  to one OBDX version line (22 or 25, from the workspace) and to the shared manuals plus that workspace's own documents;
  at most two sections of one document, so a long user manual does not crowd out the guide that answers. In the full-text
  part each word counts by how rare it is in the sections searched (inverse document frequency, counted with the
  index): in "how do I unlock a retail user" the sections about unlocking rank above those that repeat "user". A word in
  a section's heading counts twice, and the words around a question ("give me the steps for") count for nothing. Questions
  and sections are embedded the way the embedding model expects: `nomic-embed-text` with "search_query: " and
  "search_document: ", the e5 models with "query: " and "passage: ", Qwen3-Embedding with a task instruction before
  questions, the English bge models and mxbai with their query instruction; bge-m3 takes text as it is. The bank's own
  documents and notes rank a little higher, and the model is told they describe the bank's customised system and
  patchset and win where they differ from Oracle's manuals. On the trial
  database, which has no pgvector, the sections' embeddings are kept in memory (about 24 MB for the 22.2 and 25.2
  manuals) and compared there: a search takes well under a second instead of many seconds.
- **Ask** (Library page and every AI Assistant panel): the question is searched as asked and in the manuals' own names
  for things (a built-in OBDX glossary: a customer is a party or user, onboarding a user is User Management - Create or
  Self Registration, a beneficiary is a payee, a developer adding a field to a screen extends a UI component), which
  gives a short list of 15 sections: the best section of each manual first, so a developer's guide is on it next to the
  user manual that matches the words best, then the best of the rest. The chat model then picks from
  their headings and first words the ones that answer the question, best first: words alone cannot tell "onboard a
  retail customer" from Corporate or Biller Onboarding. It is one short extra model call (a few seconds; the better the
  model, the better the choice); `FACTORY_KNOWLEDGE_CHOOSE_SOURCES=false` keeps the search's own order. Then the
  question, the page the user is looking at (up to 3,000
  characters), the conversation's last three turns and the best five sources go to the chat model, which answers with
  [n] citations. Each source is a whole section (`source-chars`, 1,800) labelled with its manual, version, patchset,
  section path ("3 Extensible Points in Service Tier › 3.5 Domain Extensions") and page; what the
  `context-chars` budget (8,000) leaves goes to the parts of the same sections before and after the best sources, so a
  procedure cut in two arrives whole. Each source links to the factory's copy of the PDF at its page and, for manuals
  fetched from Oracle's site, to Oracle's PDF at the page. A follow-up ("and how do I clone one?") is rewritten by the
  chat model into a standalone question before the search, from the conversation; a question that does not lean on it is
  searched as asked. The Library shows what a follow-up continues from and offers **New conversation**; the AI Assistant
  panels send their own conversation. Administrators see under each answer how the sources were found: the question as
  searched, the short list with its scores, the sections the model kept, the search time and the size of the text sent.
  Answers can be rated (Helpful / Not helpful, kept for review) or saved as a suggested note. The prompt is sized for
  small local models with a 4k context; for larger models raise `factory.knowledge.answer-sources`, `source-chars`,
  `context-chars` and `page-context-chars` (`FACTORY_KNOWLEDGE_*`). On a laptop with 8 GB of
  memory a local 3B model needs one to two minutes per answer; a model server with a GPU or a cloud model answers in
  seconds. The answer streams in as the model writes it (`POST /api/knowledge/ask/stream`): the sources show as soon as
  the search finds them, then the words as they come, so a slow local model is read while it writes. The model timeout
  (`FACTORY_MODEL_TIMEOUT`) then counts from the last word written, so a long answer is not cut off.
- **Question understanding and answer quality** (`QueryUnderstanding`, `QueryEnhancementService`,
  `AnswerGeneration`, `AnswerPostProcessor`). Before the search, without a model: words no manual has are corrected
  to the nearest word the manuals use ("benficiary" → "beneficiary"; the vocabulary is counted in the background at
  startup and when the library changes), abbreviations are written out (txn, acct, config, SSO, TD), technical
  identifiers (`TransferService`, `digx.payment.timeout`, `DIGX-PY-0042`, file paths, quoted text) are searched exactly
  and never corrected, and a question with several parts ("explain the payment flow and how errors are handled") is
  searched part by part as well as whole. **Improve My Question** (`POST /api/knowledge/improve-question`) sends the
  question, the conversation, the workspace's version and the headings of the sections a search finds to the chat
  model, which rewrites it precisely or answers NEEDS_CLARIFICATION / AMBIGUOUS with questions; nothing is answered.
  Its reply is used only when it is JSON, keeps every identifier of the question exactly, brings in no name the
  question and those headings do not have, and says more than the question; otherwise the factory improves it
  without the model. A one- or two-word question whose sections fall in three or more chapters asks which is meant.
  The user edits the improved question and asks it (`improved` on the ask request), or cancels; their own question
  stays. Answers come **Concise**, **Detailed** (default) or **Technical deep dive** (`style`), laid out for the kind of
  question (procedure, configuration, troubleshooting, comparison, API, architecture ...), in Markdown, which the page
  renders itself (no HTML from the model): headings, lists, tables, code blocks with a copy button, and each citation as
  a link named after the section it cites ("User Management - Search and View, p. 79"; the whole reference on hover)
  that opens the manual at the page, the factory's copy or Oracle's; a note opens in the list of all sources, folded
  under the answer. Copy answer writes each citation out in full. Before it is shown, every answer is checked against its sources without a model: citations
  to sources that do not exist are removed ("[1, 3]" becomes [1][3]), identifiers, menu paths and code examples the
  sources do not have are marked, sentences about other vendors' products go, OBDX versions other than the
  workspace's are noted, each statement is compared with the words of the source it cites, statements and steps
  without citations are counted, invalid JSON is flagged, and the Markdown is tidied (one heading level, no empty or
  repeated sections, no repeated paragraphs, unclosed code closed, filler at the start and end removed). The answer
  is labelled VERIFIED, PARTIALLY_VERIFIED (with what the check found) or INSUFFICIENT_EVIDENCE. When the check finds
  what the model can fix (citations to sources that do not exist, unsupported identifiers, other vendors, most
  statements without a citation), the model writes the answer once more with the problems listed and the better of
  the two is kept; one attempt, never a loop (`FACTORY_KNOWLEDGE_CORRECT_ANSWERS=false` turns it off). The answer's
  `report` carries its kind, detail, summary, sections, code, tables, cited sources, limitations and the check. The
  checks find unsupported details; they cannot prove an answer right, and a statement that uses the sources' words
  for a wrong conclusion passes them.
- **Notes** are the knowledge that improves over time: written by users, drafted from the manuals (**Summarise a
  topic**), or suggested by the factory after a change is delivered (what changed, which files). They start as
  *suggested*; an administrator (shared notes) or an Approver of the workspace (its own notes) approves or rejects them.
  A note's source links are kept only when they go to a web page (http, https) or one of the factory's documents
  (`api/knowledge/documents/...`), and the page shows only such links, so a stored `javascript:` link cannot run.
  The AI chat may use suggested notes and says so; code generation and analysis use only approved notes and the manuals.
- **It stays inside the bank**: the knowledge (manual excerpts, the bank's documents, notes) and the questions to embed
  go only to model servers on the bank's network: this computer, private addresses (the host name is resolved and every
  address must be private), or hosts listed in `factory.knowledge.internal-hosts` (`FACTORY_KNOWLEDGE_INTERNAL_HOSTS`,
  for example `llm.bank.com,.ai.bank.com`). With a chat model outside, questions are refused with that reason and
  generation runs without the knowledge; with an embedding model outside, documents are searched by keywords only. The
  Library page shows why. `factory.knowledge.external-models=true` lifts this. It works with whichever OpenAI-compatible
  models are chosen on the Models page.
- **In generation**: impact analysis, code generation and requirement drafting get up to 4,000 to 5,000 characters of
  the most relevant manual sections and approved notes for the workspace's OBDX version.

## Quick checks and version packs

Every generated file is checked on the factory server in milliseconds, before reviewers see it and again before each Jenkins build:

- **Syntax:** Java is parsed at the bank's Java level (from the Project Profile's Java version, else the pack's default: 8 for 22.x, 11 for 25.x), so newer syntax such as records or text blocks fails for a Java 8 bank. If an existing file already uses newer Java, it is parsed at the newest level instead. JSON and XML must parse. JavaScript must have balanced brackets, strings, template literals, regular expressions and comments (else the file fails), and an AMD module's function cannot take more parameters than its define list has modules; names used as `X.` that the module neither receives nor declares are warnings. React code in a .js file (markup after return, => or "(", or an import of React), TypeScript, HTML and SQL get a basic bracket, tag and quote check (warning only). The model's own reasoning left in a comment ("Let's assume", "The prompt says", "As an AI", "In this response"), "For now, we assume", "Assuming the validation response has a way ..." fails the file (`no-model-reasoning`), so it is written again; so do phrases such as "for this exercise", "not defined in the prompt" or a comment opening with "Assuming the host ...". Stub code in the bank's code (not its tests) fails too (`no-stub-code`): "Placeholder logic", "Simulated", "In a real implementation", "TODO: call", "mock response/data"; sample people such as "JOHN SMITH" in a string are a warning (`no-sample-data`), not in placeholder or hint attributes or text bundles; mocks folders and stories count as tests; each rule reports at most three lines; a developer's words such as "we need to" do not count, and in HTML only <!-- --> comments are read.
- **Version pack rules:** YAML files in `factory-server/src/main/resources/packs/` (`common.yml` for all versions, `22.x.yml`, `25.x.yml`). A rule forbids or requires a regular expression in files matching path globs, for example no `System.out`, no SQL built by concatenation, no deprecated JET `ArrayTableDataSource`, javax vs. jakarta imports to match the codebase, labels from resource bundles, `DELETE`/`UPDATE` with `WHERE`. The format is explained at the top of `common.yml`.
- **Java checks** (`JavaChecks`, built in, with rule ids like the pack rules so a workspace can turn one off): errors for a JAX-RS method whose `@Path` has `{name}` but no parameter with `@PathParam("name")`, and for `@Context`, `@PathParam`, `@QueryParam`, `@GET`, `@POST`, `@PUT`, `@DELETE`, `@Produces`, `@Consumes` or `@Path` without its import (a wildcard of `javax.ws.rs.*` does not cover `javax.ws.rs.core.Context`); both fail the deployment (`java-path-param`, `java-jaxrs-import`). Warnings for exception text sent to the client (`e.getMessage()` in `.entity(` or in a returned string, `java-exception-text`), log messages built with `+` (`java-log-concat`), and a resource that takes `customerId`, `userId` or `partyId` from the request rather than the session (`java-user-from-request`), and the caller or user read from a request header such as X-Caller-Id (`java-user-from-header`).
- **Errors** go back to the model with the findings (like a parse error); **warnings** are shown to reviewers. Comments are ignored, and in modified files only lines the change added are reported, so the bank's existing code is never blamed.
- The model is told the rules for each file before it writes it.
- Rules can depend on the Project Profile (`minJet`, `ifProfile`). The **Code** page lists the workspace's rules; Manage code can turn a rule off for that workspace (audited) when the bank's codebase deliberately does it differently.
- **Team rules without rebuilding:** set `FACTORY_PACKS_DIR` to a folder with `common.yml`, `22.x.yml` and/or `25.x.yml`. Rules there are added; a rule with the same `id` replaces the built-in one; `enabled: false` removes it; `java:` sets the default Java level. Files are read at startup (restart the service after editing); a mistake stops startup with a message naming the file and rule.
- **Check again** on the Changes page re-runs the checks on all files (for example after changing rules).

The pack rules are starting points: confirm them against each bank's codebase and the Oracle documentation for the release.

## Closing changes and removing branches

Delivery branches (`branches/factory/cr-<id>`) are temporary. A change ends in one of two ways:

- **Close as merged** (Developer or Lead): for a delivered change, the factory asks Subversion's merge tracking (`svn mergeinfo`, the same information TortoiseSVN's merge dialog uses) whether every revision of the branch is merged into the workspace's trunk. If revisions are missing, it says which and offers **close anyway** (for changes applied another way, for example by hand). Then it removes the branch in one commit. For a patch-mode change it just closes it.
- **Abandon**: closes the change and removes its branch without the merge check.
- **Automatically**, every night (`FACTORY_BRANCH_CLEANUP`, a Spring cron expression, default `0 17 2 * * *`; `-` turns it off), delivered changes whose branch is fully merged are closed as merged by "factory (automatic)" and their branches removed. Merges done without merge tracking (copying files by hand) are not detected; close those changes by hand.

Removed branches stay in the SVN history and can be restored (`svn copy <branch URL>@<revision> ...`). The factory only removes branches it created, named `cr-<change id>` in the configured branch folder. A change that still has its branch cannot be deleted; close it first. Closing is recorded in the audit log.

## UI targets: React Native and React

Each workspace has a **UI target** (Code page, **UI target**; changes need Manage code):

- **Oracle JET** (default): enhance the bank's existing OBDX UI, as described above.
- **React Native** (iOS and Android, Expo, TypeScript) or **React** (web, Vite, TypeScript): build the screens of a **new app** that lives in its own **app folder** of the same repository (default `mobile` or `web`, relative to the workspace's SVN URL) and calls the existing OBDX REST services. OBDX backend changes still follow the version pack.

The packs are in `target-packs/` (see its README). Each has a **starter project**: navigation, API client for OBDX services, texts (`src/i18n/en.json`), form handling (`useForm`) and one form component per Screen Model type (`TextField`, `AmountField`, `SelectField`, `AccountField`, ...). Download it from the Code page (**Download starter project**), commit it to the app folder with TortoiseSVN and import again; the Code page says whether the app was found. Restyle the components or rebuild them with the bank's design system; generated screens keep working because they only use the components' props.

What changes with a React Native or React target:

- **Designer and customer review**: the preview renders the screen with the starter's own components, through React Native Web (phone size) or React, bundled into the factory (no internet needed). Check React Native screens on a real device with Expo (`npm start` in the app). **Code for the ... app** in the designer shows what a design becomes: the screen, its test and its texts.
- **Impact analysis**: the planner is told to build the screens in the app folder (screen, test, API file, texts, navigation, by the pack's `structure`) and not to change the JET UI.
- **Generation**: for each screen and test the factory first generates a starting point from the approved Screen Model (`ScreenScaffolder`): every field mapped to its component with the Screen Model id as `testID`, texts keys, required and length rules, spec validations as comments, actions wired to `submit` or `onAction`. The texts file is merged. The model completes it (loading options, calling the API file), with the pack's guidance and recipes and examples from the app itself.
- **Parity**: a screen must keep every field and action of the approved design as a `testID`; if one is missing, the model gets that as a failed check and fixes it (also on **Check again** and before Jenkins builds). The generated test checks the same at run time, plus the required-field messages.
- **Quick checks**: files in the app folder follow the target pack's rules (for example no HTML elements in React Native, OBDX calls only through `src/api`, texts through `t()`, no Oracle JET); other code keeps the version pack's rules. Both appear on the Code page and can be turned off per workspace.

Teams can adapt a pack without rebuilding: `FACTORY_PACKS_DIR/targets/<id>/target.yml` replaces the guidance and adds or replaces component mappings, structure entries, rules and recipes by id; files under `targets/<id>/starter/` and `targets/<id>/templates/` win over the built-in ones (for example the bank's own `theme.ts`). A folder with a new id defines a new target pack.

Generated screens were checked with the real toolchains: the React Native starter with a generated screen type-checks (`tsc`) and its tests pass (Jest, React Native Testing Library); the React starter builds (`vite build`) and its tests pass (Vitest).

## Modernization inventory

The **Modernization** page shows the migration map of a workspace's OBDX application, for planning a move of its frontend to React Native or React. It is scanned from the imported code after every import (and with **Scan again**), without a model, so the same code always gives the same inventory:

- **Screens**: classic JET views with view models (`views/x.html` + `viewModels/x.js`), OBDX-style component folders (`x/x.html` + `x/x.js`, with `model.js` and the `nls` resource bundle), JET composite components (`component.json`) and VDOM components (`ojs/ojvcomponent`). For each: module (the folder after `modules/`, or the nearest meaningful folder), files, fields (Screen Model type, label binding, value binding), actions (buttons), the services it calls (`baseService.fetch({url: ...})`, `xService.post('payments/transfers/' + id + '/approve')`, `url:` properties; variables become `{}`), the screens it opens (`loadComponent('...')`, router `go`, `navigate`), and a size: S, M or L from fields + 2 x actions + 3 x services + 2 x screens opened + lines / 50.
- **Backend REST services** in the code (JAX-RS `@Path` with `@GET`/`@POST`/..., Spring `@RequestMapping`/`@GetMapping`/...), marked Oracle product (`com.ofss`) or bank, with the screens that call them.
- **Services the UI calls**, matched to backend services (segments compared from the end, so prefixes such as `digx/v1` do not matter). Calls without a match are usually Oracle OBDX product services, which the new app calls as they are.
- **Roles and user segments** from `@RolesAllowed`, `@Secured`, `@PreAuthorize`, user-segment checks in the UI and segment folders (retail, corporate, admin, ...).
- **User flows**: screens connected by navigation, in the order they are reached.
- **Modules** with their screen counts and sizes, and **Download screens (CSV)** (opens in Excel) for wave planning.

The new app's folder (a React Native or React target) is left out. Navigation built from variables, and services called through helpers the patterns do not know, are not found; the counts are a starting point to check with the team.

## Recipes, templates and reference examples

The version packs also hold **recipes**: how the usual kinds of OBDX work are built. They are in `factory-server/src/main/resources/packs/recipes.yml` (all versions; a version file can add or replace recipes by `id`), with templates in `packs/templates/`. Built in: new UI screen, enhance an existing UI screen, new backend class, enhance a backend class, host integration (adapter), database script and unit test.

- Each recipe covers plan items by `action` and `layer`, and has **parts**, one per kind of file (for a new screen: view model, view, resource bundle), matched by path globs.
- **Guidance** (steps and conventions) goes to the model writing each matching file. The **planner** gets a short list of the recipes with the kinds of files each needs and the reference examples, so plans include all parts (for example the resource bundle of a new screen) and good `basedOn` files.
- **Templates** (with `<<placeholders>>`) are given to the model only for new files. The bank's examples win where they differ.
- **Reference examples** are files from the bank's indexed code. A part's finder (`examples.files`, `exclude`, `contains`, `count`) picks them: files in customization folders (from the Project Profile) first, Oracle product code (`com/ofss/`) last, mid-sized files preferred. On the **Profile** page, developers with Manage code can **pin** the files that show the bank's way best (and unpin them); pinned files come first. Generation uses the plan's `basedOn` files first, then these examples (two at most).
- Teams can add or replace recipes and templates without rebuilding: put `recipes.yml` (and `templates/...`) in `FACTORY_PACKS_DIR`. Templates are looked up there first, then in the built-in packs. A recipe with `enabled: false` is removed.

The built-in guidance and templates are deliberately generic: they describe what OBDX customizations usually need and let each bank's own code decide the details. Confirm and extend them against your codebases.

## Jenkins build validation

Each workspace can point at the bank's existing Jenkins jobs (**Code** page, **Jenkins** section; changes need Manage code):

- **Jenkins URL**, **jobs** (comma-separated, for example `obdx-backend, obdx-ui`; folder jobs as `folder/job`), **username** and **API token** (create the token in Jenkins under the user's *Security* page; it is stored encrypted with `FACTORY_SECRET_KEY`).
- **Mode**:
  - *Branch* (default): the job gets the branch the change was committed to. Set the **branch parameter** name (for example `BRANCH`) and whether it receives the path relative to the repository root (`branches/factory/cr-<id>`) or the full URL. The job's Subversion checkout must use that parameter in its repository URL, for example `https://svn.bank.local/obdx/${BRANCH}`.
  - *Patch*: for banks that do not allow the factory to commit. The job gets the patch as a file parameter (set its name, for example `PATCH`), checks out trunk, applies it (`svn patch`) and builds. Nothing is committed.
- The stored token is kept only while the URL points to the same server; a URL to another server removes it (enter the token again).
- **Test connection** checks the login and that each job exists, and warns when a job lacks the configured parameter.

On the **Changes** page, **Build with Jenkins** (Developer or Lead) is available once the change is delivered to a branch (branch mode) or generated (patch mode). The factory then:

1. Runs the quick checks on all files of the change. Errors are fixed by the model first (committed to the branch in branch mode) and listed as a "Quick checks" round; Jenkins is only started once the checks pass.
2. Triggers every job and waits for each build (queue timeout 30 minutes, build timeout `FACTORY_JENKINS_BUILD_TIMEOUT`).
3. Reads the console log and the JUnit test report and extracts errors (Maven/javac, ESLint, TypeScript, failed tests).
4. If all builds pass, the change shows **Jenkins: passed**.
5. If errors point at files of this change, the model rewrites those files with the errors as input. In branch mode the fixes are committed to the change branch; in patch mode the patch is updated. Then it builds again. This runs at most `FACTORY_JENKINS_MAX_FIX_ROUNDS` times (default 2).
6. Errors outside the change's files are not fixed by the model: the build is marked failed and the log excerpt is shown for a developer.

Every build is listed with its round, job, link to Jenkins, result, errors, a log excerpt and the files the model fixed. While a build runs the change cannot be edited, regenerated or delivered. Builds that were running when the factory restarted are marked failed.

## Sign-in, roles and audit

**Sign-in options** (`FACTORY_AUTH_MODE`):

- `local` (default): accounts are kept in the factory with BCrypt-hashed passwords (at least 12 characters). On first start an `admin` account is created with `FACTORY_ADMIN_PASSWORD`, or with a random password written once to the log. Users change their own password on the **Account** page; administrators reset passwords on the **Admin** page.
- `ldap`: users sign in with their bank directory (Active Directory) username and password; see the `FACTORY_LDAP_*` settings. The factory does not store their passwords.
- `oidc`: users sign in through the bank's identity provider (Azure AD, Keycloak, ...). Configure the client with the standard `spring.security.oauth2.client.registration.sso.*` settings; the redirect URI is `https://<factory host>/login/oauth2/code/sso`.
- `saml`: users sign in through a SAML 2.0 identity provider (AD FS, Azure AD/Entra ID, Okta, Ping, Shibboleth, ...). See **SAML sign-in** below.

With `ldap`, `oidc` and `saml`, users appear in the factory at their first sign-in (or can be added in advance on the Admin page). `FACTORY_ADMIN_USERS` names users who are always administrators.

**SAML sign-in** (`FACTORY_AUTH_MODE=saml`). The factory is the service provider (relying party); Spring Security checks the response's signature, issuer, audience, validity times and that it answers the factory's own request.

1. Give the identity provider's administrators the factory's details. Its metadata is at `https://<factory host>/saml2/metadata/sso`: entity ID `https://<factory host>/saml2/service-provider-metadata/sso`, assertion consumer service `https://<factory host>/login/saml2/sso/sso` (HTTP-POST).
2. Configure the identity provider with the standard Spring settings, preferably from its metadata:

   ```
   SPRING_SECURITY_SAML2_RELYINGPARTY_REGISTRATION_SSO_ASSERTINGPARTY_METADATA_URI=https://adfs.bank.local/FederationMetadata/2007-06/FederationMetadata.xml
   ```

   (or `..._ASSERTINGPARTY_ENTITY_ID`, `..._SINGLESIGNON_URL` and `..._VERIFICATION_CREDENTIALS_0_CERTIFICATE_LOCATION=file:/etc/obdx-factory/idp.crt` without metadata). The identity provider must sign its responses or assertions.
3. Choose the username: `FACTORY_SAML_USERNAME_ATTRIBUTE` names the attribute to use (empty: the NameID). Name and email come from `FACTORY_SAML_DISPLAY_NAME_ATTRIBUTE` and `FACTORY_SAML_EMAIL_ATTRIBUTE` (AD FS claim URIs by default).
4. Serve the factory over HTTPS and set `FACTORY_COOKIE_SECURE=true` and `FACTORY_COOKIE_SAME_SITE=none`: the identity provider posts its answer from another site, and the browser only sends the session cookie with that post when SameSite is none. Otherwise sign-in fails with "no saved authentication request" (the factory logs a warning at startup).

Signing the factory's own requests, encrypted assertions and single logout are not set up; Spring Security supports them through the same `spring.security.saml2.relyingparty.registration.sso.*` settings (`signing`, `decryption`, `singlelogout`) if the bank requires them.

**Building with SAML support.** Spring Security's SAML code uses OpenSAML, which is published only in the Shibboleth repository (`https://build.shibboleth.net/maven/releases/`), not Maven Central. So that every other installation builds from Maven Central alone, OpenSAML is added only with the `saml` Maven profile: `mvn -Psaml clean verify` (in Jenkins, add `-Psaml` to the build command). Build machines then need access to the Shibboleth repository, usually through the bank's Nexus or Artifactory as a proxy repository with a `settings.xml` mirror. Starting with `FACTORY_AUTH_MODE=saml` from a build without the profile stops with a message saying so.

**Roles.** Administrators can do everything, including creating workspaces, managing users and roles, and reading the audit log. Everyone else needs a role in each workspace they work in, and only sees those workspaces:

| Role | Can |
|---|---|
| Analyst | View, comment, create and edit requirements, design screens and share review links |
| Developer | View, comment, SVN settings and imports, Project Profile corrections, design screens |
| Lead | Everything in the workspace, including approving requirements and designs |

Every API checks these permissions (`AccessGuard`); the UI hides actions a user cannot take. Customer review links stay public and work by their token only.

**Sessions** use an HTTP-only cookie that ends after `FACTORY_SESSION_TIMEOUT` (30 minutes) of inactivity; changes need the CSRF token from the `XSRF-TOKEN` cookie in an `X-XSRF-TOKEN` header (the UI does this). Five failed sign-ins in a row from one address lock that username for that address for 15 minutes, so no one elsewhere can lock an administrator out. An address with 20 failed sign-ins (any usernames) waits 1 second before the next try, doubling with each further failure up to 15 minutes (`factory.auth.max-failed-logins`, `max-failed-logins-per-address`, `lock-duration`). Behind Oracle HTTP Server set `FACTORY_FORWARD_HEADERS=native` so the address is the user's, not the proxy's. A wrong password for a disabled account gets the same answer as any wrong password. Responses carry `Content-Security-Policy: frame-ancestors 'self'; object-src 'none'; base-uri 'self'; form-action 'self'` (plus the SAML identity provider in SAML mode), `Referrer-Policy: same-origin` and, on HTTPS requests, `Strict-Transport-Security`. A query or a JSON text with a NUL character, or a path a file cannot have, is a 400. A body that cannot be read gets "The request could not be read (field "name", line 1, column 9). Check the data sent."; the parser's own message goes to the log. Serve the factory over HTTPS in production and set `FACTORY_COOKIE_SECURE=true`. Sessions are kept in memory, so a restart signs everyone out, and running several servers behind a load balancer needs sticky sessions.

**Audit log** (Admin page, `GET /api/admin/audit`): sign-ins and failed sign-ins, workspace creation and deletion, SVN and Jenkins setting changes, SVN and Jenkins connection tests (pass or fail, with the error), imports, Project Profile corrections, requirements created, approved and deleted, review links, design approvals (including by customers), and user and role changes. Passwords are never recorded.

## Working on the UI

For quick UI changes without rebuilding the jar, run the server, then in `factory-ui/`:

```bash
npm install
npx ojet serve
```

To check every page at phone, tablet, laptop and desktop sizes (and at 200% browser zoom) against a running factory,
with the local Edge or Chrome and no extra packages:

```bash
FACTORY_QA_USER=admin FACTORY_QA_PASSWORD=... npm run check:responsive -- --url http://localhost:8080 --out responsive-report
```

It signs in, opens each page at each size, and fails when a page scrolls sideways, an element runs past the window, a
table spills out of its card, controls overlap, a label is cut off, a popup leaves the window or the console shows an
error. It writes `report.json` and a screenshot per page and size. It only reads: nothing is saved or deleted.
`--pages`, `--sizes` (for example `375x667,1440x900`, or `640x400@2` for 200% zoom), `--workspace` and `--theme dark`
narrow or vary the run.

`node scripts/check-home.js --url ...` (same sign-in variables) checks the Home page: its attention count against the data,
that the continue and attention items open their records, the viewer role, keyboard reach and the offline message.

`node scripts/check-workspaces.js --url ...` checks the Workspaces page: the list against the data, the details sheet
(version evidence, connection test, the delete dialog, always cancelled), the New workspace steps, Home's link to them and
the offline message. With `--svn <url> --create 1` it also creates a workspace from that URL, follows the import stages,
updates the code once and deletes the workspace again: use it only on a factory whose data is a copy.

`node scripts/check-code.js --url ...` checks the Code page: its four areas (repository health, quick checks, code search,
repository settings), the index figures against the server, the stale-index check against the repository's latest
revision (read only), that a search result opens its file at the matching line in the viewer, result and rule filters,
the top-bar search request, the offline message and the link to the workspace's details sheet.

`node scripts/check-profile.js --url ...` checks the Project Profile page: every fact once in its area, each marked from
its status and confidence (Detected only for high confidence, Inferred otherwise), the facts code generation reads and
the missing ones named at the top, the scan revision, a fact opened from the keyboard with its evidence files, the
filters, and the phone width. With `--write 1` it also saves a correction and a reset and checks the correction history;
use that only on a factory whose data is a copy.

`node scripts/check-requirements.js --url ...` checks the Requirements list: one row per requirement with its ID, title,
source document, type, spec status and Home's four workflow steps, choosing a row, the next-step links, search and
filters (only values that exist), the Upload BRD/FSD and New requirement panel (focus, an unreadable file, a document the
server refuses, Close), the viewer role, keyboard reach, the offline message, and that the Workspaces page asks for no
profile a workspace cannot have yet. Its only upload is an empty text file, which the server refuses before storing it.

`node scripts/check-requirement-detail.js --url ...` checks the selected requirement, for every requirement of every
workspace: only the parts the spec has something for, the document's IDs and exact wording, Drafted on exactly the items not
found word for word in the document, the links between requirements and the criteria that verify them, History against
`GET /api/requirements/{id}/versions`, Approve offered only when the server would accept it (and, for a spec with open
questions put into the page, "Answer the questions" instead), and the phone width. It changes nothing.

`npm run check:interactions` (same environment variables and `--url`, `--pages`, `--sizes`, `--workspace`, `--reduced-motion`)
drives the factory with real keyboard, mouse and touch input instead. On every page it checks:
- the page transition runs (or is off with reduced motion);
- nothing stays busy after loading;
- Tab reaches visible controls, each with a visible focus change.

Once for the shell, it checks:
- the collapse notch, by keyboard;
- the phone drawer: Escape and a swipe close it;
- the command palette, the user menu, the notification panel and dialogs open and close by keyboard, with focus returning;
- switching workspace by keyboard;
- carousel keys;
- Workspaces refresh, Code search and Knowledge search, on a slow network and offline, end with nothing left busy and,
  on failure, a message.

It ends by signing out to check the sign-in page. It only reads. Both checks share `scripts/qa-browser.js`.

`ojet serve` serves the UI on its own port and reloads on save. The UI calls the backend at the relative path `api/`, so either open the UI through the Spring Boot server after a build, or configure a proxy for `api/` to `http://localhost:8080`.

Each page is a view (`src/js/views/<page>.html`) plus a view model (`src/js/viewModels/<page>.js`), registered in the route list in `src/js/appController.js` with its sidebar `icon` (a `factory-ico-<icon>` class in `app.css`) and `group` (one of the six sections in `NAV_GROUPS`: `overview`, `analyze`, `design`, `deliver`, `modernize`, `admin`; `sidebar: false` keeps a page out of the menu, `parent` names the page it is opened from). `index.html` holds the shell: the dark sidebar with the product name (collapsible; it slides in on phones), the top bar, a breadcrumb above each page (section › parent › page), and the sign-in page. The top bar has the workspace picker (shared with the pages through `services/workspaceSelection`) with the selected workspace's OBDX version beside it, search of the workspace code (Ctrl K, opens the Code page's Code search), a bell listing what needs attention (with a link to the Notification Center), Help (the About page) and the user menu. Signing in opens **Home** (route `overview`), scoped to the workspace chosen in the top bar or to all workspaces: "Continue where you left off" (each requirement whose latest change is not delivered or closed, with its step and next action), "Attention required" (failed or interrupted spec drafts, changes, builds and imports, approvals and open questions waiting, generated code to review, code not imported), progress with what each number counts, then recent requirements, activity, builds and the workspaces. With no workspace yet it shows only the setup form. Every item opens its own record through `services/pageRequests`. `services/dashboard.js` loads that data for Home, the Workspaces page and the bell (which lists the same attention items) from the same endpoints the other pages use, and names in `missing` any part that could not be loaded. `src/js/services/api.js` wraps calls to the backend.

The pages follow the screen designs in `design/design and implementation plan.docx`: Home (Overview), Workspaces (with
the workspace details), Code (and the Knowledge Explorer behind it), Project Profile, Requirements, UI Design Studio (and the Visual Designer behind it),
Changes (and Impact Analysis behind it), Build, Test & Review, Modernization, Models & AI Providers, Agent Runs,
Administration, External Review, Integrations, Version Packs, AI Prompt Library, Notifications, Account & Preferences and
About. Pages show only the factory's real data; where a design shows something the factory does not record (test
counts, coverage, costs, environments), the page keeps the section in its place with a short note saying what is not recorded, controls that need server work are disabled with a tooltip, and estimates are labelled as estimates.
Agent Runs, Notifications and the Prompt Library are built from the requirements, designs, changes, builds, imports and
version-pack recipes the factory already keeps. Shared pieces:

- `services/ui.js`: tabs, status pills, initials, select and switch helpers, pagers and dates.
- `services/assistant.js`: the AI assistant panels (they call `POST /api/knowledge/ask/stream` with the page's context).
- `services/pageRequests.js`: hands a search or a new workspace from one page to another, and a file for the Code page to open at its lines (`codeFile`, from Knowledge Explorer).
- `services/syntax.js`: the one syntax colourer of every code viewer (Code, Changes, Knowledge Explorer): `fx-syn-*` classes coloured by theme tokens; a code pane with its own background (Changes) sets the `--fx-syn-*` properties.
- `services/preferences.js` and `services/notifications.js`: preferences and read notifications, kept in the browser.
- `app.css`: the page kit (`factory-pg`, `factory-kpis`, `factory-card`, `factory-row-*`, `factory-tabbar`,
  `factory-stepper`, `factory-kv`, `factory-ring`) and one prefix per page.

JET bindings cannot use `new`, function literals or `$parent` inside `oj-bind-for-each` templates, and `:style` takes an
object: compute those in the view model.

## REST API (so far)

| Method and path | Purpose |
|---|---|
| `GET /api/auth/config` | Sign-in mode, single sign-on link, factory version and environment name (`FACTORY_ENVIRONMENT_NAME`, null when not set) (public) |
| `POST /api/auth/login` | Sign in with username and password (`local` and `ldap`) |
| `POST /api/auth/logout` | Sign out |
| `GET /api/auth/me` | The signed-in user with workspace roles and permissions |
| `POST /api/auth/password` | Change your own password (local accounts) |
| `GET` / `POST /api/admin/users`, `PUT /api/admin/users/{id}`, `POST /api/admin/users/{id}/password` | Users (administrators) |
| `GET /api/workspaces/{id}/members`, `PUT` / `DELETE /api/workspaces/{id}/members/{userId}` | Workspace members and roles (changes by administrators) |
| `GET /api/admin/audit` | Audit log (administrators) |
| `GET /api/admin/last-sign-in?source=LDAP` | When someone last signed in through that source (`at` is null when none is recorded; single sign-on sign-ins are not recorded), for the Integrations page (administrators) |
| `GET /api/workspaces` | List workspaces (administrators: all; others: their workspaces) |
| `POST /api/workspaces` | Create a workspace (`name`, `bankName`, `obdxVersion` = `22.x` or `25.x`, optional `svnUrl`) |
| `GET /api/workspaces/{id}` | Get one workspace |
| `DELETE /api/workspaces/{id}` | Delete a workspace, its index and its working copy |
| `PUT /api/workspaces/{id}/svn` | Set SVN URL, username and password (`svnPassword`: omit or null to keep, empty to remove) |
| `POST /api/workspaces/{id}/svn/test` | Check the SVN connection; returns the latest revision. The result is recorded (`SVN_TEST_PASSED` or `SVN_TEST_FAILED`) |
| `GET /api/workspaces/{id}/integrations/activity` | The workspace's SVN and Jenkins settings changes and connection tests, newest first (audit events), for the Integrations page |
| `GET /api/update` | Version, build number, whether a newer build exists and when the factory last checked (`checkedAt`) (`?check=true`: ask GitHub now, administrators) |
| `POST /api/update` | Download the newer build and restart with it (administrators) |
| `POST /api/sources/inspect-url` | Check an SVN URL (`svnUrl`, optional `svnUsername`, `svnPassword`) and suggest name, bank and OBDX version |
| `GET /api/sources/local` | Whether folders on the factory's computer can be used, where to start browsing, SVN repositories found |
| `GET /api/sources/local/folders?path=` | Subfolders of a folder, marked as SVN checkout or SVN repository |
| `POST /api/sources/local/inspect` | What a folder is (`path`): SVN checkout, SVN repository or plain folder, its SVN URL and suggestions |
| `POST /api/sources/local/repository` | Copy a plain folder (`path`, optional `name`) into a new SVN repository under `FACTORY_DATA_DIR/local-repositories` |
| `POST /api/workspaces/{id}/imports` | Start an import (check out or update, then index) |
| `GET /api/workspaces/{id}/imports` | Recent import jobs with progress |
| `GET /api/workspaces/{id}/index` | Indexed revision and file/piece counts |
| `GET /api/workspaces/{id}/search?q=...` | Search the workspace's code |
| `GET /api/workspaces/{id}/files?q=&limit=` | The indexed files (path, language, size, revision), filtered by path |
| `GET /api/workspaces/{id}/files/content?path=` | One indexed file from the working copy (cut at 512 KB) |
| `GET /api/workspaces/{id}/requirements` | List requirements |
| `POST /api/workspaces/{id}/requirements` | Upload a document (multipart `file`, optional `title`); drafting starts in the background |
| `POST /api/workspaces/{id}/requirements/text` | Create from text (`title`, `text`) |
| `GET /api/requirements/{id}` | Requirement with status, document text and current spec |
| `GET /api/requirements/{id}/versions` | The spec's versions, newest first: `version`, `origin` (DRAFTED, ANSWERED, REFINED, EDITED), `createdAt` |
| `PUT /api/requirements/{id}/answers` | Save answers to open questions (`answers`: `index`, `answer`) |
| `POST /api/requirements/{id}/refine` | Update the spec with the answers (background) |
| `PUT /api/requirements/{id}/spec` | Replace the spec with edited JSON |
| `POST /api/requirements/{id}/approve` | Approve and lock the spec |
| `POST /api/requirements/{id}/retry` | Draft again from the document |
| `DELETE /api/requirements/{id}` | Delete the requirement and its versions |
| `GET /api/design/catalog` | Component types available in the designer |
| `POST /api/designs/{id}/flow-screens` | Make the review and confirmation screens of the flow this initiate screen starts |
| `POST /api/designs/{id}/restore` | Save an earlier version again as the newest one (`version`) |
| `GET /api/workspaces/{id}/custom-components` | The workspace's own components for the palette |
| `POST /api/workspaces/{id}/custom-components` | Have the model write a component from a description (`name`, `prompt`) |
| `POST /api/workspaces/{id}/custom-components/file` | ...from an image or PDF (multipart `file`, `name`, `prompt`) |
| `POST /api/workspaces/{id}/custom-components/figma` | ...from a Figma frame (`name`, `prompt`, `link`, `token`; the token is not stored) |
| `DELETE /api/workspaces/{id}/custom-components/{componentId}` | Delete a custom component (screens keep their copy) |
| `POST /api/designs/{id}/import` | Import a design file as the next version (multipart `file`: PNG, JPG, WebP or PDF) |
| `POST /api/designs/{id}/import-figma` | Import a Figma frame as the next version (`link`, `token`; the token is not stored) |
| `GET /api/workspaces/{id}/design-compatibility?element=` | The Visual Designer's compatibility marks: each element (`oj-input-text`, a component name) as `VERIFIED`, `UNSUPPORTED` or `UNVERIFIED` against the workspace's OBDX version pack and imported code, with the evidence (`obdxVersion`, `codeImported`, `elements`) |
| `GET /api/workspaces/{id}/design-palette` | The designer's palette: standard components and those found in the workspace's code (`items`: `group`, `label`, `type`, `tag`, `params`, `uses`, `source`) |
| `GET /api/workspaces/{id}/designs` | List screen designs |
| `POST /api/workspaces/{id}/designs` | Create a blank design (`name`) |
| `POST /api/requirements/{id}/designs` | Create designs from an approved requirement |
| `GET /api/requirements/{id}/design-flow` | The requirement's screens in flow order with their models, and per functional requirement its screens, business rules and acceptance criteria (`others`: screens no requirement names). Per screen: `criteria` (the acceptance criteria it helps meet), `unconfirmed` (choices and tables the BRD gives no values for) and `decisions` (what the BRD leaves open: a field's mandatory flag, new screen or change). `uncovered`: criteria no screen covers; `questions`: unanswered spec questions; `decisions`: answered ones |
| `POST /api/requirements/{id}/designs/approve` | Approve the requirement's screens that are not approved yet (`designIds`: only these; none: all), in one transaction; returns the flow |
| `GET /api/designs/{id}` | Design with current model, versions and comments |
| `GET /api/designs/{id}/versions/{version}` | An earlier version's model |
| `PUT /api/designs/{id}/model` | Save the model as a new version (`model`, optional `note`) |
| `POST /api/designs/{id}/ai-change` | Apply a change described in words (`instruction`; `targetId` limits it to one component, section or button) |
| `POST /api/designs/{id}/comments` | Add a team comment (`author`, `text`, optional `componentId`) |
| `POST` / `DELETE /api/designs/{id}/review-link` | Create (optional `days`) or close the customer review link |
| `POST /api/designs/{id}/approve` / `reopen` | Approve (`by`) or reopen for changes |
| `GET /api/review/{token}` | Customer review: the design by review link |
| `POST /api/review/{token}/comments` / `approve` | Customer comment or approval |
| `GET /api/workspaces/{id}/changes` | List changes |
| `GET /api/workspaces/{id}/changes/details` | Every change of the workspace with its files and builds, in one request (dashboard, notifications) |
| `POST /api/requirements/{id}/changes` | Start a change (impact analysis) for an approved requirement |
| `GET /api/changes/{id}` | Change with plan, status and files |
| `POST /api/changes/{id}/analyze` | Analyze again |
| `PUT /api/changes/{id}/plan` | Replace the plan with edited JSON |
| `POST /api/changes/{id}/approve-plan` | Approve the plan and write the code (Lead) |
| `GET /api/changes/{id}/coverage` | Requirement coverage of a change from its written files: `criteria` and `requirements`, each with the `tests` and `code` paths that name it; `written` and `planned` file counts |
| `GET /api/changes/{id}/plan-review` | The plan's revisions (`revision`, `origin` ANALYZED or EDITED, `createdBy`, `createdAt`, `plan`) and comments (`kind` COMMENT, CHANGES_REQUESTED or APPROVED, `author`, `text`, `revision`) |
| `POST /api/changes/{id}/plan-comments` | `{kind, text}`: a comment (COMMENT right) or a request for changes while the plan waits (APPROVE right); approval stays `approve-plan` |
| `GET /api/changes/{id}/file?path=` | One file: original, generated content and diff |
| `PUT /api/changes/{id}/file` | Save a reviewer's edit (`path`, `content`, at most 512 KB) |
| `POST /api/changes/{id}/continue` | Write the planned files not written yet (after generation stopped at the model's limit); 409 when generation is already running |
| `POST /api/changes/{id}/regenerate` | Write one file again (`path`, optional `note`) |
| `GET /api/changes/{id}/patch` | Download the change as a patch; 409 while planned files are not written, unless `incomplete=true` |
| `POST /api/changes/{id}/deliver` | Commit the change to a new SVN branch; 409 while planned files are not written, unless `incomplete=true` |
| `DELETE /api/changes/{id}` | Delete a change |
| `POST /api/changes/{id}/check` | Run the quick checks again on all files |
| `GET /api/version-packs/{version}/recipes` | A version pack's own recipes (22.x or 25.x), without reference examples, for anyone who can see a workspace (to compare a recipe between versions) |
| `GET /api/workspaces/{id}/checks` | The workspace's version pack rules, with on/off and Java level; each rule's `origin` (VERSION_PACK: the factory's pack files, BANK: a file of the bank's pack folder `FACTORY_PACKS_DIR`, TARGET: the UI target pack), `source` (the file name) and, when off, `disabledBy` and `disabledAt` |
| `PUT /api/workspaces/{id}/checks/{ruleId}` | Turn a rule on or off for the workspace (`enabled`) |
| `GET /api/workspaces/{id}/recipes` | The version pack's recipes with templates and the workspace's reference examples |
| `POST /api/workspaces/{id}/recipes/{recipeId}/parts/{partId}/examples` | Pin a file as a reference example (`path`) |
| `DELETE /api/workspaces/{id}/recipes/{recipeId}/parts/{partId}/examples?path=` | Unpin it |
| `POST /api/changes/{id}/close` | Close the change (`reason`: `MERGED` or `ABANDONED`, `force` to close as merged without the merge check); removes its branch |
| `GET /api/targets` | The UI target packs with their component mapping and structure |
| `GET /api/targets/{id}/starter.zip` | Download a target pack's starter project |
| `GET` / `PUT /api/workspaces/{id}/target` | The workspace's UI target and app folder (`target`, `appFolder`) |
| `GET /api/designs/{id}/code?module=` | The screen, test and texts a design becomes in the workspace's React Native or React app |
| `GET /api/workspaces/{id}/inventory` | The modernization inventory (204 when not scanned yet) |
| `POST /api/workspaces/{id}/inventory/scan` | Scan the imported code again |
| `GET /api/workspaces/{id}/inventory/screens.csv` | The screens as CSV for planning |
| `POST /api/changes/{id}/build` | Build the change with Jenkins, fixing build errors in its files (background) |
| `GET /api/workspaces/{id}/jenkins` | Jenkins settings (204 when not set; the token is never returned) |
| `PUT /api/workspaces/{id}/jenkins` | Save Jenkins settings (`token`: omit or null to keep, empty to remove) |
| `POST /api/workspaces/{id}/jenkins/test` | Check the Jenkins login and jobs. The result is recorded (`JENKINS_TEST_PASSED`, `_WARNING` or `_FAILED`) |
| `GET /api/workspaces/{id}/profile` | The Project Profile with detected and confirmed/corrected values, and warnings |
| `POST /api/workspaces/{id}/profile/refresh` | Scan the working copy again |
| `PUT /api/workspaces/{id}/profile/facts/{key}` | Confirm or correct a fact (`value`) |
| `DELETE /api/workspaces/{id}/profile/facts/{key}` | Go back to the detected value |
| `GET /api/workspaces/{id}/profile/history` | Who confirmed, corrected or reset which fact, newest first (the profile's audit log entries; view permission) |
| `GET /api/model/status` | The model server and models in use, and whether they were chosen on the Models page |
| `GET /api/model/servers/local` | Model servers on the factory's computer (Ollama, vLLM, LM Studio) with their models (administrators) |
| `POST /api/model/servers/models` | The models of a server (`baseUrl`, optional `apiKey`; without it the stored key of that server) (administrators); the result is remembered as that server's last test |
| `GET /api/model/checks` | The connection tests since the factory started, per server: last test, latency, last success, last error, models listed (administrators; finding local servers counts as a test) |
| `GET /api/model/limits` | The limits learned from model servers' refusals that are still kept (7 days): input tokens a request, tokens and output tokens a minute, largest answer, characters a token |
| `GET /api/knowledge/policy` | Where the knowledge base may go: the chat and embedding hosts, whether each is inside the bank's network, whether FACTORY_KNOWLEDGE_EXTERNAL_MODELS allows outside servers, and whether it goes to each now |
| `PUT /api/model/settings` | Use a server and models (`baseUrl`, `apiKey`: null keeps, empty removes, `chatModel`, `embeddingModel`; `embeddingBaseUrl`, `embeddingApiKey` for code search on another server, null: the same server); the reply's `embeddingProblem` says when the embedding model cannot embed (a fixed test phrase is sent to it) or does not look like an embedding model, and the Models page shows it with the OBDX Library's privacy notice (administrators) |
| `POST /api/model/chat` | Send a test prompt (`prompt`); administrators |
| `POST /api/model/embed` | Embed a test text (`text`); returns the vector size; administrators |
| `GET /api/knowledge` | Library overview: counts, whether folder import is allowed, the documents (older revisions too), the watched folders, `privacy` when the models are outside the bank, and `fromOracleSite` (the documents fetched from Oracle's site) |
| `POST /api/knowledge/import` | Import and watch a folder (`folder`, `obdxVersion`, `patchset`, `workspaceId`: null for Oracle's manuals); administrators |
| `POST /api/knowledge/documents` | Upload one file: PDF, Word, text, Markdown or HTML (multipart `file`, `obdxVersion`, `patchset`, `workspaceId`) |
| `DELETE /api/knowledge/documents/{id}` | Remove a document and its sections |
| `POST /api/knowledge/folders/{id}/check` | Check a watched folder for new and changed documents now; administrators |
| `DELETE /api/knowledge/folders/{id}` | Stop watching a folder (its documents stay) |
| `GET /api/knowledge/oracle` | Whether the factory may fetch from Oracle's site, and the followed versions with their last check |
| `GET /api/knowledge/oracle/versions` | The OBDX versions on Oracle's documentation index (administrators) |
| `POST /api/knowledge/oracle/follow` | Get a version's manuals from Oracle's site and keep them current (`obdxVersion`, `scope`: `TECHNICAL` or `ALL`) |
| `POST /api/knowledge/oracle/{version}/check` | Check a followed version for changed manuals now |
| `DELETE /api/knowledge/oracle/{version}` | Stop following a version (its manuals stay) |
| `POST /api/knowledge/embed-all` | Embed every document not embedded by the embedding model in use (Embed all on the Documents tab; administrators) |
| `POST /api/knowledge/documents/{id}/embed` | Embed the sections still without an embedding |
| `GET /api/knowledge/documents/{id}/file` | The PDF (cited as `.../file#page=N`) |
| `GET /api/knowledge/search` | Search the manuals and notes (`q`, `workspaceId`, `versionLine`) |
| `POST /api/knowledge/ask` | Answer a question with citations (`question`, `workspaceId`, `context`: the page's text; optional `version`: the OBDX version or version line to answer for instead of the workspace's) |
| `POST /api/knowledge/ask/stream` | The same answer as the model writes it, one JSON object per line (`application/x-ndjson`): `status`, `sources` (with `diagnostics` for administrators), then `text` pieces, then `status` while it is checked, then `done` (the checked answer with its `report`) or `error`; `history`: the conversation's earlier `{question, answer}` turns, oldest first; `style`: `CONCISE`, `DETAILED` (default) or `DEEP_DIVE`; `improved`: the wording the user approved after Improve My Question |
| `POST /api/knowledge/improve-question` | Improve My Question (`question`, `workspaceId`, `history`): `status` (`READY`, `NEEDS_CLARIFICATION`, `AMBIGUOUS`), `enhancedQuery`, `detectedIntent`, `detectedModule`, `detectedVersion`, `technicalEntities`, `assumptions`, `clarificationQuestions`, `suggestedScope`, `byModel`; nothing is answered |
| `POST /api/knowledge/evaluation` | Run the evaluation questions through the Library (`mode`: `SEARCH`, `CHOOSE` or `ANSWER`; administrators; see docs/KNOWLEDGE-AUDIT.md) |
| `GET /api/knowledge/evaluation` | The running or last evaluation: Recall@5, Recall@15, MRR, answers passed, unanswerable questions refused, each question's row |
| `GET` / `POST /api/knowledge/notes`, `PUT` / `DELETE /api/knowledge/notes/{id}` | Knowledge notes (`status` filter) |
| `POST /api/knowledge/notes/{id}/review` | Approve or reject a note (`status`: TRUSTED, REJECTED, SUGGESTED) |
| `POST /api/knowledge/summaries` | Draft a suggested note on a topic from the manuals (`topic`, `workspaceId`) |
| `POST /api/knowledge/feedback` | Rate an answer (`question`, `answer`, `helpful`, `comment`, `sources`) |
| `GET /actuator/health` | Health check |

Errors are returned as problem details (`status`, `title`, `detail`). Without a session the API answers 401; without permission, 403.

## Tests

`mvn verify` runs the unit tests. Tests that need `svn`/`svnadmin` are skipped if they are not installed. The full import-and-search test also needs PostgreSQL with pgvector:

```sql
-- once, as a PostgreSQL superuser
CREATE DATABASE factory_test OWNER factory;
\c factory_test
CREATE EXTENSION vector;
```

```bash
FACTORY_TEST_DB_URL=jdbc:postgresql://localhost:5432/factory_test mvn verify
```

## Download and run (Windows or Linux, no installation)

The download is a zip with the factory, start scripts, settings and demo code. GitHub builds it on every push: open
the repository's **Actions** tab, choose the latest **Build** run and download an artifact:

- `obdx-factory-windows-x64`: for Windows, with Java included.
- `obdx-factory`: the same without Java, for Linux or a machine with Java 21.

On Windows, unzip it (for example to `C:\obdx-factory`), double-click `start.bat` and open `http://localhost:8080/`.
Sign in as `admin` with the password in `settings.properties` (`Factory-Admin-1` until changed). On Linux, run
`./start.sh` as an ordinary user. `README.txt` in the zip has the details, including `create-demo-svn.bat` for trying
it with demo code: it creates SVN repositories in `demo-svn/`, which the factory adds as workspaces and imports when it
starts with the trial database (`FACTORY_DEMO_SVN_DIR`, default `demo-svn`). Importing code needs the Subversion command-line tools: on Windows, TortoiseSVN with "command line
client tools" ticked.

The download uses the **trial database** (`FACTORY_TRIAL_DATABASE=true` in its `settings.properties`): the factory
starts its own PostgreSQL 17, keeps its data in `data/trial-database` and stops it when the factory stops, so nothing
needs to be installed. It listens on localhost only. It has no pgvector, which has no Windows build; a pure-SQL
stand-in (`factory-server/src/main/resources/trial-database/`) gives semantic search the same results, without a vector
index, which is fine for trial-sized codebases. For a team installation, use a PostgreSQL server with pgvector.

**Keeping it running and up to date.** `install-autostart.bat` starts the factory at Windows sign-in (minimized) and
puts an "OBDX Factory" shortcut on the desktop; `remove-autostart.bat` undoes it. Every push to GitHub publishes the
build to the `latest` release (`releases/download/latest/`: `obdx-factory.jar`, `version.json` with build number and
SHA-256, and both zips). With `FACTORY_UPDATES=true` (set in the download's `settings.properties`) the factory compares
its build number with `version.json` every 30 minutes; administrators see a banner and **Update now** (also on the
About page) downloads the jar into `update/`, checks its SHA-256 and stops the factory with exit code 75. The start
script then moves the new jar in place and starts it again; data and settings stay. Sign-ins end with the restart.
When Java cannot connect (some networks answer on only some of GitHub's download addresses, and Java's client gives up
on the first one), the check and the download fall back to `curl` (part of Windows 10 and later and of most Linux
systems), which tries the next address; the SHA-256 is checked the same way.
Development builds (`dev`) are never replaced. `FACTORY_UPDATE_URL` points elsewhere, for example to a bank's own copy
of the release. Updates replace the jar only; when the start scripts change, download the zip once more.

To pack the zip yourself: `deploy/bundle/build-bundle.sh factory-server/target/obdx-factory.jar dist/obdx-factory.zip [jre folder]`
(Jenkins does this in its "Download zip" stage).

## Running with Docker (development and trials)

To give a team a factory they open in the browser, run it with Docker on any machine you control: a development VM on
the bank network, a laptop, or a cloud VM. On a machine with Docker (Docker Desktop, or Docker Engine with the compose
plugin):

```bash
git clone <repository URL> && cd OBDX-Development-Factory
# optional: edit .env (admin password, ports, model server)
docker compose up -d
```

Then open `http://<machine>:8080/` and sign in as `admin` with `FACTORY_ADMIN_PASSWORD` from `.env`. The first start
builds the image (a few minutes) and downloads the models (several GB), so the model answers are ready only after
`docker compose logs -f model-pull` shows both models pulled.

What runs (`docker-compose.yml`, settings in `.env`):

| Service | What it is |
|---|---|
| `factory` | The factory, built from the `Dockerfile` (UI and server), on port `FACTORY_HTTP_PORT` (8080) |
| `db` | PostgreSQL 17 with pgvector. Only the factory can reach it |
| `ollama`, `model-pull` | Local model server and a one-time download of `FACTORY_MODEL_CHAT` and `FACTORY_MODEL_EMBEDDING` (profile `model`) |
| `svn` | Demo Subversion server with two small OBDX-style codebases (`deploy/docker/demo/`), on port 3690 (profile `demo`) |
| `demo-setup` | Creates the workspaces `bank-a-22` (OBDX 22.x) and `bank-b-25` (25.x) on the demo SVN server and imports them, once (profile `demo`) |

`COMPOSE_PROFILES` in `.env` chooses the optional parts:

- Use a model server you already have (Ollama on a GPU machine, vLLM): remove `model` and set `FACTORY_MODEL_BASE_URL`.
  A 7B model on a CPU answers in minutes, not seconds; a GPU makes the factory much more pleasant.
- Work with real bank code: remove `demo` and create workspaces in the factory pointing at the bank's SVN server. Keep
  bank code on machines inside the bank network.

Everyday commands:

```bash
docker compose ps                    # what runs, and whether it is healthy
docker compose logs -f factory       # factory log
git pull && docker compose up -d --build   # update to the latest version (data is kept)
docker compose down                  # stop (data is kept in volumes)
docker compose down -v               # stop and delete all data: database, working copies, models, demo SVN
```

Data lives in Docker volumes: `db-data` (the database), `factory-data` (SVN working copies and the generated secret key
that encrypts stored SVN passwords), `ollama-models` and `svn-repos`. Back up `db-data` and `factory-data` together.

Behind a corporate proxy, build with `docker compose build --build-arg HTTPS_PROXY=http://proxy:port` (or set the
`proxies` section of `~/.docker/config.json`). If the proxy, or an internal SVN, model, Maven or npm server, uses a
certificate from the bank's own CA, put the CA certificate in `deploy/docker/certs/` and rebuild. The model download
at the first start goes through `MODEL_DOWNLOAD_PROXY` in `.env` (and trusts the same certificates); without internet
access at all, use a model server that already has the models.

The port is open to anyone who can reach the machine. On a cloud VM, allow only your team's addresses in its firewall,
and put only demo code on it. For a shared, long-lived installation use HTTPS: put Oracle HTTP Server in front as below
(set `FACTORY_CONTEXT_PATH`, `FACTORY_FORWARD_HEADERS` and `FACTORY_COOKIE_SECURE` on the `factory` service), or install
the service without Docker.

## Installing on a Linux server

1. Build with Jenkins (or `mvn clean verify`) and copy `factory-server/target/obdx-factory.jar` to `/opt/obdx-factory/`.
2. Copy `deploy/obdx-factory.env` to `/etc/obdx-factory/obdx-factory.env`, fill in the database, secret key and model settings, and `chmod 600` it. Install the `subversion` package and create the data directory (`mkdir -p /var/lib/obdx-factory`, owned by the service user).
3. Create the service user: `useradd --system obdxfactory`.
4. Copy `deploy/obdx-factory.service` to `/etc/systemd/system/` and run `systemctl daemon-reload && systemctl enable --now obdx-factory`.
5. Check: `curl http://localhost:8080/actuator/health`.

## Deploying behind Oracle HTTP Server (like OBDX)

OBDX is published as Oracle HTTP Server (OHS) in front of WebLogic. The factory is published the same way: OHS terminates HTTPS with the bank's certificate and forwards `/factory` to the factory service, which takes the place of the WebLogic managed server. Users open `https://<OHS host>/factory/` in the browser; nothing is installed on their machines.

The factory is not deployed *into* WebLogic: it is built on Spring Boot 4 (Jakarta EE 11), and WebLogic 14.1 supports Java EE 8 and 15.1 Jakarta EE 9.1. It runs as its own service (`deploy/obdx-factory.service`) with an embedded server, which OHS proxies to exactly as it proxies to WebLogic.

1. Install the factory service as in [Installing on a Linux server](#installing-on-a-linux-server), and add to `/etc/obdx-factory/obdx-factory.env`:
   ```
   FACTORY_CONTEXT_PATH=/factory
   FACTORY_FORWARD_HEADERS=native
   FACTORY_COOKIE_SECURE=true
   FACTORY_BIND_ADDRESS=127.0.0.1   # when OHS runs on the same machine; otherwise firewall port 8080 to the OHS hosts
   ```
   `FACTORY_FORWARD_HEADERS=native` makes the factory trust the `X-Forwarded-Proto` header from proxies on internal addresses, so it knows users came in over HTTPS (secure cookies, single sign-on URLs). Redirects are sent as relative paths, so they keep the OHS address.
2. Copy `deploy/ohs/obdx-factory.conf` to the OHS instance's `moduleconf` folder (for example `$DOMAIN_HOME/config/fmwconfig/components/OHS/instances/ohs1/moduleconf/`) and replace `factory-host` with the factory server's host name. OHS includes every `*.conf` file there. It needs `mod_proxy`, `mod_proxy_http` and `mod_headers`, which ship with OHS.
3. Restart the factory service and OHS, then check `curl -k https://<OHS host>/factory/actuator/health` and open `https://<OHS host>/factory/`.

With a context path, every factory URL starts with it: the health check is `/factory/actuator/health`, the OIDC redirect URI `https://<OHS host>/factory/login/oauth2/code/sso` and the SAML metadata `https://<OHS host>/factory/saml2/metadata/sso`. Give the identity provider these addresses, not the service's own.

Several factory servers can sit behind one OHS for availability: list them in a `<Proxy balancer://factory>` block with sticky sessions (`stickysession=JSESSIONID`), since the signed-in session lives on the server that created it.

## Not built yet

For the OBDX Library: a view of what differs between the 22.x and 25.x manuals; a set of test questions with expected
sources to measure answers.

The rest of modernization (section 6 of the architecture): reverse-engineering existing JET screens into Screen Models, wave planning on top of the inventory, and Jenkins jobs for Android and iOS app builds. See the roadmap in [ARCHITECTURE.md](ARCHITECTURE.md).
