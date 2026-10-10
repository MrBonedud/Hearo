---
name: Owner checking policy
description: Trusted operations controls and the semantics of daily checking-limit changes.
---

Keep daily checking policy owner-controlled through trusted database operations,
not through learner-supplied fields. A trusted terminal command is appropriate
while the product has no authenticated owner administration area.

**Why:** Public learners are anonymous; adding an unprotected settings endpoint
would let them bypass the shared cost ceiling.

**How to apply:** Any future owner UI must enforce server-side owner authorization.
Policy changes must serialize with reservations across all instances. Lowering
limits preserves today's usage and does not cancel already-reserved calls;
raising limits grants headroom only. Missing policy must fail closed rather than
silently restoring defaults.
