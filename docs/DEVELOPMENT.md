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

On the Workspaces page, administrators choose where the code is, and the factory checks it before the workspace is
created:

- **SVN server (URL)**, with a username and password if the server asks. **Check** connects and reads the code.
- **Folder on this computer** (the computer the factory runs on): a TortoiseSVN checkout (the factory imports from the
  checkout's URL, so it sees what is committed), an SVN repository folder, or a plain folder, which the factory copies
  into a new SVN repository under `FACTORY_DATA_DIR/local-repositories` so changes can still be delivered as branches.
  **Browse...** opens the computer's folders; repositories in `demo-svn` and `local-repositories` are listed to pick.
  This option exists when `FACTORY_LOCAL_FOLDERS` is true, which is the default with the trial database; on a shared
  server it is off, because administrators would browse the server's folders, not their own.

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

On the **Profile** page a developer can **Confirm** a detected value, **Correct** it (or **Enter** one that was not found), and **Reset** back to the detected value. Confirmed and corrected values are stored separately and survive later scans. If the detected OBDX version disagrees with the workspace's version, the page shows a warning. To add a fact, add it to the matching detector; every detector returns all of its facts, with "not found" where nothing was detected, so the profile doubles as a checklist.

## Requirements (document ingestion)

1. On the **Requirements** page, upload a BRD/FSD (`.docx`, `.doc`, `.pdf`, `.txt`, `.md`, up to 25 MB) or describe the change in text. The uploaded file is kept under `FACTORY_DATA_DIR/workspaces/<id>/requirements/`.
2. The text is extracted (Word headings become `#` lines and tables become `|` rows) and sent to the chat model in sections of up to 12,000 characters (`FACTORY_REQUIREMENTS_MAX_CHARS`). Confirmed Project Profile facts (OBDX and JET version, database, host systems, error codes) are given as context.
3. The model answers in JSON mode with a spec: screens (new or enhance) with fields, actions, business rules, roles, APIs, host interactions, messages and **open questions**. An unusable answer is retried once. Sections are merged and each screen gets up to three possibly related files from code search.
4. Each open question asks about one thing in plain words and comes with 2 to 4 short options and the usual choice
   (`options`, `suggestedAnswer`). Analysts pick options (several picks are combined), type their own answer or use
   **Use suggested answers** for every empty one, and click **Update spec with answers**: answered questions become decisions, and the model updates the spec with them. The spec can also be edited as JSON. Every change is stored as a new spec version.
5. **Approve** locks the spec. It needs at least one screen and no open questions.

Scanned PDFs have no text layer and need OCR before upload. With a local model, drafting a long BRD can take minutes; raise `FACTORY_MODEL_TIMEOUT` if calls time out, and lower `FACTORY_REQUIREMENTS_MAX_CHARS` for models with a small context window.

## Screen designer

1. On the **Designer** page, pick an **approved** requirement and click **Create designs**: one design per screen of its spec, with every field mapped to a component (dropdown fields become selects, "max length 35" becomes a 35-character limit, and so on). A blank screen can also be started.
2. The designer is one workspace: a **top bar** (workspace and screen, status, unsaved changes, preview size, Import, Share, Approve, Discard, Save; **+ New screen** opens a drawer to create screens from an approved requirement or a blank one), on the left **Components** (the palette) and **Layers** (sections, components and buttons as a tree; drag to reorder), the **canvas** in the middle (the live preview: click a component, section or button to select it, drop palette components on it; **Ask AI** below it), and on the right the **inspector**: **Properties** of the selection (a component's basics, data, rules and help; a section's title and columns; a button's label and style; the screen's title and name when nothing is selected), **Comments**, **History** (versions, with loading an earlier one), and **Code** for React Native or React workspaces.
   Without a screen open, the page lists each approved requirement with its screens, their status and how many are approved. A screen made from a requirement shows the **journey** above the canvas: all screens of the requirement in the order of its spec, each with its status, with "plan the change" once all are approved. The canvas shows the screen inside an OBDX page (the workspace's bank in the header, a breadcrumb, sections as cards) filled with realistic sample data chosen from field names (accounts with balances, share symbols, order references, amounts, dates). **Checks** (in the inspector with nothing selected, and as a chip in the top bar; problems are also marked on the canvas): every field of the requirement's screen is placed (**Add** places a missing one), no placeholder choices or columns are left (**Fix with AI** passes what the requirement says about the field), mandatory is set, the bank's components have their parameters, no section is empty, and there is exactly one main button. The requirement's business rules for the screen are listed below the checks.
   The side panels float over the canvas; « and » collapse them to rails at the sides (the canvas then uses the full width), and the rails open them again; this browser remembers which are open. A component's **Code** group (HTML, CSS, JS) holds the designer's own code for that element (`html`, `css`, `script`, up to 20,000 characters each): CSS styles the element where it is (declarations, or rules where `&` is the element); HTML replaces how the element is drawn, and JS runs with it, in a sandboxed frame without the factory's origin (`sandbox="allow-scripts"`), so a script cannot reach the factory or a reviewer's session; **Start from the generated markup** fills in plain markup for the element. Code generation uses the html as the element's template, the css in its styles and the script's behaviour in the view model.
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
3. A **Lead approves** the plan (it can be edited as JSON first, or analyzed again). Only then is code written.
4. **Generation** writes each file completely, in plan order, with the current content (for modified files), example files to follow, the start of files already written in this change, and the spec, designs and profile. Java, JSON and XML must parse; if not, the model gets the error and tries again (twice at most). JavaScript and HTML get a basic bracket and tag check that only warns. Existing files over 80 KB are not rewritten; change those by hand.
5. **Review**: each file shows its diff and full new content. Reviewers can edit a file or have it written again with an instruction.
6. **Deliver**: **Download patch** gives a Subversion-style unified diff that applies with TortoiseSVN "Apply Patch" or `svn patch` on a working copy at the base revision. **Commit to SVN branch** creates `branches/factory/cr-<id>` from the base revision and puts the files into it in one commit (`svnmucc`); trunk is not changed. The SVN service account then needs write access to `branches/factory/`.

## OBDX Library (knowledge base)

The **OBDX Library** page (Workflow menu) holds Oracle's OBDX manuals per version, a bank's own documents for one
workspace, and knowledge notes. Code generation, impact analysis, requirement drafting and the AI Assistant panels use it.

- **Import**: an administrator imports Oracle's manuals of a version from a folder on the factory's computer (needs
  `factory.local-folders.enabled`) or by uploading files (up to 150 MB each). With "bank's own documents" ticked, the
  files belong to the selected workspace only; a workspace's Managers import those too. The bank's own and
  patchset-specific documents can be PDF, Word (.docx, .doc), text, Markdown or HTML (an exported wiki page), and any
  import can carry a **patchset** (25.2.0.1, a patch number), shown with every citation. Each file is copied to
  `<storage>/knowledge/<id>.<type>`, read (PDF page by page with PDFBox; Word headings become sections), split at
  numbered or Word/Markdown headings into sections of at most about 1,800 characters with their pages (headers, footers
  and contents pages dropped), and embedded in the background, one document at a time. Without the embedding model a
  document is searched by keywords; **Embed again** finishes it later. Imports the factory stopped carry on at the next
  start.
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
  at most two sections of one document, so a long user manual does not crowd out the guide that answers. The bank's own
  documents and notes rank a little higher, and the model is told they describe the bank's customised system and
  patchset and win where they differ from Oracle's manuals. On the trial
  database, which has no pgvector, the sections' embeddings are kept in memory (about 24 MB for the 22.2 and 25.2
  manuals) and compared there: a search takes well under a second instead of many seconds.
- **Ask** (Library page and every AI Assistant panel): the question, the page the user is looking at (up to 3,000
  characters) and the best five sources (up to 1,000 characters each) go to the chat model, which answers with [n]
  citations; each source links to the PDF at its page. Answers can be rated (Helpful / Not helpful, kept for review) or
  saved as a suggested note. The prompt is sized for small local models with a 4k context; for larger models raise
  `factory.knowledge.answer-sources`, `source-chars` and `page-context-chars` (`FACTORY_KNOWLEDGE_*`). On a laptop with 8 GB of
  memory a local 3B model needs one to two minutes per answer; a model server with a GPU or a cloud model answers in
  seconds. The answer streams in as the model writes it (`POST /api/knowledge/ask/stream`): the sources show as soon as
  the search finds them, then the words as they come, so a slow local model is read while it writes. The model timeout
  (`FACTORY_MODEL_TIMEOUT`) then counts from the last word written, so a long answer is not cut off.
- **Notes** are the knowledge that improves over time: written by users, drafted from the manuals (**Summarise a
  topic**), or suggested by the factory after a change is delivered (what changed, which files). They start as
  *suggested*; an administrator (shared notes) or an Approver of the workspace (its own notes) approves or rejects them.
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

- **Syntax:** Java is parsed at the bank's Java level (from the Project Profile's Java version, else the pack's default: 8 for 22.x, 11 for 25.x), so newer syntax such as records or text blocks fails for a Java 8 bank. If an existing file already uses newer Java, it is parsed at the newest level instead. JSON and XML must parse; JavaScript, HTML and SQL get a basic bracket, tag and quote check (warning only).
- **Version pack rules:** YAML files in `factory-server/src/main/resources/packs/` (`common.yml` for all versions, `22.x.yml`, `25.x.yml`). A rule forbids or requires a regular expression in files matching path globs, for example no `System.out`, no SQL built by concatenation, no deprecated JET `ArrayTableDataSource`, javax vs. jakarta imports to match the codebase, labels from resource bundles, `DELETE`/`UPDATE` with `WHERE`. The format is explained at the top of `common.yml`.
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

**Sessions** use an HTTP-only cookie that ends after `FACTORY_SESSION_TIMEOUT` (30 minutes) of inactivity; changes need the CSRF token from the `XSRF-TOKEN` cookie in an `X-XSRF-TOKEN` header (the UI does this). Five failed sign-ins in a row lock a username for 15 minutes. Serve the factory over HTTPS in production and set `FACTORY_COOKIE_SECURE=true`. Sessions are kept in memory, so a restart signs everyone out, and running several servers behind a load balancer needs sticky sessions.

**Audit log** (Admin page, `GET /api/admin/audit`): sign-ins and failed sign-ins, workspace creation and deletion, SVN setting changes, imports, Project Profile corrections, requirements created, approved and deleted, review links, design approvals (including by customers), and user and role changes. Passwords are never recorded.

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

Each page is a view (`src/js/views/<page>.html`) plus a view model (`src/js/viewModels/<page>.js`), registered in the route list in `src/js/appController.js` with its sidebar `icon` (a `factory-ico-<icon>` class in `app.css`) and `group` (`work` or `setup`). `index.html` holds the shell: the dark sidebar with the product name (collapsible; it slides in on phones), the top bar, and the sign-in page. The top bar has the workspace picker (shared with the pages through `services/workspaceSelection`), search of the workspace code (Ctrl K, opens the Code page Search tab), a bell listing what needs attention (with a link to the Notification Center), Help (the About page) and the user menu. Signing in opens the **Overview** page: totals, recent workspaces, setting up a workspace, recent requirements, development progress, recent Jenkins builds and activity. `services/dashboard.js` loads that data for the Overview, the Workspaces page and the bell from the same endpoints the other pages use. `src/js/services/api.js` wraps calls to the backend.

The pages follow the screen designs in `design/design and implementation plan.docx`: Home (Overview), Workspaces (with
the workspace details), Code (and the Knowledge Explorer behind it), Project Profile, Requirements, Visual Designer,
Changes (and Impact Analysis behind it), Build, Test & Review, Modernization, Models & AI Providers, Agent Runs,
Administration, External Review, Integrations, Version Packs, AI Prompt Library, Notifications, Account & Preferences and
About. Pages show only the factory's real data; where a design shows something the factory does not record (test
counts, coverage, costs, environments), the page keeps the section in its place with a short note saying what is not recorded, controls that need server work are disabled with a tooltip, and estimates are labelled as estimates.
Agent Runs, Notifications and the Prompt Library are built from the requirements, designs, changes, builds, imports and
version-pack recipes the factory already keeps. Shared pieces:

- `services/ui.js`: tabs, status pills, initials, select and switch helpers, pagers and dates.
- `services/assistant.js`: the AI assistant panels (they call `POST /api/model/chat` with the page's context).
- `services/pageRequests.js`: hands a search or a new workspace from one page to another.
- `services/preferences.js` and `services/notifications.js`: preferences and read notifications, kept in the browser.
- `app.css`: the page kit (`factory-pg`, `factory-kpis`, `factory-card`, `factory-row-*`, `factory-tabbar`,
  `factory-stepper`, `factory-kv`, `factory-ring`) and one prefix per page.

JET bindings cannot use `new`, function literals or `$parent` inside `oj-bind-for-each` templates, and `:style` takes an
object: compute those in the view model.

## REST API (so far)

| Method and path | Purpose |
|---|---|
| `GET /api/auth/config` | Sign-in mode, single sign-on link and factory version (public) |
| `POST /api/auth/login` | Sign in with username and password (`local` and `ldap`) |
| `POST /api/auth/logout` | Sign out |
| `GET /api/auth/me` | The signed-in user with workspace roles and permissions |
| `POST /api/auth/password` | Change your own password (local accounts) |
| `GET` / `POST /api/admin/users`, `PUT /api/admin/users/{id}`, `POST /api/admin/users/{id}/password` | Users (administrators) |
| `GET /api/workspaces/{id}/members`, `PUT` / `DELETE /api/workspaces/{id}/members/{userId}` | Workspace members and roles (changes by administrators) |
| `GET /api/admin/audit` | Audit log (administrators) |
| `GET /api/workspaces` | List workspaces (administrators: all; others: their workspaces) |
| `POST /api/workspaces` | Create a workspace (`name`, `bankName`, `obdxVersion` = `22.x` or `25.x`, optional `svnUrl`) |
| `GET /api/workspaces/{id}` | Get one workspace |
| `DELETE /api/workspaces/{id}` | Delete a workspace, its index and its working copy |
| `PUT /api/workspaces/{id}/svn` | Set SVN URL, username and password (`svnPassword`: omit or null to keep, empty to remove) |
| `POST /api/workspaces/{id}/svn/test` | Check the SVN connection; returns the latest revision |
| `GET /api/update` | Version, build number and whether a newer build exists (`?check=true`: ask GitHub now, administrators) |
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
| `GET /api/workspaces/{id}/design-palette` | The designer's palette: standard components and those found in the workspace's code (`items`: `group`, `label`, `type`, `tag`, `params`, `uses`, `source`) |
| `GET /api/workspaces/{id}/designs` | List screen designs |
| `POST /api/workspaces/{id}/designs` | Create a blank design (`name`) |
| `POST /api/requirements/{id}/designs` | Create designs from an approved requirement |
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
| `POST /api/requirements/{id}/changes` | Start a change (impact analysis) for an approved requirement |
| `GET /api/changes/{id}` | Change with plan, status and files |
| `POST /api/changes/{id}/analyze` | Analyze again |
| `PUT /api/changes/{id}/plan` | Replace the plan with edited JSON |
| `POST /api/changes/{id}/approve-plan` | Approve the plan and write the code (Lead) |
| `GET /api/changes/{id}/file?path=` | One file: original, generated content and diff |
| `PUT /api/changes/{id}/file` | Save a reviewer's edit (`path`, `content`) |
| `POST /api/changes/{id}/regenerate` | Write one file again (`path`, optional `note`) |
| `GET /api/changes/{id}/patch` | Download the change as a patch |
| `POST /api/changes/{id}/deliver` | Commit the change to a new SVN branch |
| `DELETE /api/changes/{id}` | Delete a change |
| `POST /api/changes/{id}/check` | Run the quick checks again on all files |
| `GET /api/workspaces/{id}/checks` | The workspace's version pack rules, with on/off and Java level |
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
| `POST /api/workspaces/{id}/jenkins/test` | Check the Jenkins login and jobs |
| `GET /api/workspaces/{id}/profile` | The Project Profile with detected and confirmed/corrected values, and warnings |
| `POST /api/workspaces/{id}/profile/refresh` | Scan the working copy again |
| `PUT /api/workspaces/{id}/profile/facts/{key}` | Confirm or correct a fact (`value`) |
| `DELETE /api/workspaces/{id}/profile/facts/{key}` | Go back to the detected value |
| `GET /api/model/status` | The model server and models in use, and whether they were chosen on the Models page |
| `GET /api/model/servers/local` | Model servers on the factory's computer (Ollama, vLLM, LM Studio) with their models (administrators) |
| `POST /api/model/servers/models` | The models of a server (`baseUrl`, optional `apiKey`; without it the stored key of that server) (administrators) |
| `PUT /api/model/settings` | Use a server and models (`baseUrl`, `apiKey`: null keeps, empty removes, `chatModel`, `embeddingModel`; `embeddingBaseUrl`, `embeddingApiKey` for code search on another server, null: the same server) (administrators) |
| `POST /api/model/chat` | Send a test prompt (`prompt`) |
| `POST /api/model/embed` | Embed a test text (`text`); returns the vector size |
| `GET /api/knowledge` | Library overview: counts, whether folder import is allowed, the documents (older revisions too), the watched folders, and `privacy` when the models are outside the bank |
| `POST /api/knowledge/import` | Import and watch a folder (`folder`, `obdxVersion`, `patchset`, `workspaceId`: null for Oracle's manuals) |
| `POST /api/knowledge/documents` | Upload one file: PDF, Word, text, Markdown or HTML (multipart `file`, `obdxVersion`, `patchset`, `workspaceId`) |
| `DELETE /api/knowledge/documents/{id}` | Remove a document and its sections |
| `POST /api/knowledge/folders/{id}/check` | Check a watched folder for new and changed documents now |
| `DELETE /api/knowledge/folders/{id}` | Stop watching a folder (its documents stay) |
| `GET /api/knowledge/oracle` | Whether the factory may fetch from Oracle's site, and the followed versions with their last check |
| `GET /api/knowledge/oracle/versions` | The OBDX versions on Oracle's documentation index (administrators) |
| `POST /api/knowledge/oracle/follow` | Get a version's manuals from Oracle's site and keep them current (`obdxVersion`, `scope`: `TECHNICAL` or `ALL`) |
| `POST /api/knowledge/oracle/{version}/check` | Check a followed version for changed manuals now |
| `DELETE /api/knowledge/oracle/{version}` | Stop following a version (its manuals stay) |
| `POST /api/knowledge/documents/{id}/embed` | Embed the sections still without an embedding |
| `GET /api/knowledge/documents/{id}/file` | The PDF (cited as `.../file#page=N`) |
| `GET /api/knowledge/search` | Search the manuals and notes (`q`, `workspaceId`, `versionLine`) |
| `POST /api/knowledge/ask` | Answer a question with citations (`question`, `workspaceId`, `context`: the page's text) |
| `POST /api/knowledge/ask/stream` | The same answer as the model writes it, one JSON object per line (`application/x-ndjson`): `sources`, then `text` pieces, then `done` (the whole answer) or `error` |
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
