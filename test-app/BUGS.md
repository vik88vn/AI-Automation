# BugShop — Intentional Bug Inventory

This file documents the deliberate defects planted in the test app for the QA
agent case study. Each bug is designed to exercise a different agent capability
(form validation, error handling, race conditions, server errors, performance).

| # | Severity | Category | Location | Trigger | Expected by agent |
|---|---------|----------|----------|---------|-------------------|
| 1 | High | Authentication | `POST /api/login` (server.js) and `login.html` | Submit login form with valid email and **empty password** | `test_failed` for "rejects empty password"; bug filed with `selectorAnalysis.found: true` (button works), evidence shows navigation to /dashboard.html instead of validation error |
| 2 | Critical | Error handling | `POST /api/signup` (server.js) | Submit signup with malformed email (e.g. `noatsign`) | 500 server error; `BugReport.evidence.errorType: "TypeError"`; stack trace pointing to `email.split("@")[1].split(".")` |
| 3 | Medium | Race condition | `products.html` (client JS) | Click out-of-stock "Add to cart" within 150ms of page load | Click handler fires successfully on a button that should be disabled; failure context shows `selectorValid: true` but the inventory check is bypassed |
| 4 | High | Server error / validation | `POST /api/admin/products` (server.js) and `admin.html` | Submit new product without selecting a category | 500 instead of 400; `BugReport.evidence.errorType: "TypeError"`; stack trace at `category.toLowerCase()` |
| 5 | Low | Validation gap | `admin.html` (client JS) | Frontend sends empty category to backend instead of validating | Same surface as #4, but the agent should note the frontend lacks the required-field check |
| 6 | Medium | Server error | `GET /api/products?q=…` (server.js) | Search with regex special chars: `[`, `*?`, `(` | 500 SyntaxError; agent's failure context captures the network error event |
| 7 | Low | Performance | `GET /api/dashboard/stats` (server.js) | Visit `/dashboard.html` | Page takes 3-4s to populate stats; agent's `PerformanceMetrics` should flag elevated `actionMs` and `tti` for the navigate step |

## Why these specific bugs

- **#1 (empty password):** Tests the agent's ability to write a *negative* test case (the harder kind — most tools only check the happy path) and reason about what *should* have happened.
- **#2 (signup TypeError):** Tests the failure-context capture path. The error is a real product bug surfaced at the API layer, and the agent's evidence should include the error type + stack trace.
- **#3 (race condition):** Tests whether the agent catches a transient state. Most static analyzers miss this; an interactive agent that probes a freshly-loaded page can.
- **#4 (500 on missing category):** Tests the agent's ability to distinguish *server bugs* from *test bugs*. The selector is valid; the click works; the failure is on the server side. Failure context should reflect that.
- **#5 (frontend validation gap):** Tests cross-layer reasoning — the same root cause has two manifestations. A good agent reports both.
- **#6 (search regex injection):** Tests fuzz-like behavior. Does the agent try special characters in search inputs?
- **#7 (slow dashboard):** Tests the performance metrics feature. Without metrics capture, the slowness is invisible; with it, the agent surfaces a measurable issue.

## How to run

```bash
cd test-app
npm install
npm start
# Visits http://localhost:3100
```
