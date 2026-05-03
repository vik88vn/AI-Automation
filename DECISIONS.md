# Technical Decision Log: Autonomous AI QA Engineer

This document serves as a record of the architectural choices, engineering trade-offs, and design philosophy implemented during the development of the AI QA Engineer.

## 1. State Persistence & Session Hydration
**Decision:** Integrated `persist` middleware into the Zustand `DisplayStore`.
**Reasoning:** Testing runs for complex web applications are long-running processes. By persisting the store to `localStorage`, I ensured that the "AppModel" (the agent's internal map of the site) and the "Bug List" survive browser refreshes. This moves the tool from a "one-off script" to a persistent professional workspace.

## 2. Visual Identity: "The Tester That Never Sleeps"
**Decision:** Designed a custom `Home.tsx` landing page with a Dark-Mode aesthetic (`bg-slate-950`) and glowing UI accents.
**Reasoning:** To position this as a premium "Autonomous" tool, the UI needs to feel powerful yet focused. The dark theme reduces eye strain for engineers monitoring logs, while the gradient typography establishes a modern, AI-first brand identity.

## 3. UX: Perceptual Performance (Terminal Logs)
**Decision:** Implemented a sequential "Terminal Log" micro-interaction during the agent launch sequence.
**Reasoning:** Instead of a generic loading spinner, the tool cycles through system initialization logs (e.g., "Initializing Playwright..."). This provides immediate feedback to the user and reinforces the narrative of a deep, agentic process happening behind the scenes.

## 4. Multi-Session Architecture
**Decision:** Implemented a `useSessionStore` to manage an array of historical runs.
**Reasoning:** Users need to compare results across different versions of their site. By decoupling the "Active Run" from the "Run History," I enabled a tabbed navigation system that allows for rapid switching between different testing sessions without losing state.

## 5. Authentication Strategy: Human-in-the-Loop (Planned)
**Decision:** Adopted a "Credential Injection" model over "Autonomous Guessing" for login walls.
**Reasoning:** Autonomous agents often fail at MFA (Multi-Factor Authentication). By designing a `request_credentials` tool, I am prioritizing reliability. The agent detects the login requirement, pauses for secure human input, and then persists the resulting session cookies to avoid redundant login prompts.

5/3/2026 3:02 pm
Implemented a 'Human-in-the-Loop' authentication bridge. Chose to pause agent execution for manual credential injection rather than autonomous guessing to ensure 100% reliability on MFA-protected and enterprise-grade login walls.

5/3/2026 2:48 pm
UX Optimization: Refactored the API configuration flow to be 'Pre-Flight' rather than 'Reactive.' Implemented a persistent Settings layer to allow users to configure LLM providers before the first run, eliminating the 'Fail-then-Fix' loop. Also implemented constrained-scroll containers for test results to maintain UI integrity on high-density data runs.

5/3/2026 3:20 pm
Implemented constrained-viewport scrolling using CSS calc() to maintain UI integrity during high-volume test execution. Also created an onClick handler for the logo and text on the top left of the UI to send the user back to the home page once clicked.

## 6. Folder Merge & Conflict Resolution
**Decision:** When parallel Claude session work appeared in a duplicate subfolder, resolved via git merge instead of manual copying.
**Reasoning:** Preserves history, enables tracking of parallel work, and ensures all features are integrated correctly. Typed out manual merge conflict resolution for frontend stores and components, combining parent's session persistence with sub's event-driven architecture.

## 7. Mock Data Lifecycle
**Decision:** Changed `MOCK_ACTIVE_RUN` from a pre-populated running session to an empty queued state.
**Reasoning:** Users were confused seeing a test "in progress" on fresh load. An empty initial state clearly signals "waiting for user input" and respects the principle that the app should start in a default/clean state rather than assume test history exists.

## 8. URL Input & Localhost Support
**Decision:** Changed input type from "text" to "url" with client-side URL normalization logic.
**Reasoning:** 
- HTML5 `type="url"` provides built-in validation and mobile keyboards optimized for URLs
- Added regex-based protocol injection: `localhost:3000` → `http://localhost:3000`, domain without protocol → `https://domain`
- This lowers the barrier to testing local dev servers while maintaining HTTPS-first for production domains
- Validation happens in `onSubmit` before calling `startNewRun`, preventing malformed URLs from reaching the backend

## 9. Architecture Decision: Client vs. Server URL Normalization
**Decision:** Handle URL normalization on the frontend, not the backend.
**Reasoning:** 
- Frontend can provide immediate visual feedback (invalid URL styling, helper text)
- Reduces backend complexity and API contract brittleness
- Works offline and enables form validation before sending requests
- UX: user sees their input transformed in real-time, building confidence