# Development guide

## Project layout

| Folder | What it is |
|---|---|
| `factory-ui/` | Oracle JET web UI (Knockout MVVM, same style as OBDX). Built into static files and packaged into a jar. |
| `factory-server/` | Spring Boot backend (Java 21): REST API, model gateway, database access. Serves the UI. |
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
- `jenkins/`: Jenkins settings, REST client and build log parsing.
- `auth/`: sign-in and roles. `SecurityConfig` sets up sessions, CSRF and the sign-in options (local accounts, LDAP, OIDC); `AccessGuard` checks the signed-in user's permissions and is called by every controller; `UserDirectory` manages users; `AuditLog` records who did what.
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

To try the model gateway with Ollama:

```bash
ollama pull qwen2.5-coder:7b
ollama pull nomic-embed-text
```

Then open the **Models** page and send a prompt.

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
4. Analysts answer open questions and click **Update spec with answers**: answered questions become decisions, and the model updates the spec with them. The spec can also be edited as JSON. Every change is stored as a new spec version.
5. **Approve** locks the spec. It needs at least one screen and no open questions.

Scanned PDFs have no text layer and need OCR before upload. With a local model, drafting a long BRD can take minutes; raise `FACTORY_MODEL_TIMEOUT` if calls time out, and lower `FACTORY_REQUIREMENTS_MAX_CHARS` for models with a small context window.

## Screen designer

1. On the **Designer** page, pick an **approved** requirement and click **Create designs**: one design per screen of its spec, with every field mapped to a component (dropdown fields become selects, "max length 35" becomes a 35-character limit, and so on). A blank screen can also be started.
2. Edit the structure: sections (title, 1–3 columns), components (drag and drop, or the arrow buttons), and the selected component's properties (label, type, field name, mandatory, length, default, placeholder, help, read-only, options, validations). Action buttons have a label and a style.
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

With `ldap` and `oidc`, users appear in the factory at their first sign-in (or can be added in advance on the Admin page). `FACTORY_ADMIN_USERS` names users who are always administrators.

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

`ojet serve` serves the UI on its own port and reloads on save. The UI calls the backend at the relative path `api/`, so either open the UI through the Spring Boot server after a build, or configure a proxy for `api/` to `http://localhost:8080`.

Pages follow the JET navbar pattern: each page is a view (`src/js/views/<page>.html`) plus a view model (`src/js/viewModels/<page>.js`), registered in the route list in `src/js/appController.js`. `src/js/services/api.js` wraps calls to the backend.

## REST API (so far)

| Method and path | Purpose |
|---|---|
| `GET /api/auth/config` | Sign-in mode (public) |
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
| `POST /api/workspaces/{id}/imports` | Start an import (check out or update, then index) |
| `GET /api/workspaces/{id}/imports` | Recent import jobs with progress |
| `GET /api/workspaces/{id}/index` | Indexed revision and file/piece counts |
| `GET /api/workspaces/{id}/search?q=...` | Search the workspace's code |
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
| `GET /api/workspaces/{id}/designs` | List screen designs |
| `POST /api/workspaces/{id}/designs` | Create a blank design (`name`) |
| `POST /api/requirements/{id}/designs` | Create designs from an approved requirement |
| `GET /api/designs/{id}` | Design with current model, versions and comments |
| `GET /api/designs/{id}/versions/{version}` | An earlier version's model |
| `PUT /api/designs/{id}/model` | Save the model as a new version (`model`, optional `note`) |
| `POST /api/designs/{id}/ai-change` | Apply a change described in words (`instruction`) |
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
| `POST /api/changes/{id}/build` | Build the change with Jenkins, fixing build errors in its files (background) |
| `GET /api/workspaces/{id}/jenkins` | Jenkins settings (204 when not set; the token is never returned) |
| `PUT /api/workspaces/{id}/jenkins` | Save Jenkins settings (`token`: omit or null to keep, empty to remove) |
| `POST /api/workspaces/{id}/jenkins/test` | Check the Jenkins login and jobs |
| `GET /api/workspaces/{id}/profile` | The Project Profile with detected and confirmed/corrected values, and warnings |
| `POST /api/workspaces/{id}/profile/refresh` | Scan the working copy again |
| `PUT /api/workspaces/{id}/profile/facts/{key}` | Confirm or correct a fact (`value`) |
| `DELETE /api/workspaces/{id}/profile/facts/{key}` | Go back to the detected value |
| `GET /api/model/status` | Show the configured model endpoint and models |
| `POST /api/model/chat` | Send a test prompt (`prompt`) |
| `POST /api/model/embed` | Embed a test text (`text`); returns the vector size |
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

## Installing on a Linux server

1. Build with Jenkins (or `mvn clean verify`) and copy `factory-server/target/obdx-factory.jar` to `/opt/obdx-factory/`.
2. Copy `deploy/obdx-factory.env` to `/etc/obdx-factory/obdx-factory.env`, fill in the database, secret key and model settings, and `chmod 600` it. Install the `subversion` package and create the data directory (`mkdir -p /var/lib/obdx-factory`, owned by the service user).
3. Create the service user: `useradd --system obdxfactory`.
4. Copy `deploy/obdx-factory.service` to `/etc/systemd/system/` and run `systemctl daemon-reload && systemctl enable --now obdx-factory`.
5. Check: `curl http://localhost:8080/actuator/health`.

## Not built yet

SAML sign-in and the React Native / React target packs. See the roadmap in [ARCHITECTURE.md](ARCHITECTURE.md).
