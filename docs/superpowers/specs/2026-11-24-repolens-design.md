# RepoLens — System Design Document

**Document:** `docs/superpowers/specs/2026-11-24-repolens-design.md`  
**Date:** 2026-11-24  
**Status:** In Review (Pending Approval)  
**Author:** Antigravity (Lazy Senior Dev / Ponytail mode)  
**Companion Documents:** `PRD.md`, `INSTRUCTIONS.md`

---

## 1. Intent and The Why

Developers frequently encounter unfamiliar open-source or team repositories on GitHub. Understanding what a repository does, its architecture, its entry points, and how data moves through it currently requires manually clicking through dozens of directories, reading dependency manifests, and guessing execution flows.

**RepoLens** solves this by providing an evidence-backed browser extension for Chrome and Brave. It runs inside the Chromium Side Panel, detects the active repository, indexes its structure and key source files via the GitHub API, and leverages LLMs to generate structured, cited explanations (Overview, Architecture, Codebase Explorer, Execution Flow, and contextual Q&A).

RepoLens is **not** a generic chatbot attached to a webpage; it is a repository intelligence layer where every claim is grounded in repository evidence (file paths and line numbers) and explicitly distinguishes verified facts from inferences.

---

## 2. Goals, Non-Goals, and Anti-Goals

### Goals
- **Manifest V3 Single Codebase:** One Chromium codebase running reliably in Chrome and Brave without separate forks.
- **Automatic Navigation Detection:** Detects repository owner, name, branch, and commit SHA across standard GitHub pages and client-side SPA navigations (Turbo/PJAX).
- **Evidence-Grounded Insights:** Produces 5 core side-panel tabs:
  1. *Overview:* Purpose, tech stack, key components, execution summary.
  2. *Architecture:* High-level component map, dependencies, external integrations, interactive component cards.
  3. *Codebase Explorer:* Intelligently grouped file tree with plain-English responsibilities.
  4. *Execution Flow:* Step-by-step startup and runtime flow based on entry points and call chains.
  5. *Ask Repository:* Streaming conversational Q&A with clickable GitHub file/line citations.
- **Provider-Agnostic AI Layer:** Pluggable AI abstraction supporting Google Gemini and OpenAI with structured JSON schemas and streaming.
- **Commit-Aware Caching:** Cache analyses by `owner/repo:commitSHA` in `chrome.storage.local` / IndexedDB to avoid repeated API requests and duplicate LLM costs.
- **Zero-Friction Onboarding (Option A):** Analyze public repositories immediately without requiring a GitHub token; gracefully prompt for an optional Personal Access Token (PAT) when approaching rate limits or accessing private repositories.

### Non-Goals (MVP)
- Modifying repository code, creating pull requests, or committing changes.
- Executing code or running terminal sessions inside the browser.
- Multi-repository cross-analysis or monorepo workspace graphing beyond the active repository.
- GitLab / Bitbucket / self-hosted platforms (architected for future adapters, but MVP focuses exclusively on GitHub).
- Hosted proxy servers or cloud databases; all state is local to the user's browser.

### Anti-Goals
- **Hallucinatory Chat:** Answering questions with ungrounded speculation or fabricated file paths.
- **Resource Exhaustion:** Blindly fetching or sending entire multi-megabyte repositories to an LLM context window.
- **Code Execution Vulnerabilities:** Evaluating or injecting repository scripts or unsanitized markdown into the DOM.
- **Over-engineered Visuals:** Bundling multi-megabyte canvas graph engines (e.g., Cytoscape) that freeze narrow extension side panels.

---

## 3. Constraints & Security Boundary

1. **Manifest V3 Constraints:**
   - Background service workers are ephemeral and terminate when idle. State must not rely on in-memory global variables.
   - Side Panel API (`chrome.sidePanel`) must be initiated cleanly per tab or action.
   - Remote hosted code is forbidden. All scripts and dependencies must be bundled locally.
2. **GitHub Authentication & Scope (Option 1 Selected):**
   - **MVP:** Pure client-side authentication via user-configured GitHub Personal Access Token (PAT) with read-only `repo` permissions. This unlocks 5,000 req/hr rate limits for public repos and allows explicit user-authorized access to private repositories without any external server infrastructure.
   - **Storage:** PAT is stored strictly inside `chrome.storage.local`.
   - **Future Scope (Post-MVP):** A dedicated OAuth App integration using `chrome.identity.launchWebAuthFlow` and a secure token exchange backend proxy to provide seamless 1-click GitHub login without manual PAT creation.
3. **Security & Prompt Injection:**
   - Repository code, READMEs, and commit messages are untrusted external input.
   - Prompts must enclose repository content within strict data delimiters (e.g., `<repository_data>`) and explicitly instruct models to treat repository content as passive data, ignoring instructions embedded within.
   - Rendered markdown must be sanitized (e.g., DOMPurify or custom AST sanitizer) with disallowance of `javascript:` links and arbitrary HTML.
4. **Secrets Management:**
   - User AI API keys and GitHub PATs are stored strictly in `chrome.storage.local`.
   - Content scripts and injected page scripts never receive or handle API keys.
   - Never log tokens or send repository code to third-party telemetry.

---

## 4. Architectural Approaches Considered

### Approach 1: Lean Standalone Extension (Selected)
- **Tooling:** Vite multi-entry build (`vite.config.ts`) outputting `manifest.json`, background service worker (`background.ts`), content detector (`content.ts`), and React sidepanel app (`src/sidepanel/index.html`).
- **Architecture:** Client-side only. Sidepanel communicates with background worker via standard `chrome.runtime` messaging. GitHub API requests and AI calls run directly from extension contexts using standard `fetch` with streaming. Architecture diagrams use responsive SVG/CSS component cards.
- **Pros:** Minimal dependencies, fastest build, zero external backend requirement, full compliance with Chrome Web Store policies, simplest codebase to maintain.
- **Cons:** In-browser token budgeting and hierarchical summarization must be strictly capped.

### Approach 2: Monorepo Split with Graph Canvas Library (Rejected)
- **Tooling:** Turborepo or npm workspaces (`@repolens/core`, `@repolens/ui`, `@repolens/extension`) with Cytoscape.js or ReactFlow.
- **Why Rejected:** Multiplies package configs, slows build times, adds 1.5MB+ of bundle bloat for graph rendering in a narrow 350px-400px sidepanel, violating Ponytail simplicity rules.

### Approach 3: Extension with Local Companion Daemon (Rejected)
- **Tooling:** Browser extension paired with a local CLI/daemon for deep AST parsing via tree-sitter.
- **Why Rejected:** Violates zero-friction installation; requires developers to run terminal daemons just to view repository insights. Explicitly deferred to post-MVP in PRD §16.

---

## 5. System Architecture & Component Design

```
┌─────────────────────────────────────────────────────────────┐
│                       GitHub.com Tab                        │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ Content Script (content.ts)                           │  │
│  │ - Observes URL & DOM changes (pjax/turbo)             │  │
│  │ - Extracts owner/repo, branch, commit SHA, page type  │  │
│  └──────────────────────────┬────────────────────────────┘  │
└─────────────────────────────┼───────────────────────────────┘
                              │ chrome.runtime.sendMessage
                              ▼
┌─────────────────────────────────────────────────────────────┐
│         Background Service Worker (background.ts)           │
│ - Sidepanel lifecycle management (chrome.sidePanel.open)    │
│ - Central message router between tabs and sidepanel         │
│ - Badge & status updates                                    │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│            Sidepanel React App (sidepanel.tsx)              │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ UI Layer (Tailwind CSS, Lucide icons, Dark theme)       │ │
│ │ - Header (Repo badge, Commit SHA, Refresh, Settings)    │ │
│ │ - Navigation Tabs:                                      │ │
│ │   [Overview] [Architecture] [Explorer] [Flow] [Ask AI]  │ │
│ └───────────────────────────┬─────────────────────────────┘ │
│                             │                               │
│ ┌───────────────────────────▼─────────────────────────────┐ │
│ │ Core Engine (Framework-independent TypeScript)          │ │
│ │                                                         │ │
│ │ 1. Repository Client (github-client.ts)                 │ │
│ │    - REST / Git Trees / Contents APIs                   │ │
│ │    - Rate-limit detection & optional PAT support        │ │
│ │                                                         │ │
│ │ 2. Indexer & Prioritizer (indexer.ts, prioritizer.ts)   │ │
│ │    - Tech stack / manifest detector (package.json, etc.)│ │
│ │    - Entry point heuristics                             │ │
│ │    - Token budgeting & file ranking                     │ │
│ │                                                         │ │
│ │ 3. AI Explanation Engine (engine.ts)                    │ │
│ │    - Provider interface (GeminiProvider, OpenAIProvider)│ │
│ │    - Structured JSON schemas & evidence validation      │ │
│ │    - Streaming response handlers                        │ │
│ │                                                         │ │
│ │ 4. Storage & Cache (cache.ts)                           │ │
│ │    - Key: `owner/repo:commitSHA`                        │ │
│ │    - Eviction & invalidation logic                      │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. Generation Pipeline & Data Contracts

### 6.1 Progressive Staged Generation (Builder Call)
To adhere to PRD §8 (progressive rendering), PRD §10 (stage retries), and prevent LLM output token truncation (4k–8k token limits), analysis generation is **staged progressively** rather than executed as a single monolithic prompt:

1. **Stage 1 — Overview & Tech Stack:**
   - Input: Repository metadata, directory tree summary, manifest files (`package.json`, `Cargo.toml`, etc.), README summary.
   - Output: Purpose, detected technologies with evidence, key modules, project execution summary.
2. **Stage 2 — Architecture & Execution Flow:**
   - Input: Overview output, entry point files, configuration files, and core service modules.
   - Output: High-level architectural pattern, component definitions, dependencies, and step-by-step execution flow with source citations.
3. **Stage 3 — Codebase Explorer:**
   - Input: Directory tree and component mappings from Stage 2.
   - Output: Significance ratings (`critical`, `important`, `supporting`), responsibilities, and rationale for key folders/files.

Each stage has its own validated JSON schema, allowing the sidepanel UI to render sections progressively as each completes and enabling retrying failed stages individually.

### 6.2 Context Scope for "Ask Repository" (Builder Call)
Per PRD §11 ("Agentic codebase exploration" is Won't Have in MVP), Tab 5 (Ask Repository) is grounded strictly in the **pre-analyzed repository slice**:
- System prompt includes the structured repository index, directory tree outline, generated Stage 1–3 outputs, and the prioritized source file contents.
- If a user asks about files or symbols outside this slice, the model is instructed to state that the file was not part of the analyzed slice, rather than speculating or hallucinating. Dynamic on-demand AST search is reserved for post-MVP.

### 6.3 Evidence Model

Every piece of factual analysis generated by RepoLens references an immutable `EvidenceItem`:

```typescript
export type EvidenceType = 'source' | 'manifest' | 'config' | 'documentation' | 'api_metadata';

export interface EvidenceItem {
  filePath: string;
  lineStart?: number;
  lineEnd?: number;
  commitSha: string;
  type: EvidenceType;
  snippet?: string;
  confidence: 'verified' | 'inferred' | 'unknown';
}

export interface OverviewOutput {
  purpose: string;
  technologies: Array<{ name: string; category: string; evidence: EvidenceItem }>;
  keyModules: Array<{ name: string; description: string; path: string }>;
  executionSummary: string;
  observations: string[];
}

export interface ArchitectureOutput {
  pattern: string;
  components: Array<{
    id: string;
    name: string;
    responsibility: string;
    importantFiles: string[];
    dependencies: string[];
  }>;
  dataFlow: string[];
  externalIntegrations: string[];
  executionFlow: Array<{
    stepNumber: number;
    title: string;
    description: string;
    sourceReference: EvidenceItem;
    confidence: 'verified' | 'inferred';
  }>;
}

export interface CodebaseExplorerOutput {
  entries: Array<{
    path: string;
    type: 'dir' | 'file';
    significance: 'critical' | 'important' | 'supporting';
    responsibility: string;
    reason: string;
  }>;
}
```

---

## 7. AI Provider Contract

The engine communicates with LLMs through a uniform abstraction:

```typescript
export interface AIProviderConfig {
  provider: 'gemini' | 'openai';
  apiKey: string;
  model?: string;
}

export interface AIProvider {
  generateStructured<T>(prompt: string, schema: object, systemInstruction?: string): Promise<T>;
  streamChat(messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>, onChunk: (chunk: string) => void): Promise<string>;
}
```

- **Gemini Provider:** Uses Google Gemini REST API (e.g., `gemini-1.5-flash` or `gemini-2.5-flash`) with structured schema response format and streaming SSE.
- **OpenAI Provider:** Uses OpenAI chat completions API with `response_format: { type: "json_schema" }` and streaming.

---

## 8. What is Left to the Builder

The builder (Antigravity in subsequent milestones) will determine:
1. Exact Tailwind utility classes, color tokens, and micro-animations for the side panel UI.
2. Granular heuristic weights in `file-prioritizer.ts` (scoring entry files like `index.ts`, `main.py`, `app.go`, manifests like `package.json`, `Cargo.toml`).
3. Specific test fixture repository payloads for unit testing.
4. Exact IndexedDB table configuration for storage quotas.

---

## 9. Validation and Quality Gates

Following `INSTRUCTIONS.md` and Ponytail guidelines:
- **Unit Tests:** Vitest testing URL parsing, file filtering, secret exclusion, indexer heuristics, and schema validation.
- **Type Checking:** `tsc --noEmit` under TypeScript strict mode.
- **Build Verification:** Reproducible `npm run build` producing a clean `dist/` directory loadable via `chrome://extensions` in both Google Chrome and Brave.
- **No Unused Bloat:** No redundant dependencies; standard fetch and native browser APIs prioritized.

---

## 10. Future Roadmap & Post-MVP Extensibility

1. **OAuth 2.0 Web Authentication Flow:** Introduce an official RepoLens GitHub OAuth App and lightweight serverless auth proxy for 1-click authentication without manual PAT generation.
2. **Additional Git Providers:** Adapter abstractions for GitLab, Bitbucket, and self-hosted instances.
3. **Dynamic AST & Agentic Codebase Exploration:** Local companion app with Tree-sitter for interactive call-graph tracing and on-demand file fetching during Q&A.
4. **Export Capabilities:** Export generated repository architectural blueprints as Markdown or PDF documentation.

