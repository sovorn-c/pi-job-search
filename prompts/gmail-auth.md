---
description: Authorize read-only Gmail access for automatic application tracking
argument-hint: ""
---
Before using `/gmail-sync`, set `GMAIL_CLIENT_ID` (and optionally `GMAIL_CLIENT_SECRET`) for a Google Desktop OAuth client. Run `job_search_gmail_auth` once. It opens Google's consent screen, requests only `gmail.readonly`, validates the loopback callback with PKCE, and stores the refresh token in the OS keychain when available. It never stores credentials in `.pi-job-search/`. Arguments: $ARGUMENTS
