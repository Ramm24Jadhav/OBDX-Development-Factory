# Handoff: where the work stands

Written at the move from a cloud Claude Code session to a session on the user's Windows laptop (2026-10-28). Branch
`claude/elegant-heisenberg-h0prui`, last commit "Models page: choose the model server and its models while running"
(GitHub build 6, published to the `latest` release).

## The user and how they work

- Builds the factory for OBDX customization work across banks; works on a Windows laptop.
- Asks for one feature at a time ("go ahead with ..."), tries it in the browser and reports what they see.
- Wants it simple to run: no Docker, no manual downloads, everything from the browser.

## Built so far (all on the branch, see `git log`)

Architecture and requirements doc; Spring Boot + JET skeleton; SVN import and code indexing with search; Project
Profile; requirement documents to reviewed specs; screen designer with live JET preview and customer review links;
sign-in (local, LDAP, OIDC, SAML), workspace roles and audit; impact analysis, code generation and delivery as SVN
branch or patch; Jenkins build validation with a fix loop; version pack quick checks, recipes and templates; closing
changes; React Native and React target packs; modernization inventory; publishing behind Oracle HTTP Server; Docker
Compose stack; the download zip with a built-in trial database; demo SVN repositories added automatically; new
workspace from an SVN URL or a local folder with bank and OBDX version detected from the code (OBDX's
`channel/framework/json/about.json` first); self-update from GitHub ("Update now") and start with Windows; Models page
that finds model servers on this computer or another server and switches models without a restart. The UI was
redesigned to the 23 screens in `design/design and implementation plan.docx` (sidebar shell, Home, every work and setup
page, plus Impact Analysis, External Review, Integrations, Prompt Library, Notifications, Account and About); pages use
real data only and leave out what the factory does not record.
Page cleanup (branch `page-cleanup`): Agent Runs and Version Packs are gone (`?ojr=agents` opens Home, `?ojr=packs`
Code › Quick checks). Quick checks now shows each rule's source and file, a Source filter, who turned a rule off and
when, and its findings in the workspace's changes; Code › Settings shows every UI target's reusable components. The
Design System and AI Prompt Library are out of the sidebar and palette but open by address; Administration links to
both. The notification category "Agent Runs" reads "AI work" (stored key `agent` kept).
The OBDX Library (knowledge base, `knowledge` package, V17): Oracle's 22.2 and 25.2 manuals imported per version (the
key PDFs are downloaded to `oracle-docs/` in the main checkout, not in Git), the bank's own documents per workspace,
cited answers in the Library and the AI Assistant panels, notes that users and agents suggest and approvers trust, and
the manuals and approved notes in impact analysis, code generation and requirement drafting. See DEVELOPMENT.md.
The Library page was redesigned (branch `library-redesign`): a plain header with Add documents (a side sheet), one
problem bar for the whole library, then Ask (conversation and Sources rail, composer with the answer-length menu and an
expanded editor), Documents (Sources strip, one table grouped by version, row menus) and Notes (a review queue in one
column with Approve and next). `scripts/check-library.js` checks it.
Its Ask tab was modernised after that (branch `ask-modern`, mock-up `AskModern.dc.html`): a centred question with
example cards when empty; then a thread (question bubble, one folded line on how the answer was found, numbered
citation pills, icon actions) with compact source cards and **Ask next**: the answer's `followUps`, which the model
writes after a marker line in the same answer (`knowledge/FollowUps`, taken off the stream and the stored text).
The **Code** page took in the Knowledge Explorer (branch `code-combined`): one header with the index pill, Check for
new commits and Reindex, one problem bar, and seven tabs (Explore, Search, Map, Business rules, Quick checks, Index,
Settings; Codebase facts came later); one viewer, one search, one AI panel (Ask about the code). The `knowledge` route redirects to Code › Explore;
`scripts/check-code.js` checks the whole page (check-knowledge.js is gone).
The Project Profile page is now Code's **Codebase facts** tab, between Index and Settings (branch `code-facts`): the
same facts, edits, history and reference examples; its warnings feed Code's problem bar; the `profile` route, G P and
the links from Home, Workspaces, Modernization and the Prompt Library open the tab (check-profile.js is
gone, its checks are in check-code.js).
**Models & AI** and **Integrations** were redesigned (branch `admin-redesign`, mock-ups in `.admredesign/project/`):
Models & AI opens on the Writing and Search slots read from the server's settings (one answer to what is in use),
provider rows with a side panel (address, key, Use for writing / Use for search), then Routing & limits, Privacy and
Try a prompt; Usage & Cost and the capability table are gone. Integrations groups everything it connects to (Source
control, Builds with a Set up row per workspace, AI model servers with the same test record as Models & AI, Sign-in,
Updates) with filter chips and a detail of Connection, History and Used by. `services/modelServers.js` is shared.
**Home** and **Workspaces** were redesigned (branch `redesign-home`): Home leads with Needs you (kind chips), then Work in progress by stage with the recorded figures, one Recent card and workspace cards; Workspaces has filter chips, rows with SVN and Jenkins health (`services/connectionHealth.js`, shared with Integrations), a sectioned side sheet and a one-step-per-screen wizard.
**Requirements** was redesigned (branch `redesign-requirements`): stage boxes with counts lead, then chips, compact rows with a ⋯ menu and a New requirement side panel (upload or drop, or describe); the requirement has one header with the stage pill and one next action, a four-stage stepper, one problem bar, six tabs at most (History and the source document moved to a Source and history side panel, Roles into Overview, acceptance and non-functional into Requirements, APIs and hosts into Rules and APIs).
The **Design Studio** (route `studio`) is the one page for screens: the UI Design Studio and the Visual Designer were
merged (`docs/DESIGN-STUDIO-MERGE-PLAN.md`, done on branch `design-studio-merge`). The selected screen has Review and
Edit; Edit is the designer inside the page. The `designer` route redirects, `pageRequests.design(id)` opens a screen in
Edit, and `?ojr=studio&requirement=<id>&screen=<id>` is a real link. Every approve, group approve and reopen asks first
(`services/designActions`). `scripts/check-studio.js` and `scripts/check-designer.js` (which now opens the designer
through the Studio) check it.

## The user's installation

- The Windows download from `https://github.com/Ramm24Jadhav/OBDX-Development-Factory/releases/download/latest/obdx-factory-windows-x64.zip`,
  unzipped to a folder in their user area, started with `start.bat` (works). `install-autostart.bat` was run; the
  desktop shortcut first only opened the browser (fixed in build 5: it now runs `open-factory.bat`, which starts the
  factory if needed; run `install-autostart.bat` again after updating so the shortcut uses it).
- Factory at `http://localhost:8080/`, sign in as `admin` (password set in `settings.properties` before the first start,
  default `Factory-Admin-1`). Data in the `data` folder next to `start.bat` (trial database, working copies, secret key).
- Ollama is installed on the laptop with models (names not yet confirmed).
- They entered a sample prompt on the Requirements page. Without a working model connection it fails; after the model
  is set, "Draft again from document" retries it.

## Next steps

1. Update the factory: "Update now" (banner or About page) to build 6 or later; sign in again after the restart;
   run `install-autostart.bat` once more.
2. Open `http://localhost:8080/` in the built-in browser and check the Models page: Ollama should be listed under
   "On this computer"; choose the chat model (a coder model) and `nomic-embed-text`, "Use these models", then
   "Try a prompt". If Ollama is not found: is it running (`ollama list`, `http://localhost:11434/v1/models`)?
3. Retry the user's requirement ("Draft again from document") and walk them through spec approval, the Design Studio,
   the change plan and generated code. Note what is slow or unclear for them.

## Not yet verified on Windows (tested on Linux only)

`install-autostart.bat`, `open-factory.bat`, the browser opening by itself, "Update now" restart via `start.bat`
(exit code 75), the folder browser and checkout detection on the Workspaces page, the bundled PostgreSQL's pgvector
stand-in on Windows. The trial database itself runs on the user's laptop.

## Open questions and ideas

- Exact format of `about.json` in releases other than 22.2 (the detector reads the first `NN.N` release number in it).
- Sign-ins end when the factory restarts (sessions are in memory).
- Remaining roadmap (only on request): reverse-engineering JET screens into Screen Models, wave planning on the
  inventory, Jenkins Android/iOS builds.
