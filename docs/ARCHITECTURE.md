# OBDX Development Factory: Architecture and Requirements

Status: Draft v0.2
Scope: OBDX 22.x and 25.x, full stack (UI, services, integration, data)

---

## 1. Purpose

Many banks run Oracle Banking Digital Experience (OBDX), each on its own version and with its own customizations. Building a new feature for a bank means learning that bank's codebase first, then repeating work that has been done many times before for other banks.

OBDX Development Factory is a web-based tool that takes a requirement (a prompt, BRD, FSD or other technical document) and turns it into working code inside the bank's existing OBDX application. It either builds new screens or enhances existing ones. Before any code is written, proposed screens can be previewed and changed interactively with the customer.

The same foundation also supports **modernization**: redesigning a bank's OBDX frontend in another technology such as React Native, on top of the existing OBDX services (see section 6).

The tool runs on local or privately hosted AI models, so bank code and documents never leave approved infrastructure.

### Goals

- Cut the time from requirement to reviewable code for OBDX customizations.
- Let customers see, change and approve proposed screens before development starts.
- Make generated code follow each bank's existing conventions and version.
- Keep a human in control at every major step (spec, screen design, plan, code).
- Stay independent of the target UI technology, so new targets can be added without redesigning the factory.
- Run fully on-prem or in a private cloud, with no dependency on public AI services.

### Non-goals (for now)

- Training a model from scratch.
- Deploying to bank environments automatically. Output is an SVN branch or patch for normal review.
- Replacing functional testing or UAT.

---

## 2. Users and deployment modes

| User | How they use it | Deployment mode |
|---|---|---|
| Delivery team serving many banks | One installation, a separate workspace per bank | **Factory mode** (multi-tenant) |
| Bank IT team | Installed inside the bank, only their codebase | **Bank mode** (single-tenant) |

Both modes ship from the same codebase. A **workspace** is the unit of isolation: one bank, one OBDX version, one codebase, its own documents, indexes, model settings and access rules.

### Roles

- **Admin:** manages workspaces, model settings, users.
- **Analyst:** uploads requirements, reviews and edits the structured spec, prepares screen designs.
- **Customer reviewer:** a bank business user who views screen previews through a shared link, comments, suggests changes and approves designs. Has no access to code.
- **Developer:** reviews impact, plan and generated code; exports the result.
- **Reviewer/Lead:** approves the plan and the final change.

---

## 3. Supported change types

Initial focus, based on the most common BRD content:

1. **New screens:** a new UI component with its view model, template, labels, navigation/menu entry, the REST service behind it, DTOs, host adapter calls and any DB/configuration scripts.
2. **Enhancing existing screens:** adding fields, sections, validations or actions to an existing screen, plus the matching service, DTO, adapter and data changes.

Later: new host integrations, new transaction flows, reports, and full frontend modernization (section 6).

---

## 4. End-to-end workflow

```
 Requirement (prompt / BRD / FSD)
            |
   [1] Ingest and understand  ------>  Structured spec                 (human review)
            |
   [2] Screen design          ------>  Screen Model + live preview     (customer review and approval)
            |
   [3] Impact analysis        ------>  New vs. extend, affected files
            |
   [4] Plan                   ------>  Layer-by-layer change plan      (human approval)
            |
   [5] Generate               ------>  Code per layer (UI, service, integration, data, tests)
            |
   [6] Validate and fix loop  ------>  Local checks + Jenkins build; errors fed back
            |
   [7] Deliver                ------>  SVN branch / patch + change summary  (human review)
```

### Step details

1. **Ingest and understand.** Parse the document (Word, PDF, text, including tables). Extract a structured spec: screens, fields (name, type, validation, mandatory), actions, business rules, roles/entitlements, APIs, host interactions, messages. Flag gaps and ambiguities as questions for the analyst. *Implemented:* long documents are drafted section by section and merged; analysts answer questions, the model applies the answers (kept as decisions), every change is a spec version, and approval requires no open questions. Each screen is linked to possibly related existing code via code search.
2. **Screen design and customer review.** The AI drafts a Screen Model for each new or changed screen. For an existing screen, the draft starts from that screen's current layout, taken from the code. The analyst and customer review it in the Screen Designer with a live preview, make changes, and approve it (section 5.7). The approved Screen Model is locked and becomes the source for UI generation.
3. **Impact analysis.** *(Implemented, see 5.4.)* Search the workspace's code index to find related screens, services and adapters. Decide whether each requirement is a new component or an extension. List affected files with reasons.
4. **Plan.** Produce an ordered plan by layer, with the files to create or modify and the pattern from the version pack each one follows. A reviewer approves or edits the plan before any code is generated.
5. **Generate.** Generate code layer by layer, each step grounded in the approved Screen Model, retrieved code from the same codebase, the Project Profile and the version pack.
6. **Validate and fix.** Run quick local checks first (syntax, lint). Then commit the changes to a temporary SVN branch and trigger the bank's existing Jenkins pipeline to build the UI and backend packages and run tests. Feed failures back to the model for a bounded number of retries. Report anything still failing.
7. **Deliver.** Produce an SVN branch or a patch file (applies with TortoiseSVN "Apply Patch"), a change summary, the spec-to-code traceability, and a test checklist.

---

## 5. Architecture

```
+-----------------------------------------------------------------------------+
| Web UI (Oracle JET)                                                         |
| workspaces | upload | spec editor | screen designer + preview | plan | diff |
+-----------------------------------------------------------------------------+
| API and Orchestrator (Spring Boot)                                          |
| auth (SSO), roles, workspaces, jobs, approvals, review links, audit log     |
+----------------+----------------+----------------+-------------+------------+
| Document       | Code Indexer   | Agent Pipeline | Screen      | Build      |
| Ingest         | per workspace: | spec, impact,  | Models      | Validation |
| parse BRD/FSD  | chunks, graph, | plan, generate,| versions,   | local      |
| extract spec   | embeddings,    | validate, fix  | comments,   | checks +   |
|                | Project Profile|                | approvals   | Jenkins    |
+----------------+----------------+----------------+-------------+------------+
| Model Gateway (OpenAI-compatible)    | Version Packs (22.x, 25.x)           |
| vLLM / Ollama / private endpoints    | Target Packs (JET; React Native and  |
| routing per workspace and per task   | React later) + preview renderers     |
+--------------------------------------+--------------------------------------+
| PostgreSQL + pgvector | File storage (docs, artifacts) | SVN (bank repos)   |
+-----------------------------------------------------------------------------+
```

### 5.1 Model Gateway

- Single internal interface using the OpenAI-compatible chat/completions and embeddings API.
- Backends: local (vLLM, Ollama) or privately hosted (for example Azure OpenAI in a private network, AWS Bedrock, OCI Generative AI).
- Per-workspace settings: allowed endpoints (a bank can require "on-prem only"), model per task (planning, code generation, summarizing, embeddings).
- Logs every call (prompt size, model, latency, workspace) for audit and cost tracking. Prompt content logging is configurable.

### 5.2 Code Indexer

- Imports a workspace's codebase from its SVN repository (see 5.6).
- Parses Java, JavaScript, HTML, JSON, SQL and properties/resource files into meaningful chunks. Implemented so far: Java by class outline and method (JavaParser); other files by windows of lines. Planned: structure-aware chunking for JET view models and templates (tree-sitter).
- Builds a dependency graph: screen → view model → REST endpoint → service → adapter → DB objects.
- Stores embeddings plus keyword search; retrieval combines both with graph expansion.
- Tags every chunk with workspace, OBDX version and whether it is product code or bank customization.
- Re-indexes incrementally on new SVN revisions: after `svn update`, only files whose content hash changed are re-indexed, and deleted files are removed.

#### Project Profile (stack detection)

The factory does not assume a fixed technology stack for the OBDX code it generates. When a workspace is first indexed, the scanner builds a **Project Profile** from the codebase itself, and every later step generates code that matches it. Examples of what it detects:

- OBDX version and patch level.
- UI: Oracle JET version, component and module structure, third-party JS libraries, styling and resource bundle conventions.
- Backend: Java version, frameworks and libraries in use, build tool and packaging (from build files and dependencies).
- Data: database type, script conventions, naming patterns for tables and sequences.
- Integration: host systems and adapter patterns in use.
- Bank conventions: package names, folder layout for customizations, naming, logging, error handling, code style.

The profile is stored with the workspace, shown in the UI for a developer to confirm or correct, and refreshed when the codebase changes. Where the profile and the version pack disagree, the profile wins, because it reflects what the bank actually runs.

Implementation: rule-based detectors scan the working copy after each import, so results are repeatable, need no model, and every fact lists the files it came from with a confidence level. Developers' confirmed or corrected values are stored separately and survive re-scans. A warning is shown when the detected OBDX version disagrees with the workspace's version.

### 5.3 Version Packs

A version pack captures what differs between OBDX releases, so generation follows the right conventions:

- Folder and module structure for UI and backend.
- Extension points and the recommended way to extend screens, services and adapters.
- Build and packaging steps.
- Templates and reference examples for new screens and for screen enhancements.
- Known APIs and deprecated patterns.

Packs exist for **22.x** and **25.x**, are versioned files in this repo, and are built partly by comparing the customized codebases we already have. Exact contents must be confirmed against each release.

*Implemented:* the quick-check part of the packs: YAML rule files (common, 22.x, 25.x) with forbidden or required patterns per path glob, conditions on the Project Profile (JET version, javax/jakarta, module system), a default Java level per version, team overrides from a folder without rebuilding, and per-workspace on/off. Also implemented: recipes for the usual kinds of work (new or enhanced UI screen, new or enhanced backend class, host adapter, database script, unit test), each with guidance, templates for new files and finders that pick reference examples from the bank's indexed code (customization folders first), which developers can pin per workspace. The planner gets the recipes with their examples; the model writing a file gets the matching recipe's guidance, template and examples. Not yet: release-specific extension points and build steps confirmed against Oracle's documentation for each release.

### 5.4 Agent Pipeline

- Explicit state machine in Java (using LangChain4j for model calls), one step per workflow stage, with human approval gates after spec, screen design and plan.
- Each step reads only from its own workspace's index, its Project Profile, the matching version pack and the target pack.
- Structured outputs (JSON schemas) for spec, Screen Model, impact and plan so they can be edited in the UI.
- Bounded fix loop (for example max 3 retries per layer).
- *Implemented:* impact analysis (code search per screen, rule, API and host interaction, then a model-written plan that is validated against the working copy), plan approval by a Lead, file-by-file generation in layer order with parse checks and up to two fixes per file, reviewer edits and per-file regeneration, delivery as a Subversion patch or a branch committed in one `svnmucc` commit. The Jenkins build and build-error fix loop (5.5) is also implemented.

### 5.5 Build Validation (Jenkins)

OBDX teams already build UI and backend packages with Jenkins pipelines, so the factory reuses them instead of introducing a new build system.

- **Quick local checks** run first on the factory server, with no build tools needed: Java parsing at the bank's Java level (JavaParser), JSON/XML well-formedness, basic JavaScript/HTML/SQL balance checks, and the version pack rules. These catch many mistakes in milliseconds.
- **Jenkins build:** the factory commits the generated changes to a temporary SVN branch (for example `branches/factory/<request-id>`) and triggers the workspace's Jenkins job through the Jenkins REST API (`buildWithParameters`, passing the branch path). The job's Subversion checkout uses that parameter in its repository URL.
- **Results:** the factory polls the build status, then reads the console log and JUnit test reports through the API and turns them into structured errors for the fix loop.
- **Per-workspace settings:** Jenkins URL, job names (UI and backend), the parameter name for the branch, and a Jenkins API token stored in the secret store.
- **Requirement on the bank side:** a Jenkins job that accepts a branch parameter and publishes test results. Existing jobs usually need only that one parameter added.
- **Trade-off:** a Jenkins build takes minutes, not seconds, so the fix loop is capped (for example 3 build attempts) and local checks do as much as possible before each build.
- Temporary branches are deleted after the request is delivered or abandoned.
- **If the bank does not allow the factory to commit:** the Jenkins job can instead take the patch file as a file parameter, check out trunk, apply the patch and build. Nothing is committed to the repository.
- *Implemented:* per-workspace Jenkins settings (branch or patch mode, encrypted API token, connection test), triggering every job with the branch path/URL or the patch file, polling queue and build, error extraction from console logs (Maven, javac, ESLint, TypeScript) and JUnit reports, and up to two model fix rounds limited to the change's own files, with fixes committed to the change branch. Quick checks run before each Jenkins round and their errors are fixed first. Delivery branches are removed when a change is closed as merged (checked with Subversion merge tracking) or abandoned, and a nightly check closes changes whose branch was merged.

### 5.6 Version Control (SVN)

OBDX code is kept in Subversion repositories. Developers use TortoiseSVN on Windows, and Jenkins jobs check out from the same SVN server. The factory talks to the SVN server directly with the standard `svn` command-line client; no TortoiseSVN install is needed on the server.

- **Import:** check out (or export) the workspace's trunk or a chosen branch at a known revision. Store the revision number with the index.
- **Incremental updates:** `svn update` brings the working copy to HEAD; the indexer re-indexes files whose content hash changed (simpler and more robust than parsing `svn diff`).
- **History:** `svn log` messages are used to link BRDs and change request IDs to the revisions that implemented them (for the evaluation set).
- **Temporary branches:** `svn copy trunk branches/factory/<request-id>` (a cheap server-side copy), then commit the generated changes there for the Jenkins build.
- **Delivery options:**
  1. An SVN branch that developers review and merge with TortoiseSVN as usual.
  2. A unified diff patch file that developers apply with TortoiseSVN "Apply Patch" on their working copy. No repository write access needed for the factory.
- **Access:** a dedicated SVN service account per workspace, read-only by default. Write access, if granted, is limited to `branches/factory/`. Credentials are kept in the secret store.
- **Design:** version control sits behind a small adapter interface, so Git can be added later for banks that use it.

### 5.7 Screen Model and Screen Designer

Customers need to see a proposed screen as it will really look and behave before development starts. The Screen Designer provides an interactive preview built from real components, and the **Screen Model** is the agreed description that code generation follows.

```
BRD / FSD  ->  Screen Model (JSON)  <->  Live preview + designer  ->  Customer approves  ->  Code generation
```

**Screen Model.** A structured, versioned JSON description of a screen: sections, fields, component types, labels, help text, validations, mandatory flags, default values, actions/buttons, layout (grid, order, responsive behavior), navigation, roles, and the services each part calls. It is **target-neutral**: it describes what the screen does, not how a specific UI technology implements it, so the same model can generate JET, React Native or React screens (5.8).

**Designer features:**

- AI drafts the Screen Model from the spec. For existing screens, it starts from the current screen, reverse-engineered from the code.
- Live preview with real components, the bank's theme and generated sample data (never real customer data).
- Change component types (text box → dropdown, radio → switch, text → date picker), from a catalog limited to what the workspace's target and version support.
- Reorder fields and sections by drag and drop; change grid layout.
- Edit labels, help text, mandatory flags, validations and default values; add or remove fields, sections, tables and buttons.
- Desktop, tablet and mobile views.
- Changes by chat ("move remarks to the end and make it optional"); the AI updates the Screen Model and the preview refreshes.
- Shareable review link for customer reviewers, with comments, version history, side-by-side comparison of versions, and an Approve action. The approved version is locked.

**Preview isolation.** The preview runs in an isolated frame, separate from the factory's own UI. Each workspace's preview loads its own target runtime: for OBDX JET screens, the JET version and bank theme detected in the Project Profile (22.x and 25.x use different JET versions). This keeps previews accurate and keeps the factory UI independent of any bank's versions.

**Scope.** Start with form-style screens (fields, sections, tables, buttons), which cover most OBDX requirements. Complex custom widgets are shown as placeholders until supported.

**Implemented (first version):** designs are generated from approved requirement specs (or started blank) with form components (text, multi-line text, number, amount, date, dropdown, account selector, radio, checkboxes, switch, read-only text) and action buttons. The designer supports drag-and-drop ordering, a properties panel, plain-language changes through the model, versions, comments and review links with customer comments and approval. Not yet: tables/grids as components, the bank's own JET version and theme in the preview, starting enhancements from the existing screen's layout in the code, and side-by-side version comparison.

### 5.8 Target Packs

A **Target Pack** teaches the factory how to turn a target-neutral Screen Model into code for one UI technology. Each pack contains:

- Component mapping (for example, a Screen Model "select" becomes a JET select component, or a React Native picker).
- Project and folder structure, navigation and routing patterns.
- Styling and theming approach.
- State management and form/validation patterns.
- API client patterns for calling OBDX REST services.
- Test patterns.
- A **preview renderer** for the Screen Designer.

| Target pack | Preview renderer | When |
|---|---|---|
| **OBDX JET** (per version: 22.x, 25.x) | Real JET components with the bank theme | First |
| **React Native** (iOS/Android) | React Native Web in the browser; Expo on a real device for checks | Modernization (section 6) |
| **React** (web) | React in the browser | Later, on demand |

Version packs (5.3) describe OBDX release differences; target packs describe UI technologies. A workspace uses one version pack and one target pack at a time.

*Implemented:* JET, React Native (Expo, TypeScript) and React (Vite, TypeScript) target packs in `target-packs/`, each with component mapping, file structure, guidance, quick-check rules, recipes, templates and a starter project whose form components are also what the designer's preview renders (React Native Web for React Native). A workspace chooses its target and the app folder; generated screens start from a deterministic scaffold of the approved Screen Model, and parity (every field and action as a testID) is checked and tested. Not yet: device previews with Expo inside the factory, and the modernization steps of section 6 beyond building screens (inventory, reverse-engineering, waves).

### 5.9 Knowledge Base (OBDX Library)

The factory's own knowledge of OBDX, separate from the bank's code: Oracle's manuals per OBDX version, the bank's own
documents (scoped to its workspace), and **notes**. It is retrieval-augmented: documents are split into sections with
their pages and embedded once; each question or generation step retrieves the few most relevant sections (keywords and
meaning, merged by reciprocal rank fusion, limited to the workspace's OBDX version) and sends only those to the model,
which cites them. Notes are how the knowledge matures: users write them, the model drafts them from the manuals, and
the factory suggests one after each delivered change; an approver makes them trusted. Code generation and analysis use
the manuals and trusted notes only; the AI chat may also use suggested notes and says so. Feedback on answers is kept.
The knowledge is internal to the bank: it is sent only to model servers on the bank's network (this computer, private
addresses, or hosts the administrator lists), whatever models are configured; with models outside it, the factory
works without the knowledge and says why. It keeps itself current: imported folders are watched, a changed file
becomes a newer revision of its document (the older one is kept as history), and notes whose cited sections changed go
back to review. The bank's own and patchset-specific documents (PDF, Word, text, Markdown, HTML) belong to its
workspace, rank above Oracle's generic manuals, and win where they differ.

*Not yet:* a 22.x/25.x difference view, an evaluation set of test questions, and answers shown word by word.

---

## 6. Modernization mode

Some banks may ask to redesign their whole OBDX frontend in another technology, for example a React Native mobile app (iOS and Android) or a React web app. The OBDX backend and its REST services stay; the new frontend calls them. This is a different kind of job from enhancing screens, so it runs as a separate mode built on the same foundation.

| | Enhancement mode | Modernization mode |
|---|---|---|
| Backend | OBDX services, extended as needed | OBDX REST services stay; the new app calls them |
| Frontend | Existing JET code, extended | New app (for example React Native), mostly generated |
| Conventions come from | Bank's existing codebase (Project Profile) | Bank's new design system plus a starter project |
| Main job | Add or enhance screens | Move many existing screens faithfully, in phases |

### Steps

1. **Scan and inventory.** Build a catalog of every screen, user flow, REST service and role in the bank's OBDX application. This is the migration map. *Implemented:* a rule-based scan after each import (JET views, OBDX component folders, composite and VDOM components; JAX-RS and Spring services matched to the UI's calls; roles and segments; navigation flows; S/M/L sizes), shown on the Modernization page and exported as CSV.
2. **Reverse-engineer screens.** Turn each existing JET screen into a target-neutral Screen Model, with fields, validations, actions and service calls taken from the real code.
3. **Set up the target.** Agree the bank's new design system (colors, typography, components) and create a starter project: navigation, login, API client, error handling, logging. This acts as the target's profile.
4. **Redesign and review.** Customers review and change screens in the Screen Designer with the React Native preview renderer, and check them on a real device with Expo.
5. **Generate in waves.** Plan the migration by module (for example login and dashboard, then accounts, then payments). Generate screens plus a typed API layer from the OBDX REST services.
6. **Check parity.** Verify that each new screen covers the same fields, validations, flows and service calls as the old one, using tests generated from the Screen Model.
7. **Build and deliver.** The same SVN and Jenkins flow, with Jenkins jobs for Android and iOS builds.

### Impact on the factory and the team

- The factory's own UI stays Oracle JET. Only the preview renderer and target pack change per target.
- Someone on the bank's or delivery team must know the target technology (for example React Native) to review the generated code. The factory reduces this effort but does not remove it.

### Risks to raise with the bank

- **Security features:** OBDX login, two-factor authentication, device binding and session handling must be rebuilt correctly. These need human design, not only generation.
- **Upgrades:** with a custom frontend, the bank no longer gets Oracle's UI improvements on upgrade. Each new OBDX release needs a check of the services the app uses.
- **Mobile-only features:** push notifications, biometrics, offline behavior and app store releases are new work that has no equivalent in OBDX's JET screens.
- **Scale:** a full redesign is a program of many months. The factory speeds up screen and API work; testing and UAT remain significant.

---

## 7. Data and isolation

- **Strict workspace isolation:** separate index namespaces, storage prefixes and database row-level security. Retrieval never crosses workspaces.
- **Factory mode** may optionally run a separate database schema per bank.
- **No cross-bank training** without written consent from each bank.
- **Encryption** at rest and in transit; secrets in a vault.
- **Audit log** of uploads, approvals, generations, exports and model calls.
- **Customer review links** are scoped to one Screen Model, time-limited and access-controlled; previews use sample data only.

### Using existing assets

- **Customized codebases:** indexed per workspace; compared across banks (with consent) to derive version pack patterns.
- **BRDs:** where possible, link each BRD to the SVN revisions that implemented it (via change request IDs in commit messages). These pairs form the evaluation set first, and possible fine-tuning data later.
- **Licensing:** confirm that Oracle license terms and each bank's contract allow indexing and using the code this way before ingestion.

---

## 8. Tech stack (of the factory tool)

This is the stack used to build the OBDX Development Factory itself. The stack of the OBDX code it generates is not fixed here; it comes from each workspace's Project Profile (see 5.2) and target pack (see 5.8).

The stack is chosen so that OBDX developers (Java, Oracle JET, SQL, Maven, Jenkins, SVN) can build and maintain the tool without learning a new language. Heavy computation runs in the model server and the database, so this costs no performance.

| Part | Choice |
|---|---|
| Web UI | Oracle JET, built into static files and served by the Spring Boot backend (no separate Node.js server) |
| Code diff viewer | Monaco Editor or diff2html, embedded in JET |
| Screen Designer | JET UI with a drag-and-drop library (for example SortableJS); preview in an isolated frame |
| Preview renderers | JET (per workspace JET version and theme) first; React Native Web / Expo and React added with their target packs |
| Backend API | Java 21 + Spring Boot, run as a standalone service |
| AI workflow | LangChain4j (or Spring AI), with a simple explicit state machine for the pipeline steps |
| Database / vectors | PostgreSQL + pgvector (app data, keyword search and vector search in one database) |
| Data access | Spring Data JPA / Hibernate; schema migrations with Flyway |
| Background jobs | Spring scheduling with a job table in PostgreSQL (no Redis) |
| File storage | Server file system (uploaded documents, generated patches) |
| Version control | Subversion via the `svn` CLI (or SVNKit) behind an adapter interface; Git adapter later |
| Code parsing | tree-sitter Java bindings; JavaParser for deeper Java analysis |
| Document parsing | Apache POI (Word/Excel), Apache Tika / PDFBox (PDF); optional `docling-serve` HTTP service for complex PDFs |
| Local models | Open-weight coding models (Qwen Coder / DeepSeek Coder class) served by vLLM; Ollama for dev. Installed and run, not coded |
| Embeddings | Local embedding model (BGE / Nomic class) served by the same model server |
| Build validation | Quick local checks + the bank's existing Jenkins pipelines via the Jenkins REST API |
| Auth | Spring Security with LDAP / OIDC / SAML, role-based access |
| Build of the tool | Maven, Jenkins, SVN (same as OBDX projects) |
| Packaging | Spring Boot jar run as a Linux service (systemd); no Docker knowledge needed. Container images optional |

---

## 9. Quality and evaluation

- **Evaluation set:** 10–20 past BRDs per version with their real implementations.
- **Metrics:**
  - Spec extraction: fields and rules correctly captured.
  - Screen design: share of fields, components and validations in the AI's first draft that survive customer review unchanged.
  - Impact analysis: affected files found (precision/recall vs. the real change).
  - Code: builds on first try / after fix loop; tests pass; reviewer edit effort.
  - Modernization: parity of migrated screens (fields, validations, flows, service calls) with the originals.
- Run the evaluation on every change to prompts, models, version packs or target packs.

---

## 10. Non-functional requirements

- Runs with no internet access (air-gapped bank mode).
- Index a typical customized OBDX codebase in under 1 hour; incremental updates in minutes.
- Spec and plan in minutes; full generation within a working session.
- Screen preview refreshes within about a second after a designer change.
- Hardware guide: at least one or two data-center GPUs for a 30B+ class coding model, or a private model endpoint.

---

## 11. Roadmap

| Phase | Outcome |
|---|---|
| 0: Retrieval proof | Index one bank's 22.x codebase; answer "where is X implemented?" correctly |
| 1: Spec and screen design MVP | BRD → structured spec → Screen Model with live JET preview, designer and customer review links → impact analysis → plan |
| 2: Code generation | Full-stack generation for new screens and screen enhancements on 22.x from approved Screen Models, with build-and-fix loop |
| 3: Multi-version and modes | Add 25.x pack, multiple workspaces, bank-mode installer |
| 4: Improve | Run evaluation on past BRDs; LoRA fine-tuning if scores show the need |
| 5: Modernization | React Native target pack and preview renderer; scan-and-inventory, reverse-engineering and wave planning (React target pack on demand) |

The Screen Model is kept target-neutral from Phase 1, so Phase 5 adds target packs without redesigning the factory.

---

## 12. Open questions

- Which bank codebase and BRDs make up the Phase 0/1 pilot?
- For each bank: SVN server URL and repository layout (trunk/branches/tags), and whether the factory may commit to `branches/factory/` or must deliver patches only.
- For the pilot bank: Jenkins version, job names for UI and backend builds, whether jobs already accept a branch parameter, and whether they publish JUnit results.
- Which GPUs or private model endpoints are available for the pilot?
- Licensing confirmation for indexing product and customized code.
- Can customer reviewers reach the factory (network access, SSO or guest links), especially in bank mode?
- Is there a bank currently asking for a React Native (or React) redesign, and does it have a design system already?
