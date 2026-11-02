# Regression audit after the screen changes (3 Nov 2026)

Code under test: c1880ad. Audit only: no product code was changed. Three auditors each ran their own factory on a copy of the
demo data (two workspaces: bank-b-25 on 25.x, bank-a-22 on 22.x; BRD1-5), with local stand-ins for the AI model (OpenAI
compatible: success, 5xx, connection refused, 429 tokens-per-day, cut-off answers, echoed keys), Jenkins and SVN (hot copies,
svnserve with password, an echoing SVN server). No call went to a real model provider, and 8080, 8081 and the demo SVN were not
touched. Evidence folders: `C:\work\obdx-tmp\audit\e2e`, `...\audit\ui`, `...\audit\trust` (screenshots, JSON, logs, probe scripts).

Result values: PASS (executed, as expected), FAIL (executed, defect), NOT RUN (with why).

## 1. Workflow, end to end (BRD3 on a new workspace `audit-e2e-b25`)

| Step | How | Result | Evidence (audit\e2e) |
|---|---|---|---|
| Create workspace, import, index | UI | PASS: stages create → checkout → index → profile; r8, 46 files | ev\ui-01.txt, shots\01-*.png |
| Upload BRD3 (.docx) | UI | PASS: spec v1, 2 open questions | shots\02-drafted.png |
| Draft spec | stub model | PASS: summary marked AI-drafted, scope "word for word" | shots\02-drafted.png |
| Resolve questions | UI | PASS: spec v4 with decisions | shots\04-*.png |
| Approve spec | UI | PASS | shots\05-approved.png |
| Generate screens | UI (Make screens) | PASS: 2 screens with acceptance criteria | shots\06-screens.png |
| Edit a screen | API (PUT model) | PASS: v2 EDITED | ev\d1-v2.json |
| Approve screens | UI (Approve all + confirm) | PASS | shots\08-*.png |
| Impact plan | UI | PASS: 5 files, 2 risks | shots\09-, 10-*.png |
| Approve plan | API (after a UI Request Changes) | PASS, audited | ev |
| Generate code | stub | PASS (after the quota recovery below) | |
| Inspect diff, edit a file | UI / API | PASS, edit audited | shots\13-*.png |
| Validate | UI | PASS: 4 passed, 1 warning, 0 failed | shots\17-validated.png |
| Build and test | API, Jenkins stand-in (PATCH mode) | PASS: failing build, then passed | shots\18-*.png |
| External review | API link, comment without sign-in; UI pages | PASS | shots\19-, 20-*.png |
| Deliver | UI (Submit for Review + confirm) | PASS: r9 on branches/factory/cr-4d2ebaff, reviewer's edit included | shots\22-delivered.png |

## 2. Failure paths

| Failure | Result | Evidence / defect |
|---|---|---|
| Invalid repository connection (refused host, missing path, wrong password) | PASS: error with Check again, no password in the page, SVN_TEST_FAILED audited | e2e shots\01-invalid-*, 25-*.png |
| Indexing failure (bad password, corrupt working copy, embedding server 503) | PASS: FAILED with reason, previous index kept; embeddings skipped with a note | e2e shots\26-*.png; defect A6 |
| Unsupported OBDX component (oj-select-one on 25.x) | **FAIL** | A1 |
| Missing requirement evidence (FR-099/BR-099 not in the BRD) | PASS: marked Drafted | e2e shots\03-*.png; observation O1 |
| AI provider unavailable (stopped, 503) | PASS: draft, impact, Write again fail cleanly; retry works | e2e shots\23-*.png; defect A7 |
| Model quota exhausted mid-generation (429 after 2 calls) | PASS: written files kept, "3 not written", delivery and patch refused (409), Continue finishes | e2e shots\13-, 14-*.png |
| Validation failure (JS parse, view/view-model mismatch, unclosed tag) | PASS: file FAILED | e2e |
| Build failure (Jenkins FAILURE + JUnit failure) | PASS, but tests shown as Blocked | A3 |
| Reviewer rejection (Request Changes; external comment) | PASS, recorded and audited | e2e shots\12-*.png; A5 |

## 3. Recovery and no silent overwrite

| Check | Result |
|---|---|
| Written files and cut-off part kept; Continue generation resumes | PASS (a file cut off 6 times keeps its part; Continue then refuses it, use Write again: O3) |
| Incomplete plan needs explicit confirmation; stale revision refused | PASS (409 naming what is missing; audited "approved although files may be missing (confirmed)") |
| Approved spec, design and plan cannot be changed without reopening | PASS (all edit paths 409; reopen keeps history; Save Version disabled) |
| Write again keeps the previous version when the model fails | PASS |
| Write again when the new version fails its checks | **FAIL** (A2) |
| Delivery never marked done when the SVN commit fails | PASS (pre-commit hook block: 502, change stays GENERATED) |
| Approving a plan the server itself marked incomplete (via the analyzer) | NOT RUN: the stub could not produce one; confirmation via the API path passed above |

## 4. Routes, permissions, workspace scoping

| Check | Result | Evidence (audit\ui) |
|---|---|---|
| All 26 routes open by URL as admin, no console errors or failed requests | PASS | ui-audit\admin\route-*.png |
| Sidebar 20/20, palette 23/23 | PASS | ui-audit-admin-routes.log |
| Deep links (requirement, change, design, studio, workspace, newRequirement, newWorkspace, codeSearch) | PASS | ui-audit\admin\deeplink-*.png |
| Deep link codeFile ("Open in Code") | **FAIL** (B1) | open-in-code.png |
| Server permissions: analyst, developer, lead, non-member, admin (approve, deliver, import, settings, admin APIs, other workspace's data) | PASS: every forbidden call 403, lead stops at state checks | probes\perm-*.json |
| UI permissions | **PARTIAL FAIL** (B2); Administration only for admins; change, approve, reindex actions gated correctly | aud.*\result-*.json |
| Workspace scoping (no bank-a-22 data while bank-b-25 is selected, for members and admin pages) | PASS; admin's cross-workspace items (Home "Also in", bell, palette) are labelled | switch.json |
| Pages follow a top-bar workspace switch | PASS except Agent Runs (B5) | switch-*.png |
| Pre-redesign routes and API calls still reachable | PASS (all routes and every endpoint the UI called at cd42457 still called) | api-base.txt, api-head.txt |

## 5. Themes, layouts, keyboard, reduced motion

| Check | Result |
|---|---|
| check-responsive: 24 pages at 1440x1000, 1024x768, 768x1024, 390x844 (96 views each), light / dark / reduced motion | PASS: 0 defects in all three runs |
| check-interactions (323 checks, 1440 and 390, also with reduced motion) | PASS: 322; 1 failure is the flaky packs-carousel arrow check, confirmed working by hand |
| Keyboard only: sign in, pick workspace, open requirement (Ctrl K), open change (menu), open and cancel a dialog (focus trapped, Escape, focus returned) | PASS |
| Keyboard: open a requirement row from the list by Tab | NOT RUN to the end (script reload reset the workspace) |

## 6. Provenance, audit trail, secrets, privacy, external review

| Check | Result | Evidence (audit\trust) |
|---|---|---|
| BRD requirement IDs and wording preserved; model-added items marked Drafted | PASS (fresh BRD3: IDs exact; check-requirement-detail 124/124) | check-requirement-detail.out |
| OBDX Library citations from retrieval (title, version, section, pages); invented citation removed and marked unconfirmed | PASS (API); "Open at page N" in the UI NOT RUN | ask*.json |
| Knowledge Explorer AI label | PASS; cited lines not checked against the file (C3) | shots\insight-*.png |
| Modernization facts vs AI; Impact plan evidence | PASS | check-modernization, check-impact |
| Audit trail: users, roles, admin, workspace, SVN/Jenkins settings and tests, requirement/design/plan approvals, review links, delivery, profile, rules, model settings; no tokens in rows | PASS | audit1.json, audit2.json, shots\admin-audit.png |
| Secrets never returned (36 endpoints), Models page, LDAP/OIDC secrets, prompt library, Jenkins errors, review links, sk- keys in errors | PASS | dumps\index.txt |
| SVN password and unprefixed model keys echoed in errors; server log | **FAIL** (C1, C2, C4) | |
| Privacy policy: outside model gets no knowledge context unless FACTORY_KNOWLEDGE_EXTERNAL_MODELS=true; Models page truthful | PASS (inspected what the stub received both ways) | stub\requests*.jsonl, shots\models-privacy-*.png |
| External review: only the shared screen, no team comments, API paths or ids; revoked and expired links refused | PASS (one low leak: custom component html/script, C8) | check-reviews --write 1 |

## Defects

| ID | Severity | Defect | Reproduction | Expected | Actual |
|---|---|---|---|---|---|
| C1 | Medium | SVN password echoed by the server is shown unmasked | Workspace with svnUrl on an SVN server whose error echoes the login (audit\trust\stub\svnecho.js), user + password set; POST svn/test, POST imports | Stored password hidden everywhere | Password in the 502 detail, import message, SVN_TEST_FAILED audit row, integrations activity and factory.log (masking matches patterns, not the stored value) |
| C2 | Medium | Model API key without a known prefix shown in errors | apiKey "AzureKey7c1e…", provider 500 echoing the key; POST api/model/chat, Analyze again | Configured key always masked | Key in the 502 detail and in change messages visible to workspace members |
| C4 | Medium | Server log stack traces carry the provider's raw body incl. the key | As C2, any key | Log redacted | "Caused by: …InternalServerException …" lines contain the key |
| A1 | Medium | Forbidden component does not block or warn at design approval; only a warning in code | 25.x design with oj-select-one; POST designs/{id}/approve | Checks list it; approval warns or blocks | Chip "1 unsupported" but Checks "Ready to approve"; approve 200; code check jet-no-select-one is a WARNING |
| A2 | Medium | Write again replaces a passing file with a failing one, no history | quick-transfer.js PASSED; model returns broken JS; POST regenerate | Previous passing version kept or recoverable | File FAILED, old content gone, not in History or audit |
| A4 | Medium | Change with a file failing its checks delivered without warning | Change with a FAILED file; POST deliver | Warning/confirmation like incomplete delivery | 200, committed r10; dialog only warns about unwritten files |
| A3 | Medium | Failing unit test shown as Blocked | Jenkins FAILURE with a FAILED JUnit case | Unit tests: Failed, with the test | "Blocked: the build did not get as far as a test result"; ESLint line not linked to the file |
| B1 | Medium | "Open in Code" (Knowledge Explorer, Modernization) shows an empty Code search | Knowledge Explorer, select a file, Open in Code | Viewer at the file's lines | Viewer filled but hidden (code.html hides it when there are no search results) |
| B2 | Medium | Requirement actions gated on the wrong permission | As DEVELOPER and ANALYST open Requirement actions | Plan the change for MANAGE_CODE, Make screens for EDIT_DESIGNS | Developer: both disabled; analyst: Plan the change enabled, server then 403 |
| C3 | Medium | Knowledge Explorer lists cited lines outside the file | Model answer citing lines 900-950 of a 16-line file | Out-of-range citations dropped or flagged | Listed with Open in Code |
| B5 | Low-Med | Agent Runs does not follow a top-bar workspace switch (regression) | Open Agent Runs on bank-a-22, switch to bank-b-25 | bank-b-25 runs | Still bank-a-22 until the page is reopened |
| A6 | Low-Med | Corrupt working copy cannot be recovered | Corrupt wc.db; Update code | "Check out again" offered | E155016 every time; only deleting the workspace helps |
| A5 | Low | Request Changes does not hold the plan | Request Changes, then approve-plan on the same revision | Refused until edited or re-analyzed (as the dialog and docs say) | 202 approved |
| A7 | Low | Raw messages without a next step | svn E170013, provider down, provider 5xx, approved-spec refusal | Plain message with what to do | "java.net.ConnectException", provider JSON, "this needs it to be ready" |
| A8 | Low | Audit gaps | Failed delivery; Write again; Figma import on an approved design | Audited; approved check first | Not audited; figma.com called before the approved check |
| B3 | Low | Code page requests /api/sources/local for non-admins (403, console error) | Open Code as analyst | Call skipped for non-admins | 403 |
| B4 | Low | Administration by URL shows the admin UI to non-admins (server refuses); palette offers it | ?ojr=admin as analyst | Plain "administrators only" page; not in palette | Full UI with empty tables, four 403s (same as baseline) |
| C5 | Low | Knowledge notes labelled "Bank document" | Ask with a note in the sources | "Note" | "Bank document" |
| C6 | Low | Privacy refusal shown inside the AI-generated answer block | Outside model, ask in Knowledge Explorer | Shown as a notice | Shown as an answer |
| C7 | Low | MODEL_SETTINGS_CHANGED does not say the key changed | Change the API key | "key changed" in the detail | Not stated |
| C8 | Low | External reviewer receives a custom component's html/script | Share a screen with a custom component | Only rendered preview data | html/script in GET api/review/{token} |
| C9 | Low | Legacy seeded specs: duplicate FR IDs from traceability rows marked word for word | Older BRD specs in the seed | Duplicates flagged | Shown as word for word |

Observations (not defects yet): a Drafted item can be approved without acknowledging it and may carry a made-up reference
(O1); a complete plan leaving a Must requirement uncovered is not flagged at approval (O1b); a change can be started through
the API before screens are approved (O2); a file cut off at the output limit counts as Failed and Continue does not resume it
(O3); the change message keeps saying "1 with problems" until Validate runs (O4); the trial database's first restart after a
hard stop can fail once with "pre-existing shared memory block"; the audit helper script stop.ps1 only stops ui-steps factories.

## Not run

HTTPS SVN (svn:// and file:// were used); Jenkins BRANCH mode; the build-fix round; external approval after changes;
positive-path mutating actions for non-admin roles (checked by code and state checks only, to avoid commits); quota exhaustion
during impact analysis; approving an analyzer-marked incomplete plan; "Open at page N" in the Library UI; one keyboard path
(requirement row by Tab).

## Server fixes (branch audit-server-fixes)

Re-run against a factory of their own (8151) with the stubs; "before" is the audit above.

| ID | Fix | After |
|---|---|---|
| C1, C2 | Secret values the factory holds are masked by value (`common/KnownSecrets`: SVN passwords, Jenkins tokens, model keys, LDAP/OIDC secrets from the settings) in `Messages.redacted`, the SVN, Jenkins and model exceptions, problem details, audit details and import messages | svn/test 502, import message, SVN_TEST_FAILED row, activity: "login svcx:[hidden]"; a 500 echoing an unprefixed key: not in the detail |
| C4 | Every log line, stack traces included, is redacted (`common/RedactedLog`) | neither the SVN password nor the key in factory.log |
| C7 | MODEL_SETTINGS_CHANGED says "API key set / changed / removed" | as stated |
| C8 | Reviewers get no custom component html, css or script (the preview draws a placeholder) | GET api/review/{token} without them |
| A1 | Approving a screen with an element the version pack forbids: 409 "Unsupported components: ..." unless `?unsupported=true` (audited), also Approve all; listed in the designer's Checks. The pack rule jet-no-select-one stays a warning in code: the pack defines it as deprecated, not forbidden | 409, then 200 with "(confirmed)" in the audit |
| A2 | Write again keeps a version that passed its checks when the new one fails them; audited (CHANGE_FILE_WRITTEN_AGAIN) and in the change's history | file PASSED, content kept, the message says why |
| A3 | Every failed JUnit case is recorded ("Test failed: ..."), JavaScript suites matched to the change's test file; "[ERROR] file.js:12: ..." read with its file and line | Unit tests gate Failed with the test; the ESLint line links to the file |
| A4 | Delivering files that fail their checks: 409 "Failing checks: ..." unless `?failedChecks=true` (audited) | 409 naming the files, then r11 with "(confirmed)" |
| A5 | approve-plan refused while changes were requested on the latest revision | 409, then 202 after an edit |
| A6 | `POST .../imports/checkout-again` (MANAGE_CODE) and "Check out again" on the Workspaces sheet; the error says to use it (read-only pristine files are removed on Windows) | E155016 message points to it; check out again succeeds, requirements kept |
| A7 | Plain messages: svn connect, login, path and working copy errors; model server refused or 5xx (the server's sentence, no JSON); the approved spec | as stated |
| A8 | Failed deliveries audited (CHANGE_DELIVERY_FAILED); a Figma import checks approval first | pre-commit hook refusal audited; 409 before any call |
| C9 | Duplicate FR, AC and NFR IDs listed in the requirement's `warnings` (the spec is not changed) | in the API; the UI does not show it yet |
| O1b, O3, O4 | Plan risk for Must requirements no planned file names; a file still cut off at the output limit is kept as cut off (Continue goes on from it); an edit refreshes the change's message | as stated |

Left out: C3 (citations are computed in the UI), O1 and O2 (policy decisions).
