# Security Policy

SiteFoundry handles SSH credentials and OAuth tokens for third-party servers
and ad accounts. The non-negotiable rules from the build spec (§1, §4, §13):

- All secrets encrypted at rest with AES-256-GCM envelope encryption; the DEK
  is wrapped by a KMS master key and never stored in the database.
- No API endpoint ever returns ciphertext, plaintext secrets, or OAuth tokens
  — only safe fingerprints.
- Deploy logs (`deploy_events.command_summary`) are sanitized before write.
- Postgres Row-Level Security enforces tenant isolation on every table.
- Each deployed site runs under its own isolated OS user; SSH host keys are
  pinned on first connect.
- Rate limits on all public endpoints; consented lead capture only, with IPs
  stored as salted hashes.

## Reporting a vulnerability

Report privately to the repository owner. Do not open public issues for
security problems.
