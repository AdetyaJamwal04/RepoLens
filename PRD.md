# RepoLens — Product Requirements Document

**Product:** RepoLens  
**Version:** 1.0  
**Status:** Ready for implementation  
**Target implementation agent:** Google Antigravity  
**Product category:** AI-powered developer productivity / browser extension

---

## 1. Product Overview

### 1.1 Vision

Build a browser extension that understands and explains the Git repository currently being viewed by the developer.

When a developer opens a repository on GitHub, RepoLens should be able to analyze its source code, directory structure, dependencies, configuration files, documentation, and architectural patterns to produce an understandable explanation of the entire project.

The developer should be able to understand an unfamiliar repository without manually opening dozens of files.

### 1.2 Core Value Proposition

"Open a GitHub repository. Understand what it does, how it works, and where everything lives."

RepoLens should answer questions such as:

- What exactly does this project do?
- What is its underlying architecture?
- What are the major components?
- How does data flow through the application?
- Where is the application entry point?
- Which files implement the important functionality?
- What technologies and frameworks does it use?
- How do its components communicate?
- How do I run this project locally?
- Where should I start if I want to contribute?

### 1.3 Target Users

1. Software engineers exploring unfamiliar repositories.
2. AI/ML engineers exploring research implementations.
3. Open-source contributors onboarding to new projects.
4. Students learning from production-grade codebases.
5. Developers evaluating repositories before adopting them.

---

## 2. Platform and Compatibility

### Initial platforms

- Google Chrome.
- Brave Browser.

### Repository provider support

**MVP:**
- GitHub.com repositories.

**Future extensions:**
- GitLab.
- Bitbucket.
- Self-hosted Git platforms.
- Local Git repositories through an optional native companion application.

### Technical requirements

- Manifest V3.
- Chromium-compatible extension APIs.
- Side Panel API.
- Content scripts.
- Background service worker.
- TypeScript.
- React.
- Modern CSS or Tailwind CSS.

The extension must be installable in both Chrome and Brave without maintaining separate codebases.

---

## 3. Core Product Experience

### 3.1 Repository Detection

When a user opens a GitHub repository, the extension should automatically detect:

- Repository owner.
- Repository name.
- Current branch.
- Current commit SHA, when available.
- Repository URL.
- Current GitHub page type.
- Whether the repository is public or private, where detectable.

The extension should identify repository navigation without requiring manual input.

It must correctly handle:
- Repository landing pages.
- Source directories.
- Individual source files.
- Pull requests.
- Branch-specific URLs.

Repository identity should include owner, repository, branch and commit where available.

### 3.2 Extension Interface

The extension should open an interactive Chrome/Brave side panel.

The side panel should have five primary sections:

**A. Overview**

A concise explanation of the repository.

Display:
- Project purpose.
- Problem being solved.
- Main technologies.
- Architectural pattern.
- Important modules.
- Project execution overview.
- Key observations.

**B. Architecture**

Generate an architectural explanation of the repository.

Display:
- High-level component diagram.
- Major modules and responsibilities.
- Module dependencies.
- Communication pathways.
- Data flow.
- External integrations.

The architecture diagram should be interactive where practical.

Clicking a component should reveal:
- Its purpose.
- Important files.
- Dependencies.
- Related components.

**C. Codebase Explorer**

Present the repository as an intelligently grouped structure.

Example:

```text
my-project/
│
├── src/
│   ├── api/
│   ├── core/
│   ├── services/
│   └── utils/
│
├── tests/
├── config/
├── requirements.txt
└── README.md
```

For each important directory and file, explain:
- Its responsibility.
- Why it exists.
- What it interacts with.
- Its significance to the application.

Prioritize important files instead of generating meaningless explanations for every file.

**D. Execution Flow**

Explain how the application actually works.

For example:

```text
Application Startup
        |
        v
Configuration Loading
        |
        v
Application Initialization
        |
        v
API / Entry Point
        |
        v
Business Logic
        |
        v
Data Processing
        |
        v
Database / External Services
```

The flow must be derived from actual source code and repository evidence, not generic assumptions.

**E. Ask Repository**

Provide a conversational interface for questions about the currently analyzed repository.

Example questions:

- Explain the authentication mechanism.
- Where is database connectivity implemented?
- How does the application process a request?
- Explain the complete execution flow.
- Which files should I modify to add a new feature?
- Are there any architectural weaknesses?
- Explain this repository as if I were a beginner.

Answers should reference relevant file paths and line numbers wherever possible.

---

## 4. AI-Powered Repository Analysis Engine

This is the central component of the product.

### 4.1 Repository Acquisition

The extension should acquire repository information through supported GitHub mechanisms.

Preferred approach:

1. GitHub REST API for repository metadata and directory contents.
2. Git Trees API for recursive repository structure.
3. GitHub Contents API for selected source files.
4. Raw source retrieval for files requiring deeper analysis.
5. GitHub APIs for branch and commit information.

Use the GitHub API rather than scraping rendered HTML wherever possible.

For private repositories, support GitHub authentication through an explicitly authorized OAuth or GitHub App-based integration.

Never assume that a browser session automatically grants API access to private repository contents.

### 4.2 Repository Indexing

Before generating explanations, construct a structured repository representation.

The indexing pipeline should:

1. Retrieve repository metadata.
2. Retrieve the recursive file tree.
3. Identify programming languages.
4. Identify frameworks and dependencies.
5. Detect configuration files.
6. Identify application entry points.
7. Identify important modules.
8. Detect tests and test organization.
9. Identify external service integrations.
10. Build relationships between important components.

Identify common ecosystem files, including:

- package.json
- pyproject.toml
- requirements.txt
- Cargo.toml
- go.mod
- pom.xml
- build.gradle
- Dockerfile
- docker-compose.yml
- .env.example
- README.md
- tsconfig.json
- alembic.ini

The system should support multiple languages and must not assume that every repository is a Python or JavaScript project.

### 4.3 Intelligent File Prioritization

Avoid sending an entire large repository to an LLM.

Implement an intelligent selection mechanism based on:

- File type.
- Directory importance.
- Entry-point likelihood.
- Dependency relationships.
- Configuration relevance.
- Symbol density.
- Import relationships.
- Existing documentation.
- Test coverage.

Exclude or deprioritize:

- Binary files.
- Generated build artifacts.
- Vendor directories.
- node_modules.
- .git.
- Large lockfiles.
- Minified assets.
- Compiled output.
- Unnecessary media files.

Respect API rate limits and repository size constraints.

### 4.4 Context Construction

Construct a structured context containing:

- Repository metadata.
- Directory tree.
- Dependency graph.
- Important source files.
- Configuration information.
- Documentation.
- Identified entry points.
- Architectural relationships.

Use chunking and hierarchical summarization for large repositories.

The system should maintain traceability between generated explanations and source evidence.

### 4.5 AI Explanation Generation

Generate the following artifacts:

1. Executive project summary.
2. Technical stack analysis.
3. Architecture explanation.
4. Directory and file explanations.
5. Application execution flow.
6. Component dependency graph.
7. Development and setup instructions.
8. Important implementation observations.

Every important factual claim should have supporting repository evidence.

The AI must explicitly distinguish:
- Verified facts.
- Reasonable inferences.
- Unknown or unverified behavior.

Never invent architecture, dependencies, execution paths, or functionality.

---

## 5. AI Provider Architecture

Design the AI integration as a provider-independent abstraction.

Potential providers:

- OpenAI API.
- Google Gemini API.
- Anthropic API.
- Locally hosted models through a future integration.

The provider interface should support:

- Structured output.
- Streaming responses.
- Context-aware conversations.
- Token usage tracking.
- Error handling.
- Configurable models.

Do not tightly couple business logic to any single LLM provider.

### API key security

For the initial MVP:
- Allow users to configure their own API key.
- Store secrets using appropriate extension storage protections.
- Never expose API keys to page scripts.
- Never place secrets in content scripts or URLs.
- Never log secrets.
- Provide a clear way to remove credentials.

Do not treat Chrome extension storage as a secure vault against local machine compromise.

A backend proxy can be introduced later if shared infrastructure, centralized billing, or stronger credential isolation becomes necessary.

---

## 6. User Interface and Design Requirements

### Design philosophy

The interface should feel like a professional developer tool.

Visual direction:
- Dark-first interface.
- Minimal visual clutter.
- Excellent typography.
- Subtle borders.
- Clear visual hierarchy.
- Compact information density.
- Syntax-aware code presentation.
- Smooth transitions.
- Responsive side panel.

Avoid excessive gradients, unnecessary animations, and decorative elements.

### Main interface layout

**Header**
- RepoLens branding.
- Repository owner/name.
- Branch indicator.
- Refresh analysis button.
- Settings.

**Navigation**
- Overview.
- Architecture.
- Codebase.
- Execution Flow.
- Ask AI.

**Main content**
- Context-sensitive content.
- Expandable sections.
- File references.
- Architecture visualizations.

**Footer**
- Analysis status.
- Last analyzed commit.
- AI provider/model indicator.

### Loading experience

Show meaningful analysis stages:

1. Detecting repository.
2. Retrieving repository structure.
3. Identifying technologies.
4. Analyzing source code.
5. Constructing architecture.
6. Generating explanations.

Never display fake progress percentages.

---

## 7. Architecture and Technical Design

Implement a modular, maintainable extension architecture.

### Suggested project structure

```text
repolens/
│
├── extension/
│   ├── manifest.json
│   ├── background/
│   │   └── service-worker.ts
│   ├── content/
│   │   └── github-detector.ts
│   ├── sidepanel/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── hooks/
│   │   └── App.tsx
│   ├── popup/
│   ├── shared/
│   │   ├── types/
│   │   ├── constants/
│   │   └── utilities/
│   └── assets/
│
├── src/
│   ├── repository/
│   │   ├── github-client.ts
│   │   ├── repository-detector.ts
│   │   ├── tree-parser.ts
│   │   └── file-filter.ts
│   │
│   ├── analysis/
│   │   ├── indexer.ts
│   │   ├── file-prioritizer.ts
│   │   ├── dependency-analyzer.ts
│   │   ├── context-builder.ts
│   │   └── architecture-analyzer.ts
│   │
│   ├── ai/
│   │   ├── providers/
│   │   ├── prompts/
│   │   ├── structured-output.ts
│   │   └── explanation-engine.ts
│   │
│   ├── cache/
│   └── types/
│
├── tests/
├── docs/
├── package.json
└── README.md
```

This is a proposed organization, not a requirement to create unnecessary abstraction layers.

### Architecture principles

- Separation of UI, repository acquisition, analysis, and AI orchestration.
- Strong TypeScript typing.
- Explicit interfaces between modules.
- Dependency injection for AI providers.
- Testable business logic.
- No unnecessary backend dependency for the MVP.
- Graceful handling of API failures.
- Extensible provider and repository adapters.

### Repository analysis architecture

```text
GitHub Repository
        |
        v
Repository Detection
        |
        v
GitHub API Client
        |
        v
Repository Indexer
        |
        v
File Prioritization
        |
        v
Context Construction
        |
        v
AI Explanation Engine
        |
        v
Structured Repository Knowledge
        |
        +------> Overview
        |
        +------> Architecture
        |
        +------> Codebase Explorer
        |
        +------> Execution Flow
        |
        +------> Ask Repository
```

---

## 8. Caching and Performance

Repository analysis should not be repeated unnecessarily.

Implement caching using repository identity and commit SHA.

Cache:
- Repository metadata.
- File tree.
- File content hashes.
- File summaries.
- Architecture analysis.
- Generated explanations.

Requirements:
- Reuse analysis when the commit has not changed.
- Invalidate affected information when the commit changes.
- Support manual refresh.
- Provide a way to clear repository cache.
- Avoid unnecessary LLM calls.
- Respect storage quotas.

For the MVP, use local extension storage or IndexedDB as appropriate.

### Performance objectives

These are engineering targets, not guarantees:

- Repository detection: under 500 ms after navigation settles.
- Side panel initial render: under 1 second.
- Initial repository metadata retrieval: under 3 seconds under normal API conditions.
- Display useful initial analysis progressively rather than blocking on complete analysis.
- Support cancellation of long-running analysis.

Large repositories should use progressive indexing rather than attempting to process every file at once.

---

## 9. Security and Privacy

Treat repository contents as untrusted input.

Mandatory requirements:

1. Never execute repository code.
2. Never execute scripts retrieved from repositories.
3. Do not inject repository content as executable HTML.
4. Sanitize rendered Markdown.
5. Protect against prompt injection inside README files, comments, and source code.
6. Treat repository instructions as data, not privileged system instructions.
7. Restrict extension host permissions to necessary domains.
8. Avoid transmitting source code to AI providers without clear user awareness and consent.
9. Do not transmit repository contents to an undisclosed backend.
10. Do not expose private repository contents in logs or telemetry.

The extension must clearly disclose which files or repository information are sent to the configured AI provider.

For private repositories, authentication and data access must be explicitly authorized.

---

## 10. Error Handling

Handle the following scenarios:

- Invalid repository URL.
- Unsupported Git hosting provider.
- Private repository without authorization.
- GitHub API rate limit.
- Network interruption.
- Large repository.
- Unsupported file encoding.
- AI provider unavailable.
- Invalid AI response.
- Token limit exceeded.
- Repository deleted or inaccessible.
- Branch or commit changed during analysis.

Errors should be actionable and understandable.

Allow retrying failed analysis stages without unnecessarily restarting completed work.

---

## 11. MVP Scope

### Must Have

- Chrome and Brave compatibility.
- Manifest V3 extension.
- GitHub repository detection.
- Repository metadata retrieval.
- Recursive file tree analysis.
- Programming language and dependency detection.
- Intelligent file prioritization.
- AI-generated project overview.
- Architecture explanation.
- Codebase explorer.
- Execution flow explanation.
- Repository Q&A.
- Source file references.
- Basic local caching.
- User-configurable AI provider.
- Basic security and privacy controls.

### Should Have

- Interactive architecture diagrams.
- Component dependency visualization.
- Streaming AI responses.
- Branch and commit-aware cache invalidation.
- Markdown rendering.
- Analysis progress indicators.
- Export repository explanation as Markdown.

### Won't Have in MVP

- Autonomous code modification.
- Git commits or pull request creation.
- Code execution or terminal access.
- Full IDE integration.
- Multi-repository knowledge graph.
- Automated vulnerability scanning.
- Continuous background repository monitoring.
- Full GitLab and Bitbucket support.

---

## 12. Acceptance Criteria

The MVP is considered complete when:

**AC-01:** Opening a GitHub repository correctly identifies its owner, repository name, and branch.

**AC-02:** The extension opens its side panel and displays repository-specific information.

**AC-03:** The repository tree is retrieved and analyzed without attempting to download unnecessary binary or generated files.

**AC-04:** The extension identifies major technologies and relevant configuration files.

**AC-05:** The overview accurately explains the repository's purpose and major components.

**AC-06:** The architecture section identifies major modules and provides source-backed explanations.

**AC-07:** The execution flow is derived from source evidence and distinguishes verified behavior from inference.

**AC-08:** Users can ask contextual questions about the repository.

**AC-09:** AI responses provide clickable references to relevant GitHub source files and line ranges where available.

**AC-10:** Reopening an unchanged repository reuses cached analysis.

**AC-11:** Changing the branch or commit does not silently reuse stale analysis.

**AC-12:** The extension handles private repositories only after explicit authorization.

**AC-13:** The extension does not execute source code from repositories.

**AC-14:** All major workflows work in both Chrome and Brave.

**AC-15:** Unit tests, integration tests, and extension build validation pass.

---

## 13. Testing Strategy

Implement tests at multiple levels.

### Unit tests
- Repository URL parser.
- File filtering.
- Tree parser.
- Language detection.
- File prioritization.
- Context construction.
- Dependency extraction.
- AI response validation.
- Cache invalidation.

### Integration tests
- GitHub API client.
- Repository indexing pipeline.
- AI provider abstraction.
- Repository analysis orchestration.
- Side panel data flow.

### Browser tests
- Chrome extension loading.
- Brave compatibility.
- GitHub navigation detection.
- Side panel lifecycle.
- Authentication handling.
- Error states.
- Large repository handling.

Use representative test repositories with different stacks:

- Python backend.
- TypeScript/React application.
- Go application.
- Rust application.
- Monorepo.

Do not validate the product against a single technology stack.

---

## 14. Implementation Milestones

### Phase 1 — Extension Foundation
- Set up TypeScript and React.
- Configure Manifest V3.
- Implement background service worker.
- Implement GitHub repository detection.
- Implement side panel.
- Establish Chrome and Brave compatibility.

### Phase 2 — Repository Intelligence
- Implement GitHub API client.
- Retrieve repository metadata and file tree.
- Implement filtering and prioritization.
- Detect languages, frameworks, and dependencies.
- Build repository context.

### Phase 3 — AI Explanation Engine
- Implement provider abstraction.
- Build structured prompting system.
- Generate project overview.
- Generate architecture explanations.
- Generate execution flow.
- Implement repository Q&A.

### Phase 4 — User Experience
- Build Overview.
- Build Architecture.
- Build Codebase Explorer.
- Build Execution Flow.
- Build Ask Repository.
- Implement loading, errors, and streaming.

### Phase 5 — Optimization and Hardening
- Implement caching.
- Add commit-aware invalidation.
- Implement security controls.
- Add comprehensive tests.
- Validate Chrome and Brave.
- Prepare installation documentation.

---

## 15. Definition of Done

The product must be delivered as:

1. Complete extension source code.
2. Reproducible development environment.
3. Production extension build.
4. Installation instructions for Chrome.
5. Installation instructions for Brave.
6. Environment configuration documentation.
7. AI provider configuration documentation.
8. Architecture documentation.
9. Test suite and test execution instructions.
10. Known limitations and future roadmap.

The extension must be loadable locally through Chromium's Developer Mode using the generated build directory.

---

## 16. Future Roadmap

Potential extensions after MVP:

- GitLab and Bitbucket support.
- Local repository support through a native companion.
- Repository comparison.
- Pull request architecture impact analysis.
- Code change explanations.
- Technical debt identification.
- Test coverage mapping.
- Interactive call graphs.
- Multi-repository dependency analysis.
- Agentic codebase exploration.
- Exportable technical documentation.

---

## 17. Product Success Metrics

Track measurable indicators:

- Time from repository opening to useful initial explanation.
- Percentage of repositories successfully analyzed.
- Accuracy of identified entry points.
- Accuracy of dependency relationships.
- Percentage of AI claims with source evidence.
- Repository Q&A usefulness.
- Cache hit rate.
- Average LLM tokens consumed per repository.
- Analysis failure rate.

Do not optimize solely for response speed. Repository understanding and factual grounding are the primary quality metrics.

---

## 18. Final Product Principle

RepoLens is not another AI chatbot attached to GitHub.

It is a repository intelligence layer that constructs a structured understanding of a codebase and exposes that understanding through an intuitive browser interface.

The central objective is simple:

**A developer should be able to open an unfamiliar repository and understand its purpose, architecture, internal organization, and execution flow within minutes.**
