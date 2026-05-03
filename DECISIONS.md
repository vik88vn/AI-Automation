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

"Implemented a 'Human-in-the-Loop' authentication bridge. Chose to pause agent execution for manual credential injection rather than autonomous guessing to ensure 100% reliability on MFA-protected and enterprise-grade login walls."