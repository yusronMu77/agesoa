# E2E evidence: issue #42

Feature issue: https://github.com/yusronMu77/agesoa-prototype/issues/42  
Tested commit: `agesoa-prototype@ef4d5bad16c4`, test suite `agesoa-e2e@2099b51f6953`  
Run: 2026-10-13 09:58 +07:00. All test cases below passed; files are the screenshots/videos recorded by Playwright.

| Test case | Test | Project | Result | Duration |
|---|---|---|---|---|
| TC-024 | every entry hashes to the next and the chain verifies @smoke @p0 @TC-024 SCR-042 | api-transparency | passed | 0.2 s |
| TC-024 | a changed entry no longer matches its hash @p0 @TC-024 | api-transparency | passed | 0.1 s |
| TC-024 | editing an entry in the database is detected at that entry @p0 @TC-024 | api-transparency | passed | 0.4 s |
| TC-025 | a decision from another service reaches the hash-chained log @p0 @TC-025 | api-transparency | passed | 1.1 s |
| TC-025 | a redelivered event is logged once (idempotent inbox) @p0 @TC-025 | api-transparency | passed | 0.2 s |
