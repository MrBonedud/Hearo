---
name: Concurrent route integration
description: Behavioral checks must run again when concurrent route edits are integrated.
---

After concurrent changes to shared HTTP routes are integrated, rerun focused HTTP behavioral checks on the integrated code, not just a type check or tests from the pre-integration version.

**Why:** A completion-time integration silently duplicated evaluation handlers and changed preparation/legacy handlers while preserving valid TypeScript. Earlier source-flow tests passed on the isolated version, but an earlier duplicate then intercepted evaluations before the checker and budget logic.

**How to apply:** Confirm each public route has one intended owner, preparation accepts its smaller payload, and evaluation reaches the grounded checker after budget reservation. Stub provider transport for this check so verification does not incur provider costs.
