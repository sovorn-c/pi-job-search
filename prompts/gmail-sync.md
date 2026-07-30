---
description: Reconcile Gmail application signals without changing Gmail
argument-hint: "[company|since date] [APPROVE|REJECT]"
---
Use `job_search_gmail_sync` with read-only Gmail authorization. If OAuth has not been configured, run `/gmail-auth` first; a manually supplied `GMAIL_TOKEN` or `GMAIL_ACCESS_TOKEN` is also supported. The first run previews actionable signals from fetched full messages with subject/date evidence. Use `APPROVE` for one explicit batch or `REJECT` to preserve the tracker unchanged while marking message IDs processed. Acknowledgements are ignored; offers become `offer`, never `hired`; ambiguous matches remain proposals. Gmail is never modified. Arguments: $ARGUMENTS
