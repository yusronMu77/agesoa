# Security policy

AGESOA is a prototype built for the AI Builder Cup 2026. The deployed `demo` environment runs with
`demo_mode` on: fictional organisations, synthetic audit scenarios and demo sign-in accounts. Do not send real
personal data to it.

## Reporting a vulnerability

Please do not open a public issue for a security problem. Use GitHub's private vulnerability reporting instead:
**Security → Report a vulnerability** on this repository. We aim to answer within 7 days.

Useful details: the affected service or app, the steps to reproduce, and the impact you expect.

## Scope

- In scope: the code in this repository and the `demo` environment it deploys.
- Out of scope: denial-of-service tests, social engineering, and third-party services (Google Cloud, Firebase).

Secrets are never stored in this repository: services read them from Secret Manager, and deploys use Workload
Identity Federation without service-account keys.
