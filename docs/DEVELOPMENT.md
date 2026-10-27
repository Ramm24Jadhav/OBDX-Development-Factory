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
- `security/`: encryption of stored secrets such as SVN passwords.
- `model/`: the model gateway. `ModelGateway` is the only way the factory calls AI models; `OpenAiCompatibleModelGateway` works with Ollama, vLLM and private OpenAI-compatible endpoints.
- `common/`: shared exceptions and the error handler that returns problem details to the UI.

Database changes are Flyway scripts in `factory-server/src/main/resources/db/migration/` (`V2__...sql`, `V3__...sql`, and so on). Never edit a script that has already run; add a new one.

## Prerequisites

- JDK 21 and Maven 3.9+
- PostgreSQL 14+ with the pgvector extension
- The Subversion command-line client (`svn`) on the factory server, and network access from it to the banks' SVN servers. On Linux: `apt install subversion` or `dnf install subversion`.
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
| `GET /api/workspaces` | List workspaces |
| `POST /api/workspaces` | Create a workspace (`name`, `bankName`, `obdxVersion` = `22.x` or `25.x`, optional `svnUrl`) |
| `GET /api/workspaces/{id}` | Get one workspace |
| `DELETE /api/workspaces/{id}` | Delete a workspace, its index and its working copy |
| `PUT /api/workspaces/{id}/svn` | Set SVN URL, username and password (`svnPassword`: omit or null to keep, empty to remove) |
| `POST /api/workspaces/{id}/svn/test` | Check the SVN connection; returns the latest revision |
| `POST /api/workspaces/{id}/imports` | Start an import (check out or update, then index) |
| `GET /api/workspaces/{id}/imports` | Recent import jobs with progress |
| `GET /api/workspaces/{id}/index` | Indexed revision and file/piece counts |
| `GET /api/workspaces/{id}/search?q=...` | Search the workspace's code |
| `GET /api/workspaces/{id}/profile` | The Project Profile with detected and confirmed/corrected values, and warnings |
| `POST /api/workspaces/{id}/profile/refresh` | Scan the working copy again |
| `PUT /api/workspaces/{id}/profile/facts/{key}` | Confirm or correct a fact (`value`) |
| `DELETE /api/workspaces/{id}/profile/facts/{key}` | Go back to the detected value |
| `GET /api/model/status` | Show the configured model endpoint and models |
| `POST /api/model/chat` | Send a test prompt (`prompt`) |
| `POST /api/model/embed` | Embed a test text (`text`); returns the vector size |
| `GET /actuator/health` | Health check |

Errors are returned as problem details (`status`, `title`, `detail`).

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

Login and roles (Spring Security), document ingestion, the screen designer, the agent pipeline and Jenkins build validation. See the roadmap in [ARCHITECTURE.md](ARCHITECTURE.md).
