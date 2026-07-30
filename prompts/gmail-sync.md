---
description: Propose Gmail application signals without changing local state
argument-hint: "[company|since date] [APPROVE|REJECT]"
---
Use `job_search_gmail_sync` with read-only Gmail authorization. The first run previews actionable signals from fetched full messages with subject/date evidence. Use `APPROVE` for one explicit batch or `REJECT` to preserve the tracker unchanged while marking message IDs processed. Acknowledgements are ignored; offers become `offer`, never `hired`; ambiguous matches remain proposals. Gmail is never modified. Arguments: $ARGUMENTS
