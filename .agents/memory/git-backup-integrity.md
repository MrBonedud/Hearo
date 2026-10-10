---
name: Git backup integrity
description: Protect prepared Git commits across approval pauses and prevent parent-repository fallback.
---

Bundle prepared integration commits before pausing for approval. Preserving the source histories alone does not preserve a newly created merge commit's exact metadata and hash.

**Why:** An isolated checkout lost its nested Git metadata between turns. Its source histories and file snapshot survived, but the prepared merge commit did not. Git commands run with only `-C` then silently discovered the parent development repository.

**How to apply:** Use a verified portable bundle for both the original refs and the prepared review commit. Assert the intended repository location, and use an explicit Git directory for publication operations rather than relying on discovery inside a nested checkout. If the prepared hash changes, explain the change and obtain approval for the replacement before pushing.
