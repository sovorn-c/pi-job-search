# 🧭 pi-job-search

[![npm version](https://img.shields.io/npm/v/pi-job-search?logo=npm&logoColor=white)](https://www.npmjs.com/package/pi-job-search) [![npm downloads](https://img.shields.io/npm/dm/pi-job-search?logo=npm&logoColor=white)](https://www.npmjs.com/package/pi-job-search) [![Pi package](https://img.shields.io/badge/Pi%20package-pi.dev-7c3aed)](https://pi.dev/packages/pi-job-search) [![License: MIT](https://img.shields.io/badge/license-MIT-22c55e.svg)](./LICENSE)

**A local-first job-search workspace for [Pi](https://pi.dev).** Discover suitable roles, import job descriptions, rank fit, draft grounded applications, prepare for interviews, and track outcomes—without sending applications or email on your behalf.

- **npm:** [npmjs.com/package/pi-job-search](https://www.npmjs.com/package/pi-job-search)
- **Pi catalog:** [pi.dev/packages/pi-job-search](https://pi.dev/packages/pi-job-search)
- **GitHub:** [github.com/sovorn-c/pi-job-search](https://github.com/sovorn-c/pi-job-search)

## Install

Install the public package from inside Pi:

```bash
pi install npm:pi-job-search
```

Restart Pi, or run `/reload` if it is already running. Then initialize your local workspace:

```text
/setup
```

The package stores candidate data, documents, search state, applications, and reports in `.pi-job-search/`. The directory is local workspace state and is added to `.gitignore` during setup.

## The core workflow

```text
/setup → /scrape or /import → /rank → /apply → /outcome → /followup or /interview
```

### 1. Set up your profile

`/setup` builds a versioned profile from CVs, documents, interview answers, or direct user input. Facts retain provenance and inferred claims remain distinguishable from approved facts.

### 2. Discover or import jobs

Automated discovery uses stable public sources:

| Source | Access | Search behavior |
| --- | --- | --- |
| [Himalayas](https://himalayas.app) | Public JSON API | Provider-side keyword, country, timezone, seniority, and employment filters |
| [We Work Remotely](https://weworkremotely.com) | Public RSS | Category feed plus local keyword filtering |
| [Remote OK](https://remoteok.com) | Public JSON feed | Local filtering by title, tags, and location; attribution preserved |

Use `/scrape` with keyword, country, timezone, seniority, employment type, category, remote-only, and result-limit filters. Results are normalized into one shared job format, deduplicated, and saved locally.

For LinkedIn, SEEK, login-walled pages, or any blocked source, use `/import` instead:

- paste the job description;
- provide a `.txt` or `.md` file; or
- provide a public URL for one best-effort request.

URL imports parse public JSON-LD, metadata, and visible content. They report complete, partial, and failed extraction separately. They never automate login, bypass CAPTCHA, evade bot protection, or retry aggressively.

### 3. Rank fit before applying

`/rank` evaluates technical fit, experience, behavioral fit, and career alignment. Work-rights and location gates can veto an otherwise high score. Every recommendation includes its evidence and fit verdict.

### 4. Draft, verify, and track

`/apply` creates draft-only CV, cover-letter, and application-form materials grounded in approved facts. Documents are verified for page count, extractable text, required content, forbidden content, and ATS keywords.

`/outcome` records application progress. `/followup` creates capped, draft-only thank-you and follow-up messages. `/interview` creates stage-specific preparation packs and a one-question-at-a-time mock interview. `/html-report` renders a self-contained offline tracker report.

## Commands

| Command | Purpose |
| --- | --- |
| `/setup` | Create or update the candidate profile |
| `/reset` | Preview and reset profile or document state |
| `/scrape` | Search the enabled public job sources |
| `/import` | Import pasted text, `.txt`/`.md` files, or public URLs |
| `/rank` | Score and gate job fit |
| `/apply` | Draft and verify application materials |
| `/outcome` | Record application outcomes |
| `/followup` | Draft follow-up messages; never sends them |
| `/interview` | Prepare for interviews and run mock questions |
| `/expand` | Propose profile competency expansions with approval |
| `/upskill` | Find hard and preferred skill gaps |
| `/html-report` | Generate an offline application dashboard |
| `/gmail-auth` | Authorize optional read-only Gmail access |
| `/gmail-sync` | Propose outcome updates from Gmail messages |
| `/add-template` | Add a compile-validated document template |
| `/add-portal` | Investigate and scaffold a fixture-verified portal |

## Safety and privacy

- **No auto-submit:** applications are drafts and require user review.
- **No email sending:** follow-ups are drafts only.
- **Read-only Gmail:** sync can list and read messages but cannot send, delete, label, archive, or modify mail.
- **Untrusted job text:** descriptions and application instructions are treated as data, never as Pi commands.
- **Bounded source access:** public endpoints only, with timeouts, retries where appropriate, attribution, and isolated failures.
- **Local-first state:** profile, documents, tracker data, Gmail state, and generated artifacts stay in the ignored `.pi-job-search/` workspace.

Pi packages execute code with the permissions of the user running Pi. Review the source before installing any third-party package.

## Gmail integration

Gmail is optional. Create a Google Cloud Desktop OAuth client with the read-only Gmail scope, then configure:

```bash
export GMAIL_CLIENT_ID="..."
export GMAIL_CLIENT_SECRET="..." # optional for Desktop clients
```

Run `/gmail-auth` once. PKCE authorization uses a loopback callback, and the refresh token is stored outside the project in macOS Keychain when available, or a user-only file under `~/.config/pi-job-search/`.

## For contributors

```bash
git clone https://github.com/sovorn-c/pi-job-search.git
cd pi-job-search
npm ci --ignore-scripts
npm run typecheck
npm test
npm run verify:release
```

To test the local package without publishing:

```bash
pi -e .
```

## Attribution and license

MIT licensed. This is an independent clean-room implementation informed by the observable workflow concepts and documentation of the MIT-licensed [`ai-job-search`](https://github.com/MadsLorentzen/ai-job-search) project. No source code is copied and no source-code identity is claimed. See [NOTICE.md](./NOTICE.md).
