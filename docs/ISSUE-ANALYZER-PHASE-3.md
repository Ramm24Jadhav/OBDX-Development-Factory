# Issue Analyzer: Phase 3 plan

**Built** (see "Issue Analyzer" in `DEVELOPMENT.md`). The real-use test on the 8081 test factory with Groq found and
fixed: Oracle notes and manuals were sent to a chat model outside the bank (now only when the Library's
`KnowledgePolicy` allows it), issue titles were the whole first paragraph (now the first sentence, at most 100
characters), and the SR draft called live checks fix checks and gave their dates in UTC.

Phases 1 and 2 are built (`ISSUE-ANALYZER-PLAN.md`, `ISSUE-ANALYZER-PHASE-2.md`). Phase 3 starts with trying them for
real, then adds three things.

| Part | What it adds | Built on |
|---|---|---|
| 0. Try it for real | the Issues, Library and bank pages in a browser on the 8081 test factory, a real model (Groq) and a demo-bank log; fix what breaks | the 8081 test factory |
| A. Blur customer data | names, account and card numbers blacked out in screenshots, found by a local model | `ModelGateway.local()`, `chatJsonWithImage`, Java 2D |
| B. Notifications | issue events in the bell menu for the person who filed or released an issue and the workspace's leads | the dashboard data `notifications.js` reads |
| C. Live checks | read-only checks of hosts found in the issue: name lookup, connection, certificate | Phase 1 evidence and code items |

One migration, `V42__issue_phase_3.sql`. No new dependencies.

## Decisions

1. Customer data in screenshots is found **automatically, only with a local model** (Ollama on this machine). With a
   cloud model the page keeps asking people to crop, and says the screenshot goes to that server as it is.
2. Notifications go to **the person who filed or released the issue, and the workspace's leads**.
3. Notifications appear **in the bell menu only** (no email).
4. Live checks are allowed only for **hosts found in the issue** (its logs, screenshots and the bank's code), in DEV,
   SIT and UAT; PROD needs a lead.

## 0. Try it for real

On the 8081 test factory (its own jar copy and a copy of the demo SVN, never the install's), once the laptop is free:

- Library: upload an Oracle note (a text file with a demo error), check it is listed as "Oracle support note".
- Issues: file an issue in a demo workspace with a log from the demo bank (`deploy/docker/demo`) and a screenshot;
  run it with a Groq model; check the diagnosis, evidence, code excerpts, Oracle reference, SR draft, fix check,
  question, grouping (file the same error twice), sharing.
- Bank pages: make a link, open it in a new tab (no sign-in), report, follow, release, answer "still failing".
- Fix what breaks, with a test where it can be tested.

## A. Blur customer data

- When screenshots are uploaded (by the team or through a bank link) and the chat model is local
  (`ModelGateway.local()`), the factory first asks it where customer data is: names, account, card, phone and ID
  numbers, email and postal addresses. It answers with boxes (fractions of the width and height).
- The factory draws filled boxes over them (Java 2D, `ImageIO`, PNG and JPEG) and keeps **only the blurred image**;
  the original is not stored. The screenshot shows "Customer data hidden (3 areas)".
- Adding or moving boxes by hand is not part of this phase. If the model misses something, remove the screenshot (a
  new "Remove screenshot" action) and upload a cropped one.
- With a cloud model nothing is detected; the upload area says the screenshot is sent to <server> as it is.
- Boxes are clamped to the image, a little padding is added, and an answer that is not valid JSON blurs nothing and
  says so (the upload still works).

## B. Notifications

- `issue_event` (workspace, issue, kind, text, created_at): FILED (a bank report), BANK_ANSWER (works now / still
  fails), CHECK_DONE (a fix check finished), ANSWERED (a question), GROUPED (an issue joined a group), ANALYZED (a
  diagnosis is ready, or failed).
- `GET /api/workspaces/{id}/issue-events` returns the last 30 days' events the signed-in user should see: all for
  leads, otherwise those of issues they filed or released (`issue.released_by`, new).
- `notifications.js` reads it with the other dashboard parts; each event opens the issue on the Issues page. Read
  state stays in the browser, as for the other notifications.

## C. Live checks

- An issue lists its **check targets**: hosts and ports from URLs in the evidence, and host/port values in the code
  excerpts (`host=`, `url=`, `endpoint`). Nothing can be typed freely.
- **Check** on a target (developers and leads; leads for PROD issues), from the factory server, read-only, with 5 second
  timeouts:
  - name lookup (the addresses it resolves to);
  - connection to the port;
  - for HTTPS or TLS ports, the certificate: subject, issuer, expiry (days left), and whether Java trusts it.
- Refused: loopback and link-local addresses (127.x, ::1, 169.254.x, the cloud metadata address), and ports outside
  1 to 65535.
- Results are kept as fix checks of a new kind (LIVE_OK, LIVE_UNREACHABLE, LIVE_CERTIFICATE) with their details,
  audited, and never shown to the bank. They become evidence for "Analyze again".
- Hosts in a bank's logs may be internal: the check only reports reachability and the certificate, sends no data and
  follows no redirects, and an engineer starts each one.

## Data (V42)

- `issue.released_by`; `issue_file.hidden_areas` (number of blurred areas, null when not checked).
- `issue_event` (id, workspace_id, issue_id, kind, text, created_at), indexed on workspace and time.
- Live checks reuse `issue_check` (new results, details in `evidence`).

## Tests

Unit: box clamping and drawing (a test image, pixels inside a box are black, outside unchanged); the target list from
evidence and code; refused addresses; certificate days left. Integration: events for the filer and a lead but not
another member; a live check against a local test server (TCP and TLS with a self-signed certificate; the test turns
on a test-only setting that allows loopback), a refused loopback target, PROD needing a lead; blurring with a canned
local model.
