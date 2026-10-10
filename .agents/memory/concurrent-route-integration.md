---
name: Concurrent route integration
description: Behavioral checks must run again when concurrent route edits are integrated.
---

After concurrent changes to shared HTTP routes are integrated, rerun focused HTTP behavioral checks on the integrated code, not just a type check or tests from the pre-integration version.

**Why:** Type-correct concurrent route changes can alter handler ordering and validation contracts; isolated checks do not establish that the integrated request reaches budget enforcement and the checker.

**How to apply:** Confirm each public route has one intended owner, preparation accepts its smaller payload, and evaluation reaches the grounded checker after budget reservation. Stub provider transport for this check so verification does not incur provider costs.
