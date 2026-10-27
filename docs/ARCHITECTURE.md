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
- Deploying to bank environments automatically. Output is a Git branch or patch for normal review.
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
   [6] Deliver                ------>  Git branch / patch + change summary  (human review)
```

### Step details

1. **Ingest and understand.** Parse the document (Word, PDF, text, including tables). Extract a structured spec: screens, fields (name, type, validation, mandatory), actions, business rules, roles/entitlements, APIs, host interactions, messages. Flag gaps and ambiguities as questions for the analyst.
2. **Impact analysis.** Search the workspace's code index to find related screens, services and adapters. Decide whether each requirement is a new component or an extension. List affected files with reasons.
3. **Plan.** Produce an ordered plan by layer, with the files to create or modify and the pattern from the version pack each one follows. A reviewer approves or edits the plan before any code is generated.
4. **Generate.** Generate code layer by layer, each step grounded in retrieved code from the same codebase and the version pack.
5. **Validate and fix.** Apply changes in an isolated sandbox copy of the codebase. Run build, lint and unit tests. Feed failures back to the model for a bounded number of retries. Report anything still failing.
6. **Deliver.** Produce a Git branch or patch, a change summary, the spec-to-code traceability, and a test checklist.

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
| Document Ingest  | Code Indexer     | Agent Pipeline   | Build Sandbox    |
| parse BRD/FSD    | per workspace:   | spec, impact,    | per-workspace    |
| extract spec     | chunks, symbols, | plan, generate,  | container image: |
|                  | dependency graph,| validate, fix    | build, lint,     |
|                  | embeddings       |                  | tests            |
+------------------+------------------+------------------+------------------+
| Model Gateway (OpenAI-compatible)        | Version Packs (22.x, 25.x)     |
| vLLM / Ollama / private cloud endpoints  | patterns, extension points,    |
| routing per workspace and per task       | build steps, templates         |
+------------------------------------------+--------------------------------+
| PostgreSQL + pgvector | Object storage (docs, artifacts) | Git (bank repos)|
+---------------------------------------------------------------------------+
```

### 5.1 Model Gateway

- Single internal interface using the OpenAI-compatible chat/completions and embeddings API.
- Backends: local (vLLM, Ollama) or privately hosted (for example Azure OpenAI in a private network, AWS Bedrock, OCI Generative AI).
- Per-workspace settings: allowed endpoints (a bank can require "on-prem only"), model per task (planning, code generation, summarizing, embeddings).
- Logs every call (prompt size, model, latency, workspace) for audit and cost tracking. Prompt content logging is configurable.

### 5.2 Code Indexer

- Imports a workspace's codebase from Git.
- Parses Java, JavaScript, HTML, JSON, SQL and properties/resource files with tree-sitter into meaningful chunks (classes, methods, components, view models, templates).
- Builds a dependency graph: screen → view model → REST endpoint → service → adapter → DB objects.
- Stores embeddings plus keyword search; retrieval combines both with graph expansion.
- Tags every chunk with workspace, OBDX version and whether it is product code or bank customization.
- Re-indexes incrementally on new commits.

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

### 5.5 Build Sandbox

- One container image per workspace with that bank's build toolchain (JDK, build tool, Node toolchain for the UI).
- Runs on a disposable copy of the repo; no network access except approved internal artifact repositories.
- Returns structured results (errors, test failures) to the pipeline.

---

## 6. Data and isolation

- **Strict workspace isolation:** separate index namespaces, storage prefixes and database row-level security. Retrieval never crosses workspaces.
- **Factory mode** may optionally run a separate database schema per bank.
- **No cross-bank training** without written consent from each bank.
- **Encryption** at rest and in transit; secrets in a vault.
- **Audit log** of uploads, approvals, generations, exports and model calls.

### Using existing assets

- **Customized codebases:** indexed per workspace; compared across banks (with consent) to derive version pack patterns.
- **BRDs:** where possible, link each BRD to the commits that implemented it. These pairs form the evaluation set first, and possible fine-tuning data later.
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
| Code parsing | tree-sitter |
| Document parsing | Docling or Unstructured |
| Local models | Open-weight coding models (Qwen Coder / DeepSeek Coder class) via vLLM; Ollama for dev |
| Embeddings | Local embedding model (BGE / Nomic class) |
| Sandbox | Docker (rootless), per-workspace images |
| Auth | OIDC / SAML / LDAP, role-based access |
| Packaging | Docker Compose for dev and small installs; Helm chart for Kubernetes |

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
- Which Git hosting do banks use (affects import and export)?
- Which GPUs or private model endpoints are available for the pilot?
- Licensing confirmation for indexing product and customized code.
