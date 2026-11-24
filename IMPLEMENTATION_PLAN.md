# RepoLens — Implementation Plan

**Spec Reference:** [docs/superpowers/specs/2026-11-24-repolens-design.md](file:///C:/Users/Adetya/Projects/git_extension/docs/superpowers/specs/2026-11-24-repolens-design.md)  
**Detailed Task Breakdown:** [docs/superpowers/plans/2026-11-24-repolens-mvp.md](file:///C:/Users/Adetya/Projects/git_extension/docs/superpowers/plans/2026-11-24-repolens-mvp.md)  
**Governing Documents:** `PRD.md`, `INSTRUCTIONS.md`  
**Status:** M0–M6 COMPLETE — MVP DELIVERED (89 tests passing across 10 files)

---

## Milestone M0: Reconnaissance and Design
- **Objective:** Inspect environment, resolve PRD ambiguities, select architecture approach, and define extension build/test strategy.
- **Dependencies:** None.
- **Files Changed:** `PRD.md`, `INSTRUCTIONS.md`, `docs/superpowers/specs/2026-11-24-repolens-design.md`, `DECISIONS.md`, `IMPLEMENTATION_PLAN.md`.
- **Status:** `DONE`
- **Validation:** Approved Design Document and Implementation Plan.

---

## Milestone M1: Extension Foundation & Build Pipeline (Task 1 & Task 2)
- **Objective:** Establish Vite multi-entry build pipeline, Manifest V3 configuration, ephemeral background service worker, GitHub navigation content script, and basic sidepanel shell.
- **Dependencies:** M0.
- **Files Changed:** `package.json`, `tsconfig.json`, `vite.config.ts`, `extension/manifest.json`, `src/background/index.ts`, `src/content/index.ts`, `src/sidepanel/index.html`, `src/sidepanel/App.tsx`, `src/core/github/url-parser.ts`, `tests/build.test.ts`, `tests/core/github/url-parser.test.ts`, `tests/background/index.test.ts`.
- **Status:** `DONE`
- **Acceptance Criteria:** `npm run build` generates valid `dist/` with MV3 manifest; tests verify URL parser across GitHub repo, tree, and blob pages and background tab validation.
- **Validation Command:** `npm run build && npx vitest run tests/build.test.ts tests/core/github/url-parser.test.ts tests/background/index.test.ts` (10 tests: 1 build + 6 url-parser + 3 background)

---

## Milestone M2: Repository Acquisition (Task 3)
- **Objective:** Implement GitHub API client supporting unauthenticated requests (60 req/hr), user-supplied PAT (5,000 req/hr), commit SHA resolution, recursive Git Trees retrieval with truncation detection, and raw content extraction.
- **Dependencies:** M1.
- **Files Changed:** `src/core/github/client.ts`, `tests/core/github/client.test.ts`.
- **Status:** `DONE`
- **Acceptance Criteria:** Handles rate-limits gracefully; resolves true commit SHA via `/commits/{ref}`; retrieves full or partial Git tree; fetches file contents with ref resolution.
- **Validation Command:** `npx vitest run tests/core/github/client.test.ts` (10 tests)

---

## Milestone M3: Repository Indexing & File Prioritization (Task 4)
- **Objective:** Parse file tree to detect languages, ecosystem manifests (`package.json`, `Cargo.toml`, etc.), candidate entry points, and filter out binary/generated/secret files.
- **Dependencies:** M2.
- **Files Changed:** `src/core/indexer/prioritizer.ts`, `src/core/indexer/indexer.ts`, `tests/core/indexer/indexer.test.ts`.
- **Status:** `DONE`
- **Acceptance Criteria:** Excludes `node_modules`, `.git`, binaries, `.env*` and private key/credential files; ranks key entry points and manifests; builds structured `RepoIndex`.
- **Validation Command:** `npx vitest run tests/core/indexer/indexer.test.ts` (15 tests)

---

## Milestone M4: AI Explanation Engine (Task 5)
- **Objective:** Implement pluggable provider abstraction (Google Gemini API & OpenAI API) with structured JSON output and streaming. Implement 3-stage progressive generation pipeline (Overview → Architecture & Flow → Codebase Explorer) with runtime validation and grounded Q&A.
- **Dependencies:** M3.
- **Files Changed:** `src/core/ai/types.ts`, `src/core/ai/gemini-provider.ts`, `src/core/ai/openai-provider.ts`, `src/core/ai/engine.ts`, `tests/core/ai/engine.test.ts`, `tests/core/ai/providers.test.ts`.
- **Status:** `DONE`
- **Acceptance Criteria:** Formats prompts with `<repository_data>` delimiters; validates/normalizes runtime outputs and citations; sends Gemini API key via `x-goog-api-key` header; handles rate limits, token limits, and streaming Q&A.
- **Validation Command:** `npx vitest run tests/core/ai/engine.test.ts tests/core/ai/providers.test.ts` (19 tests: 11 engine + 8 providers)

---

## Milestone M5: User-Facing Workflows & Side Panel UI (Task 7)
- **Objective:** Implement dark-theme sidepanel interface in React/Tailwind with 5 tabs (Overview, Architecture, Codebase Explorer, Execution Flow, Ask Repository), clickable source citations, ErrorBoundary, persistent Ask tab across switches, and settings modal.
- **Dependencies:** M4.
- **Files Changed:** `src/sidepanel/components/*.tsx`, `src/sidepanel/App.tsx`, `src/sidepanel/utils.ts`, `tests/sidepanel/App.test.tsx`.
- **Status:** `DONE`
- **Acceptance Criteria:** Responsive within sidepanel dimensions; progressive rendering as stages complete; partial cache resume on Refresh; clickable GitHub links open relevant files/lines in active tab.
- **Validation Command:** `npx vitest run tests/sidepanel/App.test.tsx` (21 tests)

---

## Milestone M6: Persistence, Hardening & Delivery (Task 6 & Task 8)
- **Objective:** Commit-aware cache in `chrome.storage.local` (`owner/repo:commitSha`), settings persistence, documentation (`README.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/TESTING.md`), and end-to-end build verification.
- **Dependencies:** M5.
- **Files Changed:** `src/core/storage/cache.ts`, `src/core/storage/settings.ts`, `tests/core/storage/cache.test.ts`, `tests/core/storage/settings.test.ts`, `README.md`, `docs/*`.
- **Status:** `DONE`
- **Acceptance Criteria:** Cached analyses reloaded on repeat visits without redundant API calls; 89 automated tests across 10 test files pass; `npm run build` and `npx tsc --noEmit` pass cleanly; extension loads cleanly in Chrome and Brave.
- **Validation Command:** `npm run build && npm test && npx tsc --noEmit` (89 tests passing across 10 files: 14 storage + 75 across M1–M5; 0 TypeScript errors)
