# OBDX Development Factory: Architecture and Requirements

Status: Draft v0.1
Scope: OBDX 22.x and 25.x, full stack (UI, services, integration, data)

---

## 1. Purpose

Many banks run Oracle Banking Digital Experience (OBDX), each on its own version and with its own customizations. Building a new feature for a bank means learning that bank's codebase first, then repeating work that has been done many times before for other banks.

OBDX Development Factory is a web-based tool that takes a requirement (a prompt, BRD, FSD or other technical document) and turns it into working code inside the bank's existing OBDX application. It either builds new screens or enhances existing ones.

The tool runs on local or privately hosted AI models, so bank code and documents never leave approved infrastructure.

### Goals

- Cut the time from requirement to reviewable code for OBDX customizations.
- Make generated code follow each bank's existing conventions and version.
- Keep a human in control at every major step (spec, plan, code).
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
- **Analyst:** uploads requirements, reviews and edits the structured spec.
- **Developer:** reviews impact, plan and generated code; exports the result.
- **Reviewer/Lead:** approves the plan and the final change.

---

## 3. Supported change types

Initial focus, based on the most common BRD content:

1. **New screens:** a new UI component with its view model, template, labels, navigation/menu entry, the REST service behind it, DTOs, host adapter calls and any DB/configuration scripts.
2. **Enhancing existing screens:** adding fields, sections, validations or actions to an existing screen, plus the matching service, DTO, adapter and data changes.

Later: new host integrations, new transaction flows, reports.

---

## 4. End-to-end workflow

```
 Requirement (prompt / BRD / FSD)
            |
   [1] Ingest and understand  ------>  Structured spec      (human review)
            |
   [2] Impact analysis        ------>  New vs. extend, affected files
            |
   [3] Plan                   ------>  Layer-by-layer change plan  (human approval)
            |
   [4] Generate               ------>  Code per layer (UI, service, integration, data, tests)
            |
   [5] Validate and fix loop  ------>  Build, lint, tests in sandbox; errors fed back
            |
   [6] Deliver                ------>  SVN branch / patch + change summary  (human review)
```

### Step details

1. **Ingest and understand.** Parse the document (Word, PDF, text, including tables). Extract a structured spec: screens, fields (name, type, validation, mandatory), actions, business rules, roles/entitlements, APIs, host interactions, messages. Flag gaps and ambiguities as questions for the analyst.
2. **Impact analysis.** Search the workspace's code index to find related screens, services and adapters. Decide whether each requirement is a new component or an extension. List affected files with reasons.
3. **Plan.** Produce an ordered plan by layer, with the files to create or modify and the pattern from the version pack each one follows. A reviewer approves or edits the plan before any code is generated.
4. **Generate.** Generate code layer by layer, each step grounded in retrieved code from the same codebase and the version pack.
5. **Validate and fix.** Run quick local checks first (syntax, lint). Then commit the changes to a temporary SVN branch and trigger the bank's existing Jenkins pipeline to build the UI and backend packages and run tests. Feed failures back to the model for a bounded number of retries. Report anything still failing.
6. **Deliver.** Produce an SVN branch or a patch file (applies with TortoiseSVN "Apply Patch"), a change summary, the spec-to-code traceability, and a test checklist.

---

## 5. Architecture

```
+---------------------------------------------------------------------------+
| Web UI                                                                    |
| workspaces | upload | spec editor | impact view | plan review | diff view |
+---------------------------------------------------------------------------+
| API and Orchestrator                                                      |
| auth (SSO), roles, workspaces, jobs, approvals, audit log                 |
+------------------+------------------+------------------+------------------+
| Document Ingest  | Code Indexer     | Agent Pipeline   | Build Validation |
| parse BRD/FSD    | per workspace:   | spec, impact,    | quick local      |
| extract spec     | chunks, symbols, | plan, generate,  | checks + bank's  |
|                  | dependency graph,| validate, fix    | Jenkins pipeline |
|                  | embeddings       |                  | via REST API     |
+------------------+------------------+------------------+------------------+
| Model Gateway (OpenAI-compatible)        | Version Packs (22.x, 25.x)     |
| vLLM / Ollama / private cloud endpoints  | patterns, extension points,    |
| routing per workspace and per task       | build steps, templates         |
+------------------------------------------+--------------------------------+
| PostgreSQL + pgvector | Object storage (docs, artifacts) | SVN (bank repos)|
+---------------------------------------------------------------------------+
```

### 5.1 Model Gateway

- Single internal interface using the OpenAI-compatible chat/completions and embeddings API.
- Backends: local (vLLM, Ollama) or privately hosted (for example Azure OpenAI in a private network, AWS Bedrock, OCI Generative AI).
- Per-workspace settings: allowed endpoints (a bank can require "on-prem only"), model per task (planning, code generation, summarizing, embeddings).
- Logs every call (prompt size, model, latency, workspace) for audit and cost tracking. Prompt content logging is configurable.

### 5.2 Code Indexer

- Imports a workspace's codebase from its SVN repository (see 5.6).
- Parses Java, JavaScript, HTML, JSON, SQL and properties/resource files with tree-sitter into meaningful chunks (classes, methods, components, view models, templates).
- Builds a dependency graph: screen → view model → REST endpoint → service → adapter → DB objects.
- Stores embeddings plus keyword search; retrieval combines both with graph expansion.
- Tags every chunk with workspace, OBDX version and whether it is product code or bank customization.
- Re-indexes incrementally on new SVN revisions (only files changed since the last indexed revision).

### 5.3 Version Packs

A version pack captures what differs between OBDX releases, so generation follows the right conventions:

- Folder and module structure for UI and backend.
- Extension points and the recommended way to extend screens, services and adapters.
- Build and packaging steps.
- Templates and reference examples for new screens and for screen enhancements.
- Known APIs and deprecated patterns.

Packs exist for **22.x** and **25.x**, are versioned files in this repo, and are built partly by comparing the customized codebases we already have. Exact contents must be confirmed against each release.

### 5.4 Agent Pipeline

- Explicit state machine (LangGraph or custom), one step per workflow stage, with human approval gates after spec and plan.
- Each step reads only from its own workspace's index and the matching version pack.
- Structured outputs (JSON schemas) for spec, impact and plan so they can be edited in the UI.
- Bounded fix loop (for example max 3 retries per layer).

### 5.5 Build Validation (Jenkins)

OBDX teams already build UI and backend packages with Jenkins pipelines, so the factory reuses them instead of introducing a new build system.

- **Quick local checks** run first on the factory server, with no build tools needed: syntax parsing (tree-sitter), JSON/XML/SQL well-formedness, lint rules from the version pack. These catch most mistakes in seconds.
- **Jenkins build:** the factory commits the generated changes to a temporary SVN branch (for example `branches/factory/<request-id>`) and triggers the workspace's Jenkins job through the Jenkins REST API (`buildWithParameters`, passing the branch path). The job's Subversion checkout uses that parameter in its repository URL.
- **Results:** the factory polls the build status, then reads the console log and JUnit test reports through the API and turns them into structured errors for the fix loop.
- **Per-workspace settings:** Jenkins URL, job names (UI and backend), the parameter name for the branch, and a Jenkins API token stored in the secret store.
- **Requirement on the bank side:** a Jenkins job that accepts a branch parameter and publishes test results. Existing jobs usually need only that one parameter added.
- **Trade-off:** a Jenkins build takes minutes, not seconds, so the fix loop is capped (for example 3 build attempts) and local checks do as much as possible before each build.
- Temporary branches are deleted after the request is delivered or abandoned.
- **If the bank does not allow the factory to commit:** the Jenkins job can instead take the patch file as a file parameter, check out trunk, apply the patch and build. Nothing is committed to the repository.

### 5.6 Version Control (SVN)

OBDX code is kept in Subversion repositories. Developers use TortoiseSVN on Windows, and Jenkins jobs check out from the same SVN server. The factory talks to the SVN server directly with the standard `svn` command-line client; no TortoiseSVN install is needed on the server.

- **Import:** check out (or export) the workspace's trunk or a chosen branch at a known revision. Store the revision number with the index.
- **Incremental updates:** `svn log` / `svn diff` since the last indexed revision gives the changed files to re-index.
- **History:** `svn log` messages are used to link BRDs and change request IDs to the revisions that implemented them (for the evaluation set).
- **Temporary branches:** `svn copy trunk branches/factory/<request-id>` (a cheap server-side copy), then commit the generated changes there for the Jenkins build.
- **Delivery options:**
  1. An SVN branch that developers review and merge with TortoiseSVN as usual.
  2. A unified diff patch file that developers apply with TortoiseSVN "Apply Patch" on their working copy. No repository write access needed for the factory.
- **Access:** a dedicated SVN service account per workspace, read-only by default. Write access, if granted, is limited to `branches/factory/`. Credentials are kept in the secret store.
- **Design:** version control sits behind a small adapter interface, so Git can be added later for banks that use it.

---

## 6. Data and isolation

- **Strict workspace isolation:** separate index namespaces, storage prefixes and database row-level security. Retrieval never crosses workspaces.
- **Factory mode** may optionally run a separate database schema per bank.
- **No cross-bank training** without written consent from each bank.
- **Encryption** at rest and in transit; secrets in a vault.
- **Audit log** of uploads, approvals, generations, exports and model calls.

### Using existing assets

- **Customized codebases:** indexed per workspace; compared across banks (with consent) to derive version pack patterns.
- **BRDs:** where possible, link each BRD to the SVN revisions that implemented it (via change request IDs in commit messages). These pairs form the evaluation set first, and possible fine-tuning data later.
- **Licensing:** confirm that Oracle license terms and each bank's contract allow indexing and using the code this way before ingestion.

---

## 7. Tech stack

| Part | Choice |
|---|---|
| Web UI | React + TypeScript (Next.js), Monaco-based diff viewer |
| Backend API | Python 3.12 + FastAPI |
| Agent workflow | LangGraph or a custom state machine |
| Database / vectors | PostgreSQL + pgvector |
| Background jobs | Celery + Redis (or Temporal) |
| Version control | Subversion (`svn` CLI) behind an adapter interface; Git adapter later |
| Code parsing | tree-sitter |
| Document parsing | Docling or Unstructured |
| Local models | Open-weight coding models (Qwen Coder / DeepSeek Coder class) via vLLM; Ollama for dev |
| Embeddings | Local embedding model (BGE / Nomic class) |
| Build validation | Quick local checks + the bank's existing Jenkins pipelines via the Jenkins REST API |
| Auth | OIDC / SAML / LDAP, role-based access |
| Packaging | Standard installer for Linux servers (services managed by systemd), so OBDX teams need no Docker knowledge. Container images offered optionally for teams that run Docker or Kubernetes |

---

## 8. Quality and evaluation

- **Evaluation set:** 10–20 past BRDs per version with their real implementations.
- **Metrics:**
  - Spec extraction: fields and rules correctly captured.
  - Impact analysis: affected files found (precision/recall vs. the real change).
  - Code: builds on first try / after fix loop; tests pass; reviewer edit effort.
- Run the evaluation on every change to prompts, models or version packs.

---

## 9. Non-functional requirements

- Runs with no internet access (air-gapped bank mode).
- Index a typical customized OBDX codebase in under 1 hour; incremental updates in minutes.
- Spec and plan in minutes; full generation within a working session.
- Hardware guide: at least one or two data-center GPUs for a 30B+ class coding model, or a private model endpoint.

---

## 10. Roadmap

| Phase | Outcome |
|---|---|
| 0: Retrieval proof | Index one bank's 22.x codebase; answer "where is X implemented?" correctly |
| 1: Spec and plan MVP | BRD → structured spec → impact analysis → plan, with review in the web UI |
| 2: Code generation | Full-stack generation for new screens and screen enhancements on 22.x, with build-and-fix loop |
| 3: Multi-version and modes | Add 25.x pack, multiple workspaces, bank-mode installer |
| 4: Improve | Run evaluation on past BRDs; LoRA fine-tuning if scores show the need |

---

## 11. Open questions

- Which bank codebase and BRDs make up the Phase 0/1 pilot?
- For each bank: SVN server URL and repository layout (trunk/branches/tags), and whether the factory may commit to `branches/factory/` or must deliver patches only.
- For the pilot bank: Jenkins version, job names for UI and backend builds, whether jobs already accept a branch parameter, and whether they publish JUnit results.
- Which GPUs or private model endpoints are available for the pilot?
- Licensing confirmation for indexing product and customized code.
