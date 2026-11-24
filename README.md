# RepoLens

> **Open a GitHub repository. Understand what it does, how it works, and where everything lives.**

RepoLens is a Manifest V3 browser extension for **Google Chrome** and **Brave Browser** that inspects the GitHub repository in your active tab and presents an evidence-backed breakdown inside the browser side panel.

---

## Key Features

- **Automatic GitHub Repository Detection:** Detects repository owner, name, branch, commit SHA, and page type (`repo_root`, `tree`, `blob`, `pull`, `issues`) across full page loads and GitHub's client-side Turbo/SPA navigation.
- **Overview:** Summarizes project purpose, categorized tech stack with clickable source-file citations, key modules, execution summary, and observations.
- **Architecture:** Identifies the architectural pattern, interactive component cards (with dependencies and reverse "Used by" links), numbered data-flow sequences, and external integrations.
- **Codebase Explorer:** Groups prioritized files and directories with `critical`, `important`, and `supporting` significance filters, plain-English responsibilities, rationale, and a collapsible directory tree outline.
- **Execution Flow:** Traces startup and runtime execution steps with `verified` / `inferred` confidence badges, clickable GitHub `#Lstart-Lend` citations, and code snippets.
- **Ask Repository:** Streaming Q&A grounded strictly in the analyzed repository slice (`RepoIndex`, Overview, and Architecture), with preset prompt chips and clickable file citations.
- **Commit-Aware Caching:** Caches per-stage and completed analyses by `owner/repo:commitSha` in `chrome.storage.local` to prevent stale explanations across branch updates and avoid redundant API calls.

---

## Prerequisites

- **Node.js:** v18 or higher (with `npm`)
- **Browser:** Google Chrome or Brave Browser (Manifest V3 + Side Panel API support)
- **AI API Key:** A user-supplied key for either **Google Gemini** (default model: `gemini-1.5-flash`) or **OpenAI** (default model: `gpt-4o-mini`)
- **GitHub Personal Access Token (Optional):** Raises the GitHub REST API rate limit from 60 requests/hour (unauthenticated) to 5,000 requests/hour and enables access to private repositories authorized by the token

---

## Setup & Build

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Build the production extension bundle (`dist/`):**
   ```bash
   npm run build
   ```
   This bundles the React side panel, ES module background service worker, standalone IIFE content script (`content.js`), and `manifest.json` into `dist/`.

3. **Run the automated test suite and type check:**
   ```bash
   npm test
   npx tsc --noEmit
   ```
   `npm test` automatically runs `npm run build` (via `pretest`) before executing the Vitest suite.

4. **Development watch mode (optional):**
   ```bash
   npm run dev
   ```

---

## Installing in Chrome & Brave

RepoLens builds a single Chromium Manifest V3 package in `dist/` compatible with both Google Chrome and Brave Browser.

1. Run `npm run build` and verify that the `dist/` directory contains:
   - `manifest.json`
   - `background.js`
   - `content.js`
   - `sidepanel/index.html`
   - `assets/`
2. Open the extensions page in your browser:
   - **Chrome:** Navigate to `chrome://extensions`
   - **Brave:** Navigate to `brave://extensions`
3. Enable **Developer mode** using the toggle in the top-right corner.
4. Click **Load unpacked** and select the `dist/` folder inside this repository.
5. Navigate to any GitHub repository (e.g., `https://github.com/facebook/react`) and click the **RepoLens** icon in the browser toolbar to open the side panel.

---

## Configuration

1. Click the **Settings** (gear) icon in the RepoLens side panel header.
2. **AI Provider & API Key:**
   - Choose **Google Gemini** or **OpenAI**.
   - Paste your API key and optionally customize the model name (defaults: `gemini-1.5-flash` for Gemini, `gpt-4o-mini` for OpenAI).
3. **GitHub Personal Access Token (Optional):**
   - Paste a read-only GitHub PAT (`ghp_...` or `github_pat_...`) to increase the GitHub API rate limit to 5,000 req/hr or analyze private repositories.
4. Click **Save**.
5. Use **Clear Cache** inside Settings at any time to purge cached repository analyses from `chrome.storage.local`.

> **Privacy & Storage Note:** Credentials are stored locally in `chrome.storage.local` (browser extension-local storage, not a hardware-backed vault) and are sent directly only to `api.github.com` and your selected AI provider (`generativelanguage.googleapis.com` or `api.openai.com`) when you trigger analysis or Q&A.

---

## Known Limitations & Roadmap

### Current MVP Limitations
- **Bounded Repository Slice:** To fit LLM context budgets and GitHub API limits, RepoLens prioritizes up to 20 files, fetches up to 5 manifests in Stage 1 and up to 6 entry/source candidates in Stage 2, and caps fetched content at 15,000 characters per file (55,000 characters total per stage).
- **Grounded Q&A Scope:** *Ask Repository* answers using the indexed tree outline, prioritized file list, Overview, and Architecture outputs; it does not dynamically fetch arbitrary unanalyzed files during chat.
- **Large / Truncated Trees:** Repositories exceeding GitHub's recursive Git Tree limit trigger a truncation notice; analysis proceeds on the partial tree returned by GitHub.
- **Heuristic Indexing:** Language, manifest, and entry-point identification relies on deterministic tree and filename heuristics combined with LLM structured output rather than full-repo AST parsing.
- **Automated vs. Browser Testing:** The automated Vitest suite runs against mocked network, storage, and DOM shims; live Chrome/Brave extension loading is verified manually via the checklist in [docs/TESTING.md](docs/TESTING.md).

### Future Roadmap (Post-MVP)
- GitHub OAuth 2.0 authentication flow
- On-demand AST and call-graph exploration
- GitLab, Bitbucket, and self-hosted Git platform adapters
- Local repository support via an optional native companion application

---

## Documentation

- [Architecture Guide](docs/ARCHITECTURE.md)
- [Security & Privacy](docs/SECURITY.md)
- [Testing & Browser Verification](docs/TESTING.md)
