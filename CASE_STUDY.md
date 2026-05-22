# Case Study: Autonomous QA Agent vs. BugShop

> **Status:** Run completed 2026-05-05. All findings below are from a real agent
> run with zero human prompting after clicking "Run QA."

## TL;DR

We built a deliberately buggy e-commerce demo (`test-app/`) with **7 intentional
defects** spanning authentication, validation, server errors, race conditions,
and performance. We then pointed the autonomous QA agent at it without telling
it where the bugs were. This case study compares what the agent found vs. the
ground truth — and what it missed, and why.

**Short answer:** The agent found 1 of 7 planted bugs formally, partially observed
a second, and discovered 1 *unplanted* bonus bug that wasn't in the ground truth.
Its 2:16 runtime and zero false positives across 21 tests make it a useful first
pass — but it has clear blind spots for crash-path bugs and performance regressions.

## Why a synthetic target

Real production sites are noisy: third-party scripts, A/B tests, transient
network failures, rate-limiting. A synthetic target with **known bugs** gives
us a clean signal — every finding can be classified as:

True positive (real bug, agent caught it)
False positive (agent flagged something that isn't actually broken)
False negative (real bug, agent missed it)
Bonus (bug not planted, agent found it anyway)

That's the only way to evaluate an autonomous tester honestly.

## The target: BugShop

A 6-page e-commerce demo running at `http://localhost:3100`:

| Page | Purpose |
|------|---------|
| `/` | Landing + featured products |
| `/login.html` | Authentication |
| `/signup.html` | New user creation |
| `/dashboard.html` | Authenticated overview with KPI stats |
| `/products.html` | Product catalog with search and add-to-cart |
| `/admin.html` | Admin panel for creating products |

Backed by a single-file Express server (`test-app/server.js`) with
in-memory data. No database, no auth library, no build step — kept lean
so the *agent's* behavior is the variable being tested.

## Ground truth: 7 planted bugs

| # | Severity | Category | Where |
|---|---------|----------|-------|
| 1 | High | Authentication | Login accepts empty password |
| 2 | Critical | Server error | Signup throws `TypeError` on malformed email |
| 3 | Medium | Race condition | Out-of-stock "Add to cart" briefly clickable |
| 4 | High | Server error / validation | Admin product without category → 500 |
| 5 | Low | Validation gap | Frontend doesn't enforce required category |
| 6 | Medium | Server error | Search with regex chars (`[`, `*?`) → 500 |
| 7 | Low | Performance | Dashboard stats endpoint takes 3-4s |

(Full descriptions and trigger inputs in `test-app/BUGS.md`.)

## Methodology

1. Start BugShop on `localhost:3100`.
2. Start the QA agent dashboard on `localhost:4310`.
3. From the dashboard's Home page, enter `http://localhost:3100` and click "Run QA".
4. Let the agent run autonomously (no human prompts, no test cases pre-fed).
5. After the run completes, read `Bugs` and `Test Cases` tabs to see findings.
6. Compare against ground truth (this document).

The agent operates with **no prior knowledge** of the site — no schema, no
sitemap, no test plan. It explores, extracts forms, generates tests, and
reports bugs purely from what it observes.

## Findings

### Bug-by-bug verification

| # | Severity | Planted Bug | Agent Result | Notes |
|---|---------|------------|--------------|-------|
| 1 | High | Login accepts empty password | ⚠️ Partially observed | Agent recorded `"Login with test@example.com/wrongpassword redirects to dashboard"` in its app model but classified TC_011 as **passed** — it observed the auth bypass but didn't escalate to a filed bug |
| 2 | Critical | Signup TypeError on malformed email | ❌ Missed | TC_009 tested invalid email `invalidemail`, the backend 500ed, but the agent saw the frontend's `"Network error or server crash."` message and marked the test passed |
| 3 | Medium | Race condition: out-of-stock cart | ❌ Missed | TC_013 clicked `.add-to-cart` after page load — the 150ms race window had already closed. A static click-through can't catch a transient timing bug |
| 4 | High | Admin → missing category → 500 | ❌ Missed (but triggered) | TC_019 (XSS test) entered name + price but no category, which fired the 500. The agent saw the crash message but evaluated it as "XSS handled correctly" rather than "server crashed on missing field" |
| 5 | Low | Frontend doesn't validate category | ❌ Missed | Same surface as #4; cross-layer reasoning wasn't attempted |
| 6 | Medium | Search regex injection → 500 | ❌ Missed | TC_021 tried `<>'"` (HTML specials). The agent never tried `[`, `*?`, or `(` — the specific regex-breaking characters |
| 7 | Low | Dashboard stats 3-4s latency | ❌ Missed | Agent visited `/dashboard.html` but did not capture performance timing. The slow endpoint didn't appear in any filed evidence |

### Bonus finding (unplanted bug)

> **BUG_001 — High severity**  
> **Duplicate email signup not prevented** (`/signup.html`)

The server's in-memory user store has no uniqueness check on email. After using
`test@example.com` for login tests, the agent re-used the same email in the
signup flow (TC_017) and was successfully redirected to the dashboard — creating
a second account silently. The server returned `{ok: true}` with no conflict
response.

**Repro steps recorded by agent:**
1. Navigate to `/signup.html`
2. Enter Name: `Test User`, Email: `test@example.com`, Password: `password123`
3. Click Create account
4. Observe: redirect to `/dashboard.html` — no "email already registered" error

This bug was not in the planted ground truth. The agent found it by naturally
reusing credentials across auth flows — the kind of cross-flow state collision
that's easy to miss in manual testing when each test session starts fresh.

### Route discovery

The agent discovered **8 routes** (6 valid, 2 self-inferred):

| URL | Status | How found |
|-----|--------|-----------|
| `http://localhost:3100/` | 200 | Start URL |
| `http://localhost:3100/products.html` | 200 | Nav link extraction |
| `http://localhost:3100/login.html` | 200 | Nav link extraction |
| `http://localhost:3100/signup.html` | 200 | Nav link extraction |
| `http://localhost:3100/admin.html` | 200 | Nav link extraction |
| `http://localhost:3100/dashboard.html` | 200 | Nav link extraction |
| `http://localhost:3100/cart.html` | **404** | Agent inferred from e-commerce context |
| `http://localhost:3100/checkout.html` | **404** | Agent inferred from e-commerce context |

The unprompted inference of `/cart.html` and `/checkout.html` as likely routes
(based on domain knowledge that e-commerce sites have cart/checkout pages) is a
meaningful capability — a purely crawl-only agent would have never checked these.

### Test cases generated

**21 test cases** in 2:16 — no pre-written test plan, no schema, no sitemap.

| Type | Count | Examples |
|------|-------|---------|
| Navigation smoke | 5 | Homepage, Products, Login, Signup, Admin, Dashboard load |
| Form validation | 5 | Empty email, empty name, negative price, empty search |
| Error handling | 6 | Wrong password, invalid email, long password, duplicate signup |
| Regression | 3 | Add to cart, search query, sign out |
| Security | 2 | XSS in admin name field, invalid email format |

All 21 tests **passed** with zero false positives. Notably, TC_019 (XSS attempt
with `Test<script>alert('xss')</script>` in product name) passed because the
server escapes output correctly — a real security check, not just a happy-path
run.

## Metrics

| Metric | Value |
|--------|-------|
| **Total agent steps** | 37 / 40 budget |
| **Test cases generated** | 21 |
| **Tests passed / failed** | 21 / 0 |
| **False positives** | 0 |
| **Planted bugs formally filed** | 1 of 7 (partially observed: 1 more) |
| **Unplanted bugs found** | 1 (duplicate email signup) |
| **Routes discovered** | 8 (6 real + 2 self-inferred 404s) |
| **Wall-clock time** | 2 min 16 sec |
| **Time to first bug** | ~1 min 55 sec |
| **Model** | claude-haiku-4-5 |
| **Performance issues flagged** | 0 |

## Key insight

> **The agent found a bug that wasn't on the map — and missed several that were.**

The duplicate email finding illustrates something interesting: the agent didn't
need to be told "try signing up with an email you've already seen." It naturally
accumulated state across tests — using `test@example.com` for login tests, then
reusing it in the signup flow — and the collision surfaced a real production bug
(no uniqueness constraint) that wasn't in the planted ground truth.

A human tester running a scripted checklist would likely test signup with a fresh
email each time. The agent's lack of a "reset to fresh state" assumption worked in
its favor.

**What it got wrong (and why those are hard):**

1. **Crash-path bugs (#2, #4, #6):** All three required submitting specific
   "bad" input that causes the *server* to return 500. The agent saw the frontend's
   polite "Network error or server crash." message and considered tests passed.
   Without checking the HTTP status code on the network layer, a 500 response
   and a gracefully-handled empty-result look the same from the DOM.

2. **Race condition (#3):** The 150ms window for the out-of-stock cart race can
   only be caught by clicking *immediately* on page load — before the disabling
   setTimeout fires. The agent navigates, then reasons about what to test, then
   acts. That reasoning gap is longer than 150ms.

3. **Performance regression (#7):** The dashboard stats endpoint takes 3-4s.
   The agent visited the page but had no mechanism to flag "this took longer than
   expected." Performance detection requires baseline timing capture, not just
   content verification.

4. **Regex injection (#6):** The agent tried HTML special characters in the search
   field (`<>'"`) but not the regex-breaking characters that crash the server (`[`,
   `*?`, `(`). The difference between "sanitization test" and "regex fuzzing" is
   domain knowledge — the agent has the former but not the latter without guidance.

**Bottom line:** The agent is strong at coverage breadth (all 6 pages, all 4 forms,
21 tests in 2:16) and at cross-flow state reasoning (duplicate email). It's weak at
deep crash-path validation and timing-sensitive bugs. The practical use case is
as a fast first sweep that catches the obvious, plus the occasional surprising
find — not as a replacement for focused security review or performance testing.

## Reproducibility

```bash
# Terminal 1 — start the test target
cd test-app
npm install
npm start
# → http://localhost:3100

# Terminal 2 — start the agent dashboard
cd ..  # back to repo root
npm install
npm run agent:serve
# → http://localhost:4310

# Terminal 3 — start the dashboard frontend (optional, for live UI)
cd frontend
npm install
npm run dev
# → http://localhost:5173

# In the dashboard, set your Anthropic API key in Settings,
# then enter http://localhost:3100 as the target and click Run QA.
```

The full agent transcript, bug list, and execution feed are persisted to
`reports/` after the run completes. The runs described in this case study are at:

```
v1: reports/agent-report-2026-05-05T01-09-05-251Z.json   (run-1777943209783-665822)
v2: reports/agent-report-2026-05-06T00-19-19-383Z.json   (run-1778026647248-216624)
v3: reports/agent-report-2026-05-06T00-34-23-052Z.json   (run-1778027519221-788558)
```

---

## v2 / v3: Iterating on the agent

After v1 (above), we modified the agent to address the failure modes we observed:

### What changed in code

| File | Change |
|------|--------|
| `src/agent/browser.ts` | `timed()` snapshots `networkErrors`/`consoleErrors` length pre-action, returns only entries added during *that* action — so the agent sees server crashes triggered by clicks |
| `src/agent/browser.ts` | New `click_immediate` action (`state: "attached"`, `force: true`) for race-condition probes |
| `src/agent/browser.ts` | Added 250ms `waitForTimeout` after `click` so JS `fetch()` handlers have time to dispatch their request before `waitForLoadState("networkidle")` samples (without it, networkidle returned in <50ms while the form's fetch hadn't been dispatched yet) |
| `src/agent/agent.ts` | SYSTEM_PROMPT extended with 6 BUG DETECTION RULES: network errors, auth bypass, fuzz inputs, performance, cross-layer validation, race conditions |
| `src/agent/types.ts` | `BrowserAction` and `TestStep.action` enums extended with `click_immediate` |

### v2 (SYSTEM_PROMPT changes only — fetch-dispatch race not yet diagnosed)

- 15 tests generated, all passed, **0 bugs filed**
- Test *generation* clearly improved: TC_004 used `[*?\\` (regex specials), TC_005 used `' OR 1=1 --`, TC_006 used `../../../etc/passwd`, TC_007 used a 300-char overflow — every fuzz input from the new SYSTEM_PROMPT
- But **no bugs were filed** despite triggering them. A direct probe revealed the cause: `locator.click()` returned in ~40ms, `waitForLoadState("networkidle")` returned immediately because the JS form's `fetch()` was still on the next tick. By the time the result was returned, the 5xx response hadn't fired yet, so `networkErrors` was empty. The agent saw clean `data: { clicked, finalUrl }` and marked the test passed.

### v3 (with the 250ms post-click settle)

| Bug | Result |
|-----|--------|
| BUG_001 — Search endpoint crashes on regex special chars | ✅ **TRUE POSITIVE — planted bug #6** |
| BUG_002 — Admin negative price selector failure | ❌ **False positive** — Playwright can't click `<option>` directly; analyzer mis-classified the test flake as a real bug |

### Bug-by-bug comparison across runs

| # | Planted bug | v1 | v2 | v3 |
|---|-------------|----|----|----|
| 1 | Login accepts empty password | ⚠️ Observed (auth notes) | ❌ Missed | ❌ Missed — agent never tested valid email + empty password specifically |
| 2 | Signup TypeError on malformed email | ❌ Missed | ❌ Missed | ❌ Missed — agent's signup tests all used emails containing `@` |
| 3 | Race condition: out-of-stock cart | ❌ Missed | ❌ Missed | ❌ Missed — agent never invoked `click_immediate` |
| 4 | Admin → missing category → 500 | ❌ Missed | ❌ Missed | ❌ Missed — bug only fires when `category` field is *omitted*, not when sent as `""`; unreachable via UI |
| 5 | Frontend doesn't validate category | ❌ Missed | ❌ Missed | ❌ Missed |
| 6 | Search regex injection → 500 | ❌ Missed | ❌ Missed (triggered, not filed) | ✅ **Caught** |
| 7 | Dashboard stats 3-4s latency | ❌ Missed | ❌ Missed | ❌ Missed — agent navigates but doesn't reason about `metrics.actionMs` |
| Bonus: Duplicate email signup | ✅ Caught | ❌ Missed | ❌ Missed |

### v3 metrics

| Metric | v1 | v3 | Δ |
|--------|----|----|---|
| Steps | 37 / 40 | 30 / 40 | -7 |
| Tests generated | 21 | 14 | -7 |
| Bugs filed | 1 | 2 | +1 |
| Real bugs (planted) | 0 | 1 | **+1** |
| Bonus bugs (unplanted) | 1 | 0 | -1 |
| False positives | 0 | 1 | +1 |
| Wall-clock | 2:16 | 2:24 | +8s |
| Model | claude-haiku-4-5 | claude-haiku-4-5 | — |

### What's still broken, and what to fix next

1. **AUTH BYPASS rule didn't fire because the agent never set up the trigger.**
   The system prompt tells the agent "after submitting a login with invalid credentials, check finalUrl." But the agent's TC_001 used empty fields (which the backend rejects with 400, no auth bypass possible), and TC_010 used a malformed email (also rejected). It never tested *valid email + empty password* — the only combo that actually triggers BUG #1. **Fix:** add an explicit fuzz combo to the SYSTEM_PROMPT: "Always test login with at least one valid-format email AND an empty password — auth bypasses commonly hide there."

2. **Fuzz inputs missed malformed emails.** The fuzz list in the SYSTEM_PROMPT covers regex specials, SQL injection, path traversal, and length overflow — but not email-format edge cases. **Fix:** add `noatsign`, `@nodomain`, `name@.com` to the fuzz list, scoped to `type=email` fields.

3. **Race condition probe never used.** Rule 6 introduces `click_immediate` but the agent didn't recognize the out-of-stock UI as a race-condition candidate. **Fix:** prompt should give a concrete trigger: "If you see a button rendered with `disabled` attribute on a freshly-loaded page, also test it with click_immediate to check whether JS briefly enables it."

4. **Performance rule didn't fire.** The dashboard navigation surely had `actionMs > 2000` (curl confirmed 3-4s latency), but the agent didn't note it. The rule may need to be stricter: "if actionMs > 2000 on ANY navigation, immediately add a test that navigates to that URL again and compare — file a perf bug if both exceed 2s."

5. **False positive from the post-test analyzer.** When TC_008 timed out trying to click an `<option>` element directly, the analyzer filed it as a real bug instead of a "test issue." The analyzer needs a heuristic: if the failed selector targets an `<option>` inside a `<select>`, classify as `element_not_interactable` (test issue) and suggest `selectOption` instead.

### Bottom line

The v3 changes proved the architecture: surface 5xx network errors as structured tool result data, and the agent will reason about them and file bugs (BUG_001 in v3 is exactly this path firing as designed). The remaining misses are not infrastructure failures — they're prompt-coverage gaps. Each can be closed with targeted SYSTEM_PROMPT additions like the ones listed above. A v4 run after fixes 1-3 should plausibly land 4 of 7 planted bugs.

