---
name: Frontend test execution
description: Pitfalls in running bundled TypeScript and React server-render tests in the workspace.
---

Bundled React server-render tests need a CommonJS-compatible Node bundle, and multiple entry points can produce nested output directories.

**Why:** An ESM bundle of React DOM server failed on its dynamic Node built-in requires. A flat output glob also produced a zero-test success because the actual tests were nested.

**How to apply:** Use a CommonJS bundle with an explicit CommonJS extension when bundling server-render dependencies. Enumerate actual test output files and require a positive expected test count; a successful command that ran zero tests is not verification.

Full-workspace typecheck stops at the first failing package, so known mockup-sandbox Vite type conflicts can hide errors in later packages, including merged API test files.

**Why:** A merged allowance test file contained undefined references and stray lines that the aggregate typecheck never reached.

**How to apply:** Typecheck each package separately after merges. Run bundled API tests with production logging (the bundled pretty-logger transport cannot resolve) and the original approved PDF path so its upload tests do not skip; run study-live script tests from the repository root.
