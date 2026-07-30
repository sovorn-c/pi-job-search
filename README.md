# @sovorn/pi-job-search

A Pi-native, local-first job-search assistant. It discovers jobs, ranks fit, drafts grounded application documents, tracks outcomes, prepares interviews, and produces offline reports.

## Install

Install the package through Pi's package manager, then use the included slash commands. The workspace is created under `.pi-job-search/` and is never part of package releases.

```text
/setup
/scrape
/rank
/apply
```

Run `npm run verify:package` to inspect the published resource inventory.

## Commands

- `/setup`, `/reset`: manage the local candidate profile.
- `/scrape`, `/rank`: collect and score public jobs.
- `/gmail-auth`: authorize optional read-only Gmail access once using a Google Desktop OAuth client.
- `/apply`: create draft-only, grounded application documents.
- `/outcome`, `/followup`, `/interview`: track outcomes and prepare responses; no messages are sent.
- `/expand`, `/upskill`, `/html-report`: improve the profile, identify gaps, and render an offline report.
- `/gmail-sync`: reconcile incoming application signals from Gmail after explicit approval. Gmail access is read-only; it never sends, deletes, labels, or archives mail.
- `/add-template`, `/add-portal`: validate custom assets before activation.

## Gmail authorization

Create a Google Cloud Desktop OAuth client, enable Gmail API, and configure the consent screen with the read-only scope. Then set the client ID and authorize once:

```bash
export GMAIL_CLIENT_ID="..."
export GMAIL_CLIENT_SECRET="..." # optional for Desktop clients
pi
# run /gmail-auth
```

The flow uses PKCE and a loopback callback. Refresh tokens are stored outside the project: macOS Keychain when available, otherwise a user-only file under `~/.config/pi-job-search/`. Each `/gmail-sync` run refreshes the short-lived access token automatically.

## Privacy and safety

Profile facts, documents, tracker data, Gmail state, and generated adapters stay in the ignored local workspace. Gmail is optional. Set `GMAIL_CLIENT_ID` (and optionally `GMAIL_CLIENT_SECRET`) once, run `/gmail-auth`, and the browser PKCE flow stores a refresh token in the OS keychain when available. Existing `GMAIL_TOKEN`/`GMAIL_ACCESS_TOKEN` environment tokens remain supported. Gmail offers are recorded as `offer`, not `hired`, and ambiguous matches remain proposals.

Portal adapters use public endpoints only. Auth-walled portals are refused. Robots and terms restrictions are surfaced as personal-use warnings. Live smoke checks are opt-in, low-volume, and never bypass controls.

Custom templates must pass a tokenized, allowlisted dummy compile before activation. Generated portal adapters require a fixture contract and explicit manual smoke evidence. No package lifecycle scripts run on install.

## Attribution

This is an independent clean-room implementation informed by the observable workflow concepts of the MIT-licensed `ai-job-search` project. It does not copy source code or claim source-code identity. See `NOTICE.md` and `LICENSE`.

## Development

```bash
npm ci --ignore-scripts
npm run typecheck
npm test
npm run verify:release
```

Live portal verification is intentionally separate from offline CI and must be recorded with its source, timestamp, result, and no credentials.
