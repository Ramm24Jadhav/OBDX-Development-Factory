# OBDX Development Factory: guide for Claude Code sessions

A web tool that turns requirements (prompts, BRDs, FSDs) into code for banks' existing Oracle Banking Digital
Experience (OBDX 22.x and 25.x) codebases, with local or privately hosted AI models. Read `docs/HANDOFF.md` first for
where the work stands, then `docs/ARCHITECTURE.md` (what and why) and `docs/DEVELOPMENT.md` (how to build, run,
configure; every setting and REST endpoint).

## Layout

- `factory-ui/`: Oracle JET 21 (Knockout) UI. Pages are `src/js/views/<page>.html` + `src/js/viewModels/<page>.js`;
  shared services in `src/js/services/`; styles in `src/css/app.css` (the build serves `app.css`).
- `factory-server/`: Spring Boot 4 / Java 21 server, one package per feature under `com.obdx.factory` (workspace,
  importing, indexing, profile, requirements, design, change, pack, target, modernization, source, model, update,
  trial, auth, svn, jenkins). Flyway migrations in `src/main/resources/db/migration` (V1..V15; add V16 next).
- `target-packs/`: React Native and React target packs (rules, templates, starter projects).
- `deploy/`: systemd unit and env template, `ohs/` (Oracle HTTP Server), `docker/` (compose stack, demo code),
  `bundle/` (the Windows/Linux download: start scripts, settings, README).
- `.github/workflows/build.yml`: builds and tests every push, publishes the downloads and the `latest` release that
  installed factories update from.

## Build and test

```bash
mvn clean verify                                   # UI + server + tests; Node.js is downloaded by the build
FACTORY_TEST_DB_URL=jdbc:postgresql://localhost:5432/factory_test mvn clean verify   # also the database integration tests
```

Integration tests need PostgreSQL with pgvector (user/password `factory`/`factory`, or FACTORY_TEST_DB_USER/PASSWORD)
and the svn tools. Run from the repository root (running Maven inside `factory-server/` cannot find `factory-ui`).
All 115 tests pass at the last commit.

## Conventions

- Match the surrounding code: comment density, naming, records for DTOs, plain SQL with JdbcTemplate where columns are
  PostgreSQL-specific, Jackson 3 (`tools.jackson`).
- User-facing text is plain, short English; errors say what to do next.
- Never add a model identifier to commits, code or docs.
- Batch files keep Windows line endings (`.gitattributes`); `build-bundle.sh` converts the bundle's Windows files.

## Known pitfalls

- `.gitignore`/`.dockerignore` must not ignore `target/` everywhere: the Java package `com.obdx.factory.target` is source.
- JET: an `oj-button` keeps the label it was first rendered with (show different buttons with `oj-bind-if` instead of
  changing the text); JET binding expressions cannot use `new` (compute in the view model); a floating label hides
  `placeholder`.
- The embedded trial database refuses to run as root on Linux.
- Startup `ApplicationReadyEvent` listeners that start imports must run after `ImportService.failInterruptedJobs`.
