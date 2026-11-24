# RepoLens — Architecture & Product Decisions (DECISIONS.md)

This log records settled architectural, product, and security decisions. Per `INSTRUCTIONS.md` §17, settled decisions must not be reopened unless new evidence invalidates them.

---

### DEC-001: Architectural Approach Selection
- **Date:** 2026-11-24
- **Decision:** Selected **Approach 1 (Lean Standalone Extension)** over Monorepo/Cytoscape (Approach 2) and Companion Daemon (Approach 3).
- **Rationale:** Minimizes bundle size, eliminates external backend hosting/server costs, ensures 100% compliance with Manifest V3 and Chrome Web Store policies, and adheres to Ponytail principles ("the smallest change that fully solves the task").
- **Status:** APPROVED

### DEC-002: GitHub Authentication & Onboarding
- **Date:** 2026-11-24
- **Decision:** Zero-friction start for public repositories (unauthenticated REST API with 60 req/hr) + user-supplied read-only Personal Access Token (PAT) stored in `chrome.storage.local` for 5,000 req/hr rate limits and private repository access. Full OAuth 2.0 app flow with proxy backend is documented and deferred to post-MVP.
- **Rationale:** Enables instant user onboarding without registration gates or hosting infrastructure, while providing a clear path to high rate limits and private repo support.
- **Status:** APPROVED

### DEC-003: Progressive 3-Stage AI Generation Pipeline
- **Date:** 2026-11-24
- **Decision:** Decomposed analysis generation into 3 discrete sequential stages (Stage 1: Overview & Tech Stack → Stage 2: Architecture & Execution Flow → Stage 3: Codebase Explorer) rather than a single monolithic LLM prompt.
- **Rationale:** Prevents model output token limits (4k–8k tokens) from causing JSON truncation; satisfies PRD §8 (progressive rendering) and PRD §10 (per-stage retry without restarting completed work).
- **Status:** APPROVED

### DEC-004: Context Grounding for "Ask Repository" (Tab 5)
- **Date:** 2026-11-24
- **Decision:** Tab 5 is strictly grounded in the pre-analyzed repository slice (directory tree, dependency manifests, prioritized files, and Stage 1–3 outputs). Unanalyzed files are explicitly flagged as out-of-scope rather than guessed. Dynamic on-demand AST exploration is deferred to post-MVP per PRD §11 ("Won't Have in MVP").
- **Rationale:** Prevents hallucinated file explanations and avoids complex tool-calling loops that exhaust GitHub API rate limits during interactive chat.
- **Status:** APPROVED

### DEC-005: Security & Prompt Injection Mitigation
- **Date:** 2026-11-24
- **Decision:** All repository source files, READMEs, and commit messages are treated as untrusted data, enclosed within `<repository_data>` delimiters, accompanied by explicit system instructions prohibiting execution or override of system directives. All rendered markdown is sanitized.
- **Rationale:** Protects against malicious repository authors embedding prompt injection or XSS payloads in public codebases.
- **Status:** APPROVED
