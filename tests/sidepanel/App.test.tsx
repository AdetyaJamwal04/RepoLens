import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { App } from '../../src/sidepanel/App';
import { Header } from '../../src/sidepanel/components/Header';
import { OverviewTab } from '../../src/sidepanel/components/OverviewTab';
import { ArchitectureTab } from '../../src/sidepanel/components/ArchitectureTab';
import { CodebaseExplorerTab } from '../../src/sidepanel/components/CodebaseExplorerTab';
import { ExecutionFlowTab } from '../../src/sidepanel/components/ExecutionFlowTab';
import { AskRepositoryTab } from '../../src/sidepanel/components/AskRepositoryTab';
import { SettingsModal } from '../../src/sidepanel/components/SettingsModal';
import { buildGitHubFileUrl, sanitizeExternalUrl } from '../../src/sidepanel/utils';
import { RepoIdentity } from '../../src/core/github/url-parser';
import { RateLimitError } from '../../src/core/github/client';
import { RepoIndex } from '../../src/core/indexer/indexer';
import {
  ArchitectureOutput,
  CodebaseExplorerOutput,
  OverviewOutput,
} from '../../src/core/ai/types';
import { SettingsStore, UserSettings } from '../../src/core/storage/settings';
import { RepoCache } from '../../src/core/storage/cache';

const sampleIdentity: RepoIdentity = {
  owner: 'facebook',
  repo: 'react',
  branch: 'main',
  commitSha: 'abc1234def56789012345678901234567890abcd',
  pageType: 'repo_root',
};

const sampleIndex: RepoIndex = {
  identity: sampleIdentity,
  defaultBranch: 'main',
  commitSha: 'abc1234def56789012345678901234567890abcd',
  languages: ['TypeScript', 'JavaScript'],
  manifests: ['package.json'],
  candidateEntryPoints: ['src/index.ts'],
  prioritizedFiles: ['package.json', 'src/index.ts'],
  treeOutline: 'src/\n  index.ts\npackage.json',
};

const sampleOverview: OverviewOutput = {
  purpose: 'A declarative library for building user interfaces.',
  technologies: [
    {
      name: 'React',
      category: 'Frameworks',
      evidence: {
        filePath: 'package.json',
        lineStart: 2,
        lineEnd: 5,
        commitSha: 'abc1234',
        type: 'manifest',
        confidence: 'verified',
      },
    },
    {
      name: 'TypeScript',
      category: 'Languages',
      evidence: {
        filePath: 'tsconfig.json',
        commitSha: 'abc1234',
        type: 'config',
        confidence: 'verified',
      },
    },
  ],
  keyModules: [
    {
      name: 'Reconciler',
      path: 'packages/react-reconciler/src/ReactFiberWorkLoop.js',
      description: 'Schedules and commits fiber tree updates.',
    },
  ],
  executionSummary: 'Initializes root fiber and schedules state-driven renders.',
  observations: ['Monorepo managed with workspaces'],
};

const sampleArchitecture: ArchitectureOutput = {
  pattern: 'Component-Based Fiber Architecture',
  components: [
    {
      id: 'reconciler',
      name: 'Fiber Reconciler',
      responsibility: 'Computes minimal diffs between virtual trees.',
      importantFiles: ['packages/react-reconciler/src/ReactFiberWorkLoop.js'],
      dependencies: ['scheduler'],
    },
    {
      id: 'scheduler',
      name: 'Task Scheduler',
      responsibility: 'Prioritizes cooperative rendering work.',
      importantFiles: ['packages/scheduler/src/forks/Scheduler.js'],
      dependencies: [],
    },
  ],
  dataFlow: ['State update enqueued', 'Reconciler diffs fiber tree', 'Renderer commits DOM mutations'],
  externalIntegrations: ['Browser DOM API'],
  executionFlow: [
    {
      stepNumber: 1,
      title: 'Create Root Container',
      description: 'Creates the FiberRootNode and attaches event delegation.',
      sourceReference: {
        filePath: 'packages/react-dom/src/client/ReactDOMRoot.js',
        lineStart: 10,
        lineEnd: 25,
        commitSha: 'abc1234',
        type: 'source',
        confidence: 'verified',
      },
      confidence: 'verified',
    },
    {
      stepNumber: 2,
      title: 'Schedule Initial Render',
      description: 'Enqueues the root element tree into the work loop.',
      sourceReference: {
        filePath: 'packages/react-reconciler/src/ReactFiberWorkLoop.js',
        commitSha: 'abc1234',
        type: 'source',
        confidence: 'inferred',
      },
      confidence: 'inferred',
    },
  ],
};

const sampleExplorer: CodebaseExplorerOutput = {
  entries: [
    {
      path: 'packages/react-reconciler',
      type: 'dir',
      significance: 'critical',
      responsibility: 'Core fiber reconciliation engine',
      reason: 'Implements concurrent scheduling and state updates',
    },
    {
      path: 'package.json',
      type: 'file',
      significance: 'important',
      responsibility: 'Workspace manifest and scripts',
      reason: 'Defines dependencies and build tooling',
    },
    {
      path: 'scripts/release/prepare.js',
      type: 'file',
      significance: 'supporting',
      responsibility: 'Release automation helper',
      reason: 'Used during package publishing only',
    },
  ],
};

const defaultSettings: UserSettings = {
  aiProvider: 'gemini',
  geminiModel: 'gemini-1.5-flash',
  openaiModel: 'gpt-4o-mini',
};

describe('Sidepanel App & Components', () => {
  it('renders Header and empty state when no repo is detected', () => {
    const html = renderToString(<App initialIdentity={null} />);
    expect(html).toContain('RepoLens');
    expect(html).toContain('Navigate to a GitHub repository to begin analysis');
    expect(html).toContain('Settings');
  });

  it('renders active repo header, branch badge, status, and all five tabs', () => {
    const html = renderToString(
      <App
        initialIdentity={sampleIdentity}
        initialStatus="ready"
        initialIndex={sampleIndex}
        initialOverview={sampleOverview}
        initialArchitecture={sampleArchitecture}
        initialExplorer={sampleExplorer}
      />
    );

    expect(html).toContain('facebook/react');
    expect(html).toContain('main');
    expect(html).toContain('abc1234');
    expect(html).toContain('Overview');
    expect(html).toContain('Architecture');
    expect(html).toContain('Explorer');
    expect(html).toContain('Flow');
    expect(html).toContain('Ask AI');
  });

  it('renders Header statuses and controls properly', () => {
    const html = renderToString(
      <Header
        identity={sampleIdentity}
        defaultBranch="main"
        commitSha="abc1234"
        status="analyzing"
        stageMessage="Generating overview..."
        onAnalyze={() => {}}
        onOpenSettings={() => {}}
      />
    );
    expect(html).toContain('RepoLens');
    expect(html).toContain('facebook/react');
    expect(html).toContain('analyzing');
    expect(html).toContain('Generating overview...');
  });

  it('renders OverviewTab with purpose, categorized technologies, modules, and observations', () => {
    const html = renderToString(
      <OverviewTab
        overview={sampleOverview}
        owner="facebook"
        repo="react"
        gitRef="abc1234"
        status="ready"
      />
    );

    expect(html).toContain(sampleOverview.purpose);
    expect(html).toContain('Frameworks');
    expect(html).toContain('Languages');
    expect(html).toContain('React');
    expect(html).toContain('TypeScript');
    expect(html).toContain('Reconciler');
    expect(html).toContain(sampleOverview.executionSummary);
    expect(html).toContain('Monorepo managed with workspaces');
    expect(html).toContain('https://github.com/facebook/react/blob/abc1234/package.json#L2-L5');
  });

  it('renders ArchitectureTab with pattern badge, component cards, data flow, and integrations', () => {
    const html = renderToString(
      <ArchitectureTab
        architecture={sampleArchitecture}
        owner="facebook"
        repo="react"
        gitRef="abc1234"
        status="ready"
      />
    );

    expect(html).toContain('Component-Based Fiber Architecture');
    expect(html).toContain('Fiber Reconciler');
    expect(html).toContain('reconciler');
    expect(html).toContain('scheduler');
    expect(html).toContain('State update enqueued');
    expect(html).toContain('Browser DOM API');
    expect(html).toContain(
      'https://github.com/facebook/react/blob/abc1234/packages/react-reconciler/src/ReactFiberWorkLoop.js'
    );
  });

  it('renders CodebaseExplorerTab with significance badges, roles, and GitHub links', () => {
    const html = renderToString(
      <CodebaseExplorerTab
        explorer={sampleExplorer}
        owner="facebook"
        repo="react"
        gitRef="abc1234"
        treeOutline={sampleIndex.treeOutline}
        status="ready"
      />
    );

    expect(html).toContain('packages/react-reconciler');
    expect(html).toContain('critical');
    expect(html).toContain('important');
    expect(html).toContain('supporting');
    expect(html).toContain('Core fiber reconciliation engine');
    expect(html).toContain('Implements concurrent scheduling and state updates');
    expect(html).toContain('https://github.com/facebook/react/tree/abc1234/packages/react-reconciler');
    expect(html).toContain('https://github.com/facebook/react/blob/abc1234/package.json');
  });

  it('renders ExecutionFlowTab with numbered steps, verified/inferred badges, and line-range links', () => {
    const html = renderToString(
      <ExecutionFlowTab
        steps={sampleArchitecture.executionFlow}
        owner="facebook"
        repo="react"
        commitSha="abc1234"
        status="ready"
      />
    );

    expect(html).toContain('Create Root Container');
    expect(html).toContain('Schedule Initial Render');
    expect(html).toContain('verified');
    expect(html).toContain('inferred');
    expect(html).toContain(
      'https://github.com/facebook/react/blob/abc1234/packages/react-dom/src/client/ReactDOMRoot.js#L10-L25'
    );
  });

  it('renders AskRepositoryTab with quick-question chips, citations, and XSS-safe markdown', () => {
    const html = renderToString(
      <AskRepositoryTab
        repoIndex={sampleIndex}
        overview={sampleOverview}
        architecture={sampleArchitecture}
        settings={{ ...defaultSettings, geminiApiKey: 'test-key' }}
        gitRef="abc1234"
        onOpenSettings={() => {}}
        messages={[
          { role: 'user', content: 'Where is the entry point?' },
          {
            role: 'assistant',
            content:
              'Check `src/index.ts#L1-L10` and avoid [bad link](javascript:alert(1)).',
          },
        ]}
      />
    );

    expect(html).toContain('How do I run this locally?');
    expect(html).toContain('Where is authentication handled?');
    expect(html).toContain('What are the entry points?');
    expect(html).toContain('Send');
    expect(html).toContain('https://github.com/facebook/react/blob/abc1234/src/index.ts#L1-L10');
    expect(html).not.toContain('javascript:alert(1)');
  });

  it('renders SettingsModal with PAT, AI provider options, model defaults, and Clear Cache', () => {
    const html = renderToString(
      <SettingsModal
        isOpen={true}
        settings={defaultSettings}
        settingsStore={new SettingsStore()}
        repoCache={new RepoCache()}
        onClose={() => {}}
        onSaved={() => {}}
      />
    );

    expect(html).toContain('GitHub Personal Access Token');
    expect(html).toContain('Google Gemini');
    expect(html).toContain('OpenAI');
    expect(html).toContain('gemini-1.5-flash');
    expect(html).toContain('gpt-4o-mini');
    expect(html).toContain('Clear Cache');
    expect(html).toContain('Save');
    expect(html).toContain('Cancel');
  });

  it('renders missing API key warning banner and rate limit error banner in App', () => {
    const missingKeyHtml = renderToString(
      <App initialIdentity={sampleIdentity} initialMissingApiKeyWarning={true} />
    );
    expect(missingKeyHtml).toContain('Configure API Key');

    const rateLimitHtml = renderToString(
      <App
        initialIdentity={sampleIdentity}
        initialStatus="error"
        initialRateLimitError={new RateLimitError('API rate limit exceeded', 0, 1700003600)}
      />
    );
    expect(rateLimitHtml).toContain('Add GitHub Token');
    expect(rateLimitHtml).toContain('rate limit');
  });

  it('builds safe GitHub URLs and rejects unsafe schemes', () => {
    expect(
      buildGitHubFileUrl({
        owner: 'facebook',
        repo: 'react',
        ref: 'abc1234',
        filePath: 'src/index.ts',
        lineStart: 10,
        lineEnd: 20,
      })
    ).toBe('https://github.com/facebook/react/blob/abc1234/src/index.ts#L10-L20');

    expect(
      buildGitHubFileUrl({
        owner: 'facebook',
        repo: 'react',
        ref: 'feat/ui',
        filePath: 'src/my file.ts',
        lineStart: 5,
      })
    ).toBe('https://github.com/facebook/react/blob/feat/ui/src/my%20file.ts#L5');

    expect(sanitizeExternalUrl('javascript:alert(1)')).toBeNull();
    expect(sanitizeExternalUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(sanitizeExternalUrl('https://github.com/facebook/react')).toBe(
      'https://github.com/facebook/react'
    );
  });
});
