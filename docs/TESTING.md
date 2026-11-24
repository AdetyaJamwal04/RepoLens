# RepoLens Testing & Validation Guide

## 1. Test Suite Architecture

RepoLens uses **Vitest** (`vitest run`) for fast, deterministic unit and integration testing without requiring a live GitHub account, paid LLM API keys, or `jsdom`.

- **Total Automated Coverage:** **77 tests across 9 test files**
- **Mocking Strategy:**
  - Network calls (`fetch`) are stubbed with `vi.stubGlobal('fetch', ...)` and deterministic SSE `ReadableStream` fixtures.
  - Extension storage (`chrome.storage.local`) is tested both against the in-memory fallback and a mocked `chrome.storage.local` adapter.
  - Side panel React 19 UI components are tested using both `react-dom/server` (`renderToString`) and an in-memory DOM shim for `react-dom/client` (`createRoot`) + `act()` interactive event flows.

---

## 2. Verification Commands

Run these commands from the repository root:

```bash
# 1. Production build (generates dist/ with MV3 manifest, background.js, content.js, sidepanel/)
npm run build

# 2. Full automated test suite (runs pretest build + all 9 Vitest files)
npm test

# 3. TypeScript strict type checking (0 errors expected)
npx tsc --noEmit
```

---

## 3. Test Suites Breakdown

| Test File | Tests | Scope Verified |
|---|---|---|
| [tests/build.test.ts](../tests/build.test.ts) | 1 | Verifies `dist/manifest.json` (`manifest_version: 3`, `side_panel.default_path`), `dist/background.js`, `dist/sidepanel/index.html`, and that `dist/content.js` is a standalone classic script with no top-level ES `import` statements. |
| [tests/core/github/url-parser.test.ts](../tests/core/github/url-parser.test.ts) | 6 | Verifies `parseGitHubUrl` on repo roots, trailing slashes, `tree/` and `blob/` paths, 40-char commit SHAs, `pull`/`issues` pages, and non-repo/non-GitHub URLs. |
| [tests/core/github/client.test.ts](../tests/core/github/client.test.ts) | 9 | Verifies `GitHubClient` Bearer token headers, unauthenticated requests, `RateLimitError` (403/429 with remaining/reset), `NotFoundError` (404), `GitHubApiError` (500), `getTree` truncation detection, and `getFileContent` path encoding. |
| [tests/core/indexer/indexer.test.ts](../tests/core/indexer/indexer.test.ts) | 14 | Verifies `isExcluded` (build dirs, binaries, lockfiles, `.env*` secrets vs `.env.example`), `isManifest`, `isCandidateEntryPoint`, `prioritizeTree`, `detectLanguages`, `generateTreeOutline`, and `buildRepoIndex` / `extractRepoIndex`. |
| [tests/core/ai/engine.test.ts](../tests/core/ai/engine.test.ts) | 7 | Verifies `AnalysisEngine` Stages 1–3, `<repository_data>` delimiters, literal `</repository_data>` tag escaping, `SYSTEM_SECURITY_INSTRUCTION`, JSON schema passing, and `askQuestion` streaming & out-of-slice instructions. |
| [tests/core/ai/providers.test.ts](../tests/core/ai/providers.test.ts) | 8 | Verifies `GeminiProvider` and `OpenAIProvider` structured JSON calls, SSE streaming chunks, role translation (`assistant` -> `model`), and `AIProviderError` mapping (401/403, 429, 5xx). |
| [tests/core/storage/cache.test.ts](../tests/core/storage/cache.test.ts) | 9 | Verifies `RepoCache` key formatting (`owner/repo:commitSha`), commit-SHA mismatch rejection, partial stage merging, repo-scoped clearing, and `chrome.storage.local` adapter behavior. |
| [tests/core/storage/settings.test.ts](../tests/core/storage/settings.test.ts) | 5 | Verifies `SettingsStore` defaults (`gemini-1.5-flash`, `gpt-4o-mini`), partial saves, `clearSettings`, and `chrome.storage.local` persistence under `repolens:settings`. |
| [tests/sidepanel/App.test.tsx](../tests/sidepanel/App.test.tsx) | 18 | Verifies empty state, active repo header/tabs, all 5 tabs (`Overview`, `Architecture`, `Explorer`, `Flow`, `Ask AI`), `SettingsModal` save/cancel, missing API key & rate limit banners, `fetchBoundedContents` `RateLimitError` propagation, commit-URL cache hydration, stale stream cancellation on repo switch/unmount, and `javascript:`/`data:` XSS blocking. |

---

## 4. Browser Smoke Test Checklist (Chrome & Brave)

Run this manual verification in both **Google Chrome** and **Brave Browser** after `npm run build`:

1. **Extension Loading:**
   - Open `chrome://extensions` (Chrome) or `brave://extensions` (Brave).
   - Enable **Developer mode**, click **Load unpacked**, and select `dist/`.
   - Confirm RepoLens loads with **no manifest warnings or service worker errors**.
2. **Non-Repository Empty State:**
   - Open `https://github.com/explore` or a non-GitHub site, then click the RepoLens toolbar icon.
   - Confirm the side panel opens and displays **No Repository Detected**.
3. **Repository Detection & Client-Side Navigation:**
   - Navigate to a public repository (e.g., `https://github.com/facebook/react`).
   - Confirm the header updates with `owner/repo` and branch badge.
   - Click into a directory (`tree/`), a file (`blob/`), and a pull request (`pull/`) without reloading the page; confirm RepoLens tracks the navigation.
4. **Settings & API Configuration:**
   - Click the Settings gear icon, add a Gemini or OpenAI API key, and click **Save**.
   - Re-open Settings to confirm persistence; toggle visibility and verify **Cancel** discards edits.
5. **3-Stage Analysis & Progressive Rendering:**
   - Click **Analyze** on a public repository.
   - Confirm status transitions (`indexing` → `analyzing` → `ready`) and stage messages progress (`Stage 1/3` → `Stage 2/3` → `Stage 3/3`).
   - Inspect **Overview**, **Architecture** (click component cards to verify dependency selection), **Explorer** (test significance filter pills and `Tree Outline`), and **Flow** (verify `#L` line links open the right GitHub file/line in a new tab).
6. **Ask Repository Streaming:**
   - Switch to **Ask AI**, click a preset chip (e.g., `What are the entry points?`), and verify streaming output, safe Markdown rendering, and clickable file links.
7. **Commit-Aware Caching:**
   - Navigate to the repository at its commit SHA URL (or re-trigger analysis on the same commit) and confirm the `cached` badge appears in the header without redundant AI calls.
   - Use **Clear Cache** in Settings and verify subsequent analysis runs fresh.
8. **Error Handling:**
   - Clear the AI API key and click **Analyze** → verify the **AI API Key Required** warning banner appears with a **Configure API Key** action.
