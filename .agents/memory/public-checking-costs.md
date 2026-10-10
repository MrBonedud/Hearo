---
name: Public checking cost policy
description: Why daily allowances count attempts and what anonymous limits can promise.
---

Keep the public daily allowance conservative: failed or interrupted paid attempts
must consume it. Do not describe a request-count allowance as an exact money cap.

**Why:** A timeout or lost response does not prove that the provider did not bill
the request. Falling back to another checker can also incur a second charge.

**How to apply:** Reassess the allowance when changing provider count, model
pricing, token bounds or retry behavior. Do not refund ambiguous failures just to
make the learner-facing allowance appear more generous.

An anonymous browser-session limit is a fairness measure, not a per-person
entitlement; keep a shared overall ceiling even if stronger identity is added.

**Why:** Public learners have no authenticated identity, so clearing browser
cookies can obtain another session. Only the shared ceiling bounds total usage.

**How to apply:** Explain that limitation honestly, and do not claim that signing
a cookie makes anonymous sessions resistant to recreation.

Learner-facing allowance reads should expose only the requesting browser's count
and whether the shared service can accept checks, not shared usage totals.

**Why:** A shared counter includes other learners' activity; it is not this
browser's allowance or a guarantee that its remaining checks can be spent.

**How to apply:** Keep session balance distinct from shared-service availability.
Do not accept a client-supplied session identifier for allowance reads.
