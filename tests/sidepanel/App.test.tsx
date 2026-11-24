import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import type { Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { App, ErrorBoundary, buildCachedRepoIndex, fetchBoundedContents } from '../../src/sidepanel/App';
import { Header } from '../../src/sidepanel/components/Header';
import { OverviewTab } from '../../src/sidepanel/components/OverviewTab';
import { ArchitectureTab } from '../../src/sidepanel/components/ArchitectureTab';
import { CodebaseExplorerTab } from '../../src/sidepanel/components/CodebaseExplorerTab';
import { ExecutionFlowTab } from '../../src/sidepanel/components/ExecutionFlowTab';
import { AskRepositoryTab } from '../../src/sidepanel/components/AskRepositoryTab';
import { SettingsModal } from '../../src/sidepanel/components/SettingsModal';
import { buildGitHubFileUrl, sanitizeExternalUrl } from '../../src/sidepanel/utils';
import { RepoIdentity } from '../../src/core/github/url-parser';
import { GitHubClient, RateLimitError } from '../../src/core/github/client';
import { RepoIndex } from '../../src/core/indexer/indexer';
import {
  ArchitectureOutput,
  ChatMessage,
  CodebaseExplorerOutput,
  OverviewOutput,
} from '../../src/core/ai/types';
import { SettingsStore, UserSettings } from '../../src/core/storage/settings';
import { RepoCache } from '../../src/core/storage/cache';

// Lightweight in-memory DOM shim for exercising React 19 createRoot & events without jsdom
class FakeNode {
  nodeType: number;
  nodeName: string;
  childNodes: FakeNode[] = [];
  parentNode: FakeNode | null = null;
  listeners = new Map<string, Set<(evt: FakeEvent) => void>>();
  captureListeners = new Map<string, Set<(evt: FakeEvent) => void>>();
  attributes = new Map<string, string>();
  style: Record<string, string> = {};
  _value = '';
  _checked = false;
  _data = '';
  disabled = false;

  constructor(nodeType: number, nodeName: string) {
    this.nodeType = nodeType;
    this.nodeName = nodeName;
  }

  get ownerDocument() {
    return fakeDoc;
  }
  get firstChild() {
    return this.childNodes[0] ?? null;
  }
  get lastChild() {
    return this.childNodes[this.childNodes.length - 1] ?? null;
  }
  get nextSibling(): FakeNode | null {
    if (!this.parentNode) return null;
    const idx = this.parentNode.childNodes.indexOf(this);
    return this.parentNode.childNodes[idx + 1] ?? null;
  }
  get textContent(): string {
    if (this.nodeType === 3 || this.nodeType === 8) return this._data;
    return this.childNodes.map((c) => c.textContent).join('');
  }
  set textContent(val: string) {
    if (this.nodeType === 3 || this.nodeType === 8) {
      this._data = String(val);
      return;
    }
    this.childNodes = [];
    if (val !== '' && val !== null && val !== undefined) {
      this.appendChild(fakeDoc.createTextNode(String(val)));
    }
  }
  get nodeValue() {
    return this._data;
  }
  set nodeValue(val: string) {
    this._data = String(val);
  }
  appendChild(child: FakeNode) {
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }
  insertBefore(child: FakeNode, ref: FakeNode | null) {
    if (!ref) return this.appendChild(child);
    if (child.parentNode) child.parentNode.removeChild(child);
    const idx = this.childNodes.indexOf(ref);
    child.parentNode = this;
    if (idx === -1) this.childNodes.push(child);
    else this.childNodes.splice(idx, 0, child);
    return child;
  }
  removeChild(child: FakeNode) {
    const idx = this.childNodes.indexOf(child);
    if (idx !== -1) {
      this.childNodes.splice(idx, 1);
      child.parentNode = null;
    }
    return child;
  }
  contains(other: FakeNode | null) {
    let cur = other;
    while (cur) {
      if (cur === this) return true;
      cur = cur.parentNode;
    }
    return false;
  }
  setAttribute(k: string, v: string) {
    this.attributes.set(k, String(v));
    if (k === 'disabled') this.disabled = true;
  }
  getAttribute(k: string) {
    return this.attributes.has(k) ? this.attributes.get(k)! : null;
  }
  removeAttribute(k: string) {
    this.attributes.delete(k);
    if (k === 'disabled') this.disabled = false;
  }
  hasAttribute(k: string) {
    return this.attributes.has(k);
  }
  addEventListener(type: string, fn: (evt: FakeEvent) => void, opts?: boolean | { capture?: boolean }) {
    const cap = typeof opts === 'boolean' ? opts : Boolean(opts?.capture);
    const map = cap ? this.captureListeners : this.listeners;
    const set = map.get(type) ?? new Set();
    set.add(fn);
    map.set(type, set);
  }
  removeEventListener(type: string, fn: (evt: FakeEvent) => void, opts?: boolean | { capture?: boolean }) {
    const cap = typeof opts === 'boolean' ? opts : Boolean(opts?.capture);
    (cap ? this.captureListeners : this.listeners).get(type)?.delete(fn);
  }
  dispatchEvent(evt: FakeEvent) {
    evt.target = evt.target ?? this;
    const chain: FakeNode[] = [];
    let cur: FakeNode | null = this;
    while (cur) {
      chain.push(cur);
      cur = cur.parentNode;
    }
    for (let i = chain.length - 1; i >= 0; i--) {
      evt.currentTarget = chain[i];
      const fns = chain[i].captureListeners.get(evt.type);
      if (fns) for (const fn of [...fns]) fn(evt);
      if (evt.cancelBubble) return !evt.defaultPrevented;
    }
    for (let i = 0; i < chain.length; i++) {
      if (i > 0 && !evt.bubbles) break;
      evt.currentTarget = chain[i];
      const fns = chain[i].listeners.get(evt.type);
      if (fns) for (const fn of [...fns]) fn(evt);
      if (evt.cancelBubble) break;
    }
    return !evt.defaultPrevented;
  }
}

class FakeElement extends FakeNode {
  tagName: string;
  type: string;
  oninput: null = null;

  constructor(tag: string) {
    super(1, tag.toUpperCase());
    this.tagName = tag.toUpperCase();
    this.type = this.tagName === 'INPUT' ? 'text' : '';
  }

  get value() {
    return this._value;
  }
  set value(v: string) {
    this._value = String(v ?? '');
  }
  get checked() {
    return this._checked;
  }
  set checked(v: boolean) {
    this._checked = Boolean(v);
  }
  focus() {
    fakeDoc.activeElement = this;
  }
  blur() {}
}

class FakeEvent {
  type: string;
  bubbles: boolean;
  cancelable: boolean;
  defaultPrevented = false;
  cancelBubble = false;
  target: FakeNode | null = null;
  currentTarget: FakeNode | null = null;

  constructor(type: string, opts: { bubbles?: boolean; cancelable?: boolean } = {}) {
    this.type = type;
    this.bubbles = Boolean(opts.bubbles);
    this.cancelable = Boolean(opts.cancelable);
  }
  preventDefault() {
    this.defaultPrevented = true;
  }
  stopPropagation() {
    this.cancelBubble = true;
  }
}

const fakeDoc = new FakeNode(9, '#document') as FakeNode & {
  oninput: null;
  defaultView: typeof globalThis;
  documentElement: FakeElement;
  body: FakeElement;
  activeElement: FakeElement | null;
  createElement: (tag: string) => FakeElement;
  createElementNS: (_ns: string, tag: string) => FakeElement;
  createTextNode: (t: string) => FakeNode;
  createComment: (t: string) => FakeNode;
};
fakeDoc.oninput = null;
fakeDoc.defaultView = globalThis;
fakeDoc.documentElement = new FakeElement('html');
fakeDoc.body = new FakeElement('body');
fakeDoc.activeElement = fakeDoc.body;
fakeDoc.appendChild(fakeDoc.documentElement);
fakeDoc.documentElement.appendChild(fakeDoc.body);
fakeDoc.createElement = (tag: string) => new FakeElement(tag);
fakeDoc.createElementNS = (_ns: string, tag: string) => new FakeElement(tag);
fakeDoc.createTextNode = (t: string) => {
  const n = new FakeNode(3, '#text');
  n._data = String(t);
  return n;
};
fakeDoc.createComment = (t: string) => {
  const n = new FakeNode(8, '#comment');
  n._data = String(t);
  return n;
};

function findElements(root: FakeNode, predicate: (el: FakeElement) => boolean): FakeElement[] {
  const matches: FakeElement[] = [];
  for (const child of root.childNodes) {
    if (child instanceof FakeElement) {
      if (predicate(child)) matches.push(child);
      matches.push(...findElements(child, predicate));
    }
  }
  return matches;
}

function clickElement(el: FakeElement) {
  el.dispatchEvent(new FakeEvent('click', { bubbles: true, cancelable: true }));
}

function setInputValue(el: FakeElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(FakeElement.prototype, 'value');
  descriptor?.set?.call(el, value);
  el.dispatchEvent(new FakeEvent('input', { bubbles: true }));
  el.dispatchEvent(new FakeEvent('change', { bubbles: true }));
}

async function flushAsync(turns: number = 8) {
  for (let i = 0; i < turns; i++) {
    await Promise.resolve();
  }
}

const sampleIdentity: RepoIdentity = {
  owner: 'facebook',
  repo: 'react',
  branch: 'main',
  commitSha: 'abc1234def56789012345678901234567890abcd',
  pageType: 'repo_root',
};

const secondIdentity: RepoIdentity = {
  owner: 'vercel',
  repo: 'next.js',
  branch: 'canary',
  commitSha: 'def56789012345678901234567890abcdef12345',
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

const secondIndex: RepoIndex = {
  identity: secondIdentity,
  defaultBranch: 'canary',
  commitSha: 'def56789012345678901234567890abcdef12345',
  languages: ['TypeScript'],
  manifests: ['package.json'],
  candidateEntryPoints: ['packages/next/src/server/next.ts'],
  prioritizedFiles: ['package.json', 'packages/next/src/server/next.ts'],
  treeOutline: 'packages/\n  next/\npackage.json',
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
  let createRootFn: (container: Element) => Root;
  const windowListeners = new Map<string, Set<(evt: FakeEvent) => void>>();
  const globalKeys = [
    'window',
    'document',
    'IS_REACT_ACT_ENVIRONMENT',
    'HTMLElement',
    'HTMLInputElement',
    'HTMLTextAreaElement',
    'HTMLIFrameElement',
    'Node',
    'Event',
    'addEventListener',
    'removeEventListener',
  ] as const;
  const previousGlobals = new Map<string, { had: boolean; value: unknown }>();

  beforeAll(async () => {
    for (const key of globalKeys) {
      previousGlobals.set(key, {
        had: Object.prototype.hasOwnProperty.call(globalThis, key),
        value: (globalThis as Record<string, unknown>)[key],
      });
    }

    Object.assign(globalThis, {
      window: globalThis,
      document: fakeDoc,
      IS_REACT_ACT_ENVIRONMENT: true,
      HTMLElement: FakeElement,
      HTMLInputElement: FakeElement,
      HTMLTextAreaElement: FakeElement,
      HTMLIFrameElement: class {},
      Node: FakeNode,
      Event: FakeEvent,
      addEventListener: (type: string, fn: (evt: FakeEvent) => void) => {
        const set = windowListeners.get(type) ?? new Set();
        set.add(fn);
        windowListeners.set(type, set);
      },
      removeEventListener: (type: string, fn: (evt: FakeEvent) => void) => {
        windowListeners.get(type)?.delete(fn);
      },
    });
    const client = await import('react-dom/client');
    createRootFn = client.createRoot;
  });

  afterAll(() => {
    windowListeners.clear();
    for (const key of globalKeys) {
      const prev = previousGlobals.get(key);
      if (prev?.had) {
        (globalThis as Record<string, unknown>)[key] = prev.value;
      } else {
        delete (globalThis as Record<string, unknown>)[key];
      }
    }
  });

  beforeEach(async () => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    await new RepoCache().clear();
    await new SettingsStore().clearSettings();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    fakeDoc.body.childNodes = [];
  });

  function mount(node: React.ReactElement) {
    const container = fakeDoc.createElement('div');
    fakeDoc.body.appendChild(container);
    const root = createRootFn(container as unknown as Element);
    act(() => {
      root.render(node);
    });
    return {
      container,
      rerender: (next: React.ReactElement) => {
        act(() => {
          root.render(next);
        });
      },
      unmount: () => {
        act(() => {
          root.unmount();
        });
      },
    };
  }

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

  it('switches between all five tabs interactively on click', () => {
    const { container, unmount } = mount(
      <App
        initialIdentity={sampleIdentity}
        initialStatus="ready"
        initialIndex={sampleIndex}
        initialOverview={sampleOverview}
        initialArchitecture={sampleArchitecture}
        initialExplorer={sampleExplorer}
      />
    );

    expect(container.textContent).toContain('Project Purpose');

    const findTab = (ariaLabel: string) =>
      findElements(
        container,
        (el) => el.getAttribute('role') === 'tab' && el.getAttribute('aria-label') === ariaLabel
      )[0];

    act(() => clickElement(findTab('Architecture')));
    expect(container.textContent).toContain('Component-Based Fiber Architecture');
    expect(container.textContent).toContain('Fiber Reconciler');

    act(() => clickElement(findTab('Codebase Explorer')));
    expect(container.textContent).toContain('packages/react-reconciler');
    expect(container.textContent).toContain('Core fiber reconciliation engine');

    act(() => clickElement(findTab('Execution Flow')));
    expect(container.textContent).toContain('Create Root Container');

    act(() => clickElement(findTab('Ask Repository')));
    expect(container.textContent).toContain('How do I run this locally?');

    unmount();
  });

  it('toggles Settings modal, switches provider, and persists updated settings on Save', async () => {
    const { container, unmount } = mount(<App initialIdentity={sampleIdentity} />);

    await act(async () => {
      await flushAsync();
    });

    const settingsBtn = findElements(
      container,
      (el) => el.tagName === 'BUTTON' && el.getAttribute('aria-label') === 'Settings'
    )[0];
    expect(settingsBtn).toBeDefined();

    act(() => clickElement(settingsBtn));
    expect(container.textContent).toContain('RepoLens Settings');

    const cancelBtn = findElements(
      container,
      (el) => el.tagName === 'BUTTON' && el.textContent.trim() === 'Cancel'
    )[0];
    act(() => clickElement(cancelBtn));
    expect(container.textContent).not.toContain('RepoLens Settings');

    // Reopen, choose OpenAI, set API key, and submit
    act(() => clickElement(settingsBtn));
    const openaiBtn = findElements(
      container,
      (el) => el.tagName === 'BUTTON' && el.textContent.includes('OpenAI')
    )[0];
    act(() => clickElement(openaiBtn));

    const openaiKeyInput = findElements(
      container,
      (el) => el.getAttribute('id') === 'openai-key-input'
    )[0];
    act(() => setInputValue(openaiKeyInput, 'sk-interactive-test'));

    const dialog = findElements(container, (el) => el.getAttribute('role') === 'dialog')[0];
    const form = findElements(dialog, (el) => el.tagName === 'FORM')[0];
    await act(async () => {
      form.dispatchEvent(new FakeEvent('submit', { bubbles: true, cancelable: true }));
      await flushAsync();
    });

    expect(container.textContent).not.toContain('RepoLens Settings');
    expect(container.textContent).toContain('OpenAI');

    const saved = await new SettingsStore().getSettings();
    expect(saved.aiProvider).toBe('openai');
    expect(saved.openaiApiKey).toBe('sk-interactive-test');

    unmount();
  });

  it('shows Configure API Key warning when Analyze is clicked without an API key, and surfaces RateLimitError when GitHub hits 403', async () => {
    const { container, unmount } = mount(<App initialIdentity={sampleIdentity} />);

    await act(async () => {
      await flushAsync();
    });

    const analyzeBtn = findElements(
      container,
      (el) => el.tagName === 'BUTTON' && el.textContent.includes('Analyze')
    )[0];
    act(() => clickElement(analyzeBtn));
    expect(container.textContent).toContain('AI API Key Required');
    expect(container.textContent).toContain('Configure API Key');
    unmount();

    // Now configure API key and mock GitHub API returning 403 rate limit during file fetch
    await new SettingsStore().saveSettings({
      aiProvider: 'gemini',
      geminiApiKey: 'test-gemini-key',
    });

    const fetchMock = vi.fn(async (url: string): Promise<unknown> => {
      if (url.endsWith('/repos/facebook/react')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({
            owner: { login: 'facebook' },
            name: 'react',
            default_branch: 'main',
            description: null,
            private: false,
            language: 'JavaScript',
          }),
        };
      }
      if (url.includes('/git/trees/')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({
            sha: 'tree1234',
            truncated: false,
            tree: [
              { path: 'README.md', mode: '100644', type: 'blob', sha: 's1' },
              { path: 'package.json', mode: '100644', type: 'blob', sha: 's2' },
            ],
          }),
        };
      }
      return {
        ok: false,
        status: 403,
        headers: new Headers({
          'x-ratelimit-remaining': '0',
          'x-ratelimit-reset': '1700003600',
        }),
        json: async () => ({ message: 'API rate limit exceeded' }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    const mounted = mount(<App initialIdentity={sampleIdentity} />);
    await act(async () => {
      await flushAsync();
    });

    const analyzeBtn2 = findElements(
      mounted.container,
      (el) => el.tagName === 'BUTTON' && el.textContent.includes('Analyze')
    )[0];

    await act(async () => {
      clickElement(analyzeBtn2);
      await flushAsync(15);
    });

    expect(mounted.container.textContent).toContain('GitHub API rate limit exceeded');
    expect(mounted.container.textContent).toContain('Add GitHub Token');
    mounted.unmount();
  });

  it('fetchBoundedContents rethrows RateLimitError instead of swallowing rejected promises', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('README.md')) {
          return {
            ok: true,
            status: 200,
            headers: new Headers(),
            text: async () => '# Hello',
          };
        }
        return {
          ok: false,
          status: 403,
          headers: new Headers({ 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1700003600' }),
          json: async () => ({ message: 'API rate limit exceeded' }),
        };
      })
    );

    const client = new GitHubClient();
    await expect(
      fetchBoundedContents(client, 'facebook', 'react', ['README.md', 'package.json'], 'main')
    ).rejects.toThrowError(RateLimitError);
  });

  it('hydrates repoIndex when loading cached commit analysis so Q&A and Tree Outline work immediately', async () => {
    const cache = new RepoCache();
    await cache.set('facebook', 'react', sampleIdentity.commitSha!, {
      overview: sampleOverview,
      architecture: sampleArchitecture,
      explorer: sampleExplorer,
    });

    vi.stubGlobal('chrome', {
      runtime: {
        lastError: undefined,
        sendMessage: vi.fn((_msg: unknown, cb?: (res: { repo: RepoIdentity | null }) => void) => {
          cb?.({ repo: sampleIdentity });
        }),
        onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
      },
      tabs: {
        onActivated: { addListener: vi.fn(), removeListener: vi.fn() },
        onUpdated: { addListener: vi.fn(), removeListener: vi.fn() },
      },
    });

    const { container, unmount } = mount(<App />);
    await act(async () => {
      await flushAsync(12);
    });

    expect(container.textContent).toContain('cached');
    expect(container.textContent).toContain('A declarative library for building user interfaces.');

    // Switch to Explorer tab and verify reconstructed treeOutline is available
    const explorerTab = findElements(
      container,
      (el) => el.getAttribute('role') === 'tab' && el.getAttribute('aria-label') === 'Codebase Explorer'
    )[0];
    act(() => clickElement(explorerTab));

    const outlineBtn = findElements(
      container,
      (el) => el.tagName === 'BUTTON' && el.textContent.includes('Tree Outline')
    )[0];
    expect(outlineBtn).toBeDefined();
    act(() => clickElement(outlineBtn));
    expect(container.textContent).toContain('package.json');

    // Switch to Ask AI tab and verify Q&A controls are enabled
    const askTab = findElements(
      container,
      (el) => el.getAttribute('role') === 'tab' && el.getAttribute('aria-label') === 'Ask Repository'
    )[0];
    act(() => clickElement(askTab));

    const textarea = findElements(container, (el) => el.tagName === 'TEXTAREA')[0];
    expect(textarea).toBeDefined();
    expect(textarea.disabled).toBe(false);
    expect(container.textContent).not.toContain('Analyze this repository first');

    const rebuilt = buildCachedRepoIndex(sampleIdentity, {
      commitSha: sampleIdentity.commitSha!,
      timestamp: Date.now(),
      overview: sampleOverview,
      architecture: sampleArchitecture,
      explorer: sampleExplorer,
    });
    expect(rebuilt.prioritizedFiles).toContain('package.json');
    expect(rebuilt.treeOutline).toContain('packages/');

    unmount();
  });

  it('resets local chat state and discards in-flight stream responses when switching repositories in AskRepositoryTab', async () => {
    let resolveDeferredFetch!: (res: unknown) => void;
    const deferredPromise = new Promise((resolve) => {
      resolveDeferredFetch = resolve;
    });
    vi.stubGlobal('fetch', vi.fn(() => deferredPromise));

    let activeMessages: ChatMessage[] = [];
    const onMessagesChange = vi.fn((next: ChatMessage[]) => {
      activeMessages = next;
    });

    const { container, rerender, unmount } = mount(
      <AskRepositoryTab
        repoIndex={sampleIndex}
        overview={sampleOverview}
        architecture={sampleArchitecture}
        settings={{ ...defaultSettings, geminiApiKey: 'test-key' }}
        gitRef="main"
        onOpenSettings={() => {}}
        messages={activeMessages}
        onMessagesChange={onMessagesChange}
      />
    );

    const chip = findElements(
      container,
      (el) => el.tagName === 'BUTTON' && el.textContent.includes('What are the entry points?')
    )[0];
    act(() => clickElement(chip));
    expect(container.textContent).toContain('Thinking...');
    expect(onMessagesChange).toHaveBeenCalledTimes(1);

    // Navigate to Repo B while Repo A's stream is still pending
    activeMessages = [];
    rerender(
      <AskRepositoryTab
        repoIndex={secondIndex}
        overview={null}
        architecture={null}
        settings={{ ...defaultSettings, geminiApiKey: 'test-key' }}
        gitRef="canary"
        onOpenSettings={() => {}}
        messages={activeMessages}
        onMessagesChange={onMessagesChange}
      />
    );

    expect(container.textContent).not.toContain('Thinking...');

    // Now resolve Repo A's stream response; it must NOT overwrite Repo B's state
    await act(async () => {
      resolveDeferredFetch({
        ok: true,
        status: 200,
        text: async () =>
          'data: {"candidates":[{"content":{"parts":[{"text":"Stale answer for React"}]}}]}\n',
      });
      await flushAsync(10);
    });

    expect(container.textContent).not.toContain('Stale answer for React');
    expect(onMessagesChange).toHaveBeenCalledTimes(1);
    expect(activeMessages).toEqual([]);

    unmount();
  });

  it('discards in-flight stream responses when AskRepositoryTab unmounts due to key change on repo switch', async () => {
    let resolveDeferredFetch!: (res: unknown) => void;
    const deferredPromise = new Promise((resolve) => {
      resolveDeferredFetch = resolve;
    });
    vi.stubGlobal('fetch', vi.fn(() => deferredPromise));

    let activeMessages: ChatMessage[] = [];
    const onMessagesChange = vi.fn((next: ChatMessage[]) => {
      activeMessages = next;
    });

    const { container, rerender, unmount } = mount(
      <AskRepositoryTab
        key="facebook/react:abc1234"
        repoIndex={sampleIndex}
        overview={sampleOverview}
        architecture={sampleArchitecture}
        settings={{ ...defaultSettings, geminiApiKey: 'test-key' }}
        gitRef="main"
        onOpenSettings={() => {}}
        messages={activeMessages}
        onMessagesChange={onMessagesChange}
      />
    );

    const chip = findElements(
      container,
      (el) => el.tagName === 'BUTTON' && el.textContent.includes('What are the entry points?')
    )[0];
    act(() => clickElement(chip));
    expect(container.textContent).toContain('Thinking...');
    expect(onMessagesChange).toHaveBeenCalledTimes(1);

    // Unmount Repo A's AskRepositoryTab and mount Repo B's via key change
    activeMessages = [];
    rerender(
      <AskRepositoryTab
        key="vercel/next.js:def5678"
        repoIndex={secondIndex}
        overview={null}
        architecture={null}
        settings={{ ...defaultSettings, geminiApiKey: 'test-key' }}
        gitRef="canary"
        onOpenSettings={() => {}}
        messages={activeMessages}
        onMessagesChange={onMessagesChange}
      />
    );

    await act(async () => {
      resolveDeferredFetch({
        ok: true,
        status: 200,
        text: async () =>
          'data: {"candidates":[{"content":{"parts":[{"text":"Unmounted stale stream"}]}}]}\n',
      });
      await flushAsync(10);
    });

    expect(container.textContent).not.toContain('Unmounted stale stream');
    expect(onMessagesChange).toHaveBeenCalledTimes(1);
    expect(activeMessages).toEqual([]);

    unmount();
  });

  it('resolves true commit SHA via getCommitSha, prefers root README.md, and resumes partial cache on Refresh', async () => {
    const trueCommitSha = '1111222233334444555566667777888899990000';
    const branchIdentity: RepoIdentity = {
      owner: 'facebook',
      repo: 'react',
      branch: 'main',
      pageType: 'repo_root',
    };

    await new SettingsStore().saveSettings({
      aiProvider: 'gemini',
      geminiApiKey: 'test-gemini-key',
    });

    let aiCallCount = 0;
    const fetchMock = vi.fn(async (url: string): Promise<unknown> => {
      if (url.endsWith('/repos/facebook/react')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({
            owner: { login: 'facebook' },
            name: 'react',
            default_branch: 'main',
            description: null,
            private: false,
            language: 'TypeScript',
          }),
        };
      }
      if (url.includes('/commits/main')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ sha: trueCommitSha }),
        };
      }
      if (url.includes('/git/trees/')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({
            sha: 'tree_sha_should_not_be_used',
            truncated: false,
            tree: [
              { path: '.github/README.md', mode: '100644', type: 'blob', sha: 's0' },
              { path: 'README.md', mode: '100644', type: 'blob', sha: 's1' },
              { path: 'package.json', mode: '100644', type: 'blob', sha: 's2' },
              { path: 'src/index.ts', mode: '100644', type: 'blob', sha: 's3' },
            ],
          }),
        };
      }
      if (url.includes('/contents/README.md')) {
        return { ok: true, status: 200, headers: new Headers(), text: async () => '# Root README' };
      }
      if (url.includes('/contents/.github/README.md')) {
        return { ok: true, status: 200, headers: new Headers(), text: async () => '# Nested README' };
      }
      if (url.includes('/contents/package.json')) {
        return { ok: true, status: 200, headers: new Headers(), text: async () => '{"name":"react"}' };
      }
      if (url.includes('/contents/src/index.ts')) {
        return { ok: true, status: 200, headers: new Headers(), text: async () => 'export {};' };
      }
      if (url.includes('generativelanguage.googleapis.com')) {
        aiCallCount++;
        if (aiCallCount === 1) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              candidates: [{ content: { parts: [{ text: JSON.stringify(sampleOverview) }] } }],
            }),
          };
        }
        if (aiCallCount === 2) {
          // Simulate Stage 2 failure on first run
          return { ok: false, status: 500, text: async () => 'Temporary AI error' };
        }
        if (aiCallCount === 3) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              candidates: [{ content: { parts: [{ text: JSON.stringify(sampleArchitecture) }] } }],
            }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [{ content: { parts: [{ text: JSON.stringify(sampleExplorer) }] } }],
          }),
        };
      }
      return { ok: false, status: 404, headers: new Headers(), json: async () => ({ message: 'Not found' }) };
    });
    vi.stubGlobal('fetch', fetchMock);

    const { container, unmount } = mount(<App initialIdentity={branchIdentity} />);
    await act(async () => {
      await flushAsync();
    });

    const analyzeBtn = findElements(
      container,
      (el) => el.tagName === 'BUTTON' && el.textContent.includes('Analyze')
    )[0];

    await act(async () => {
      clickElement(analyzeBtn);
      await flushAsync(20);
    });

    // True commit SHA badge used (not tree_sha_should_not_be_used), root README fetched, Stage 1 cached
    expect(container.textContent).toContain(trueCommitSha.slice(0, 7));
    expect(container.textContent).not.toContain('tree_sh');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/contents/README.md'),
      expect.any(Object)
    );
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining('/contents/.github/README.md'),
      expect.any(Object)
    );

    // Clicking Refresh after partial failure resumes from Stage 2 without re-running Stage 1
    const refreshBtn = findElements(
      container,
      (el) => el.tagName === 'BUTTON' && el.textContent.includes('Refresh')
    )[0];
    expect(refreshBtn).toBeDefined();

    await act(async () => {
      clickElement(refreshBtn);
      await flushAsync(20);
    });

    expect(aiCallCount).toBe(4); // 1 (Stage 1) + 1 (Stage 2 fail) + 1 (Stage 2 resume) + 1 (Stage 3)
    const archTab = findElements(
      container,
      (el) => el.getAttribute('role') === 'tab' && el.getAttribute('aria-label') === 'Architecture'
    )[0];
    act(() => clickElement(archTab));
    expect(container.textContent).toContain('Component-Based Fiber Architecture');

    unmount();
  });

  it('preserves AskRepositoryTab draft input when switching between tabs on the same repository', () => {
    const { container, unmount } = mount(
      <App
        initialIdentity={sampleIdentity}
        initialStatus="ready"
        initialIndex={sampleIndex}
        initialOverview={sampleOverview}
        initialArchitecture={sampleArchitecture}
        initialExplorer={sampleExplorer}
      />
    );

    const findTab = (ariaLabel: string) =>
      findElements(
        container,
        (el) => el.getAttribute('role') === 'tab' && el.getAttribute('aria-label') === ariaLabel
      )[0];

    act(() => clickElement(findTab('Ask Repository')));
    const textarea = findElements(container, (el) => el.tagName === 'TEXTAREA')[0];
    act(() => setInputValue(textarea, 'Draft question still here'));

    act(() => clickElement(findTab('Overview')));
    act(() => clickElement(findTab('Ask Repository')));

    const textareaAfter = findElements(container, (el) => el.tagName === 'TEXTAREA')[0];
    expect(textareaAfter.value).toBe('Draft question still here');

    unmount();
  });

  it('guards defensive arrays in tabs and catches unexpected render errors via ErrorBoundary', () => {
    const partialHtml = renderToString(
      <>
        <OverviewTab
          overview={{ purpose: 'Minimal', executionSummary: 'Runs' } as unknown as OverviewOutput}
          owner="facebook"
          repo="react"
          gitRef="main"
          status="ready"
        />
        <ArchitectureTab
          architecture={{ pattern: 'Simple' } as unknown as ArchitectureOutput}
          owner="facebook"
          repo="react"
          gitRef="main"
          status="ready"
        />
        <CodebaseExplorerTab
          explorer={{} as unknown as CodebaseExplorerOutput}
          owner="facebook"
          repo="react"
          gitRef="main"
          status="ready"
        />
      </>
    );
    expect(partialHtml).toContain('Minimal');
    expect(partialHtml).toContain('Simple');

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const BrokenChild = (): React.ReactElement => {
      throw new Error('Boom render crash');
    };
    const { container, unmount } = mount(
      <ErrorBoundary>
        <BrokenChild />
      </ErrorBoundary>
    );
    expect(container.textContent).toContain('Something went wrong');
    expect(container.textContent).toContain('Boom render crash');
    consoleSpy.mockRestore();
    unmount();
  });
});
