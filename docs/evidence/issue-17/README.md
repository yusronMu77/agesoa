# E2E evidence: issue #17

Feature issue: https://github.com/yusronMu77/agesoa-prototype/issues/17  
Tested commit: `agesoa-prototype@a1809c00bfce`, test suite `agesoa-e2e@2099b51f6953`  
Run: 2026-10-13 07:45 +07:00. All test cases below passed; files are the screenshots/videos recorded by Playwright.

| Test case | Test | Project | Result | Duration |
|---|---|---|---|---|
| TC-025 | a decision from another service reaches the hash-chained log @p0 @TC-025 | api-transparency | passed | 1 s |
| TC-025 | a redelivered event is logged once (idempotent inbox) @p0 @TC-025 | api-transparency | passed | 0.1 s |
| TC-030 | a decision published through the outbox is valid against its contract @smoke @p0 @TC-030 | api-transparency | passed | 0.6 s |
| TC-030 | an event that breaks its contract is rejected and not logged @p0 @TC-030 | api-transparency | passed | 0 s |
