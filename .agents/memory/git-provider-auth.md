---
name: Git provider authentication
description: Git transport authentication is separate from integration health and collaborator connection identity.
---

An active or healthy GitHub integration does not prove that the Git provider credentials used by a push are accepted. A successful public clone/read also does not prove authenticated write access.

**Why:** The Git provider was reported active and OAuth health was reported healthy, while GitHub rejected the actual Git push credentials. The connection-card flows were unavailable for that source-control connection.

**How to apply:** Verify actual remote outcomes before claiming a push succeeded. When Git transport rejects authentication, consult current Replit documentation for Git Providers authorization rather than replacing origin, reading stored tokens, or repeatedly trying an unavailable connector-card flow. Resolve connection metadata in the current collaborator's context; do not reuse another collaborator's connection identifiers.
