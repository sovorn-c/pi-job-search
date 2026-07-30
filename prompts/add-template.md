---
description: Validate and add a custom document template
argument-hint: "<name> [file path] [APPROVE]"
---
Use `job_search_add_template` with mode `list`, `add`, or `use`. Adding requires explicit `APPROVE`; custom source is kept in ignored local state and must pass the sanitized dummy compile gate before activation. Never replace an existing template implicitly. Arguments: $ARGUMENTS
