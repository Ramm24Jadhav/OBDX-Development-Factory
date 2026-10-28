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
that finds model servers on this computer or another server and switches models without a restart.

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
3. Retry the user's requirement ("Draft again from document") and walk them through spec approval, the designer,
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
