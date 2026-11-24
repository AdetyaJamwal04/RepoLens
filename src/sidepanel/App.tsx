import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Compass,
  FolderTree,
  GitBranch,
  KeyRound,
  MessageSquare,
  Network,
  Sparkles,
  Terminal,
} from 'lucide-react';
import { AnalysisEngine } from '../core/ai/engine';
import { GeminiProvider } from '../core/ai/gemini-provider';
import { OpenAIProvider } from '../core/ai/openai-provider';
import {
  AIProviderError,
  ArchitectureOutput,
  ChatMessage,
  CodebaseExplorerOutput,
  OverviewOutput,
} from '../core/ai/types';
import {
  GitHubApiError,
  GitHubClient,
  NotFoundError,
  RateLimitError,
} from '../core/github/client';
import type { RepoIdentity } from '../core/github/url-parser';
import { buildRepoIndex, RepoIndex } from '../core/indexer/indexer';
import { isManifest, isReadme } from '../core/indexer/prioritizer';
import { RepoCache } from '../core/storage/cache';
import { SettingsStore, UserSettings } from '../core/storage/settings';
import { ArchitectureTab } from './components/ArchitectureTab';
import { AskRepositoryTab } from './components/AskRepositoryTab';
import { CodebaseExplorerTab } from './components/CodebaseExplorerTab';
import { ExecutionFlowTab } from './components/ExecutionFlowTab';
import { Header } from './components/Header';
import { OverviewTab } from './components/OverviewTab';
import { SettingsModal } from './components/SettingsModal';
import { AnalysisStatus, TabId } from './utils';

export interface AppProps {
  initialIdentity?: RepoIdentity | null;
  initialOverview?: OverviewOutput | null;
  initialArchitecture?: ArchitectureOutput | null;
  initialExplorer?: CodebaseExplorerOutput | null;
  initialIndex?: RepoIndex | null;
  initialTab?: TabId;
  initialStatus?: AnalysisStatus;
  initialSettingsOpen?: boolean;
  initialMissingApiKeyWarning?: boolean;
  initialRateLimitError?: RateLimitError | null;
  initialError?: string | null;
}

const DEFAULT_SETTINGS: UserSettings = {
  aiProvider: 'gemini',
  geminiModel: 'gemini-1.5-flash',
  openaiModel: 'gpt-4o-mini',
};

const MAX_FILE_CHARS = 15000;
const MAX_TOTAL_CHARS = 55000;

const TABS: Array<{ id: TabId; label: string; ariaLabel: string; Icon: React.FC<{ className?: string }> }> = [
  { id: 'overview', label: 'Overview', ariaLabel: 'Overview', Icon: Sparkles },
  { id: 'architecture', label: 'Architecture', ariaLabel: 'Architecture', Icon: Network },
  { id: 'explorer', label: 'Explorer', ariaLabel: 'Codebase Explorer', Icon: FolderTree },
  { id: 'flow', label: 'Flow', ariaLabel: 'Execution Flow', Icon: Terminal },
  { id: 'ask', label: 'Ask AI', ariaLabel: 'Ask Repository', Icon: MessageSquare },
];

function formatRepoKey(identity: RepoIdentity | null): string {
  if (!identity) return '';
  return `${identity.owner.toLowerCase()}/${identity.repo.toLowerCase()}:${identity.branch || ''}:${identity.commitSha || ''}`;
}

async function fetchBoundedContents(
  client: GitHubClient,
  owner: string,
  repo: string,
  paths: string[],
  ref: string
): Promise<Record<string, string>> {
  const results: Record<string, string> = {};
  let totalChars = 0;

  const settled = await Promise.allSettled(
    paths.map(async (path) => ({
      path,
      content: await client.getFileContent(owner, repo, path, ref),
    }))
  );

  for (const outcome of settled) {
    if (outcome.status !== 'fulfilled') continue;
    if (totalChars >= MAX_TOTAL_CHARS) break;

    const { path, content } = outcome.value;
    const remaining = MAX_TOTAL_CHARS - totalChars;
    const limit = Math.min(MAX_FILE_CHARS, remaining);
    const bounded =
      content.length > limit
        ? `${content.slice(0, limit)}\n... [truncated]`
        : content;

    results[path] = bounded;
    totalChars += bounded.length;
  }

  return results;
}

export function App({
  initialIdentity,
  initialOverview = null,
  initialArchitecture = null,
  initialExplorer = null,
  initialIndex = null,
  initialTab = 'overview',
  initialStatus = 'idle',
  initialSettingsOpen = false,
  initialMissingApiKeyWarning = false,
  initialRateLimitError = null,
  initialError = null,
}: AppProps) {
  const settingsStore = useMemo(() => new SettingsStore(), []);
  const repoCache = useMemo(() => new RepoCache(), []);

  const [identity, setIdentity] = useState<RepoIdentity | null>(
    initialIdentity === undefined ? null : initialIdentity
  );
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  const [status, setStatus] = useState<AnalysisStatus>(
    initialIdentity === undefined ? 'detecting' : initialStatus
  );
  const [stageMessage, setStageMessage] = useState<string | null>(null);
  const [repoIndex, setRepoIndex] = useState<RepoIndex | null>(initialIndex);
  const [overview, setOverview] = useState<OverviewOutput | null>(initialOverview);
  const [architecture, setArchitecture] = useState<ArchitectureOutput | null>(initialArchitecture);
  const [explorer, setExplorer] = useState<CodebaseExplorerOutput | null>(initialExplorer);
  const [githubLinkRef, setGithubLinkRef] = useState<string>(
    initialIdentity?.commitSha || initialIdentity?.branch || initialIndex?.defaultBranch || 'main'
  );
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(initialSettingsOpen);
  const [missingApiKeyWarning, setMissingApiKeyWarning] = useState(initialMissingApiKeyWarning);
  const [rateLimitError, setRateLimitError] = useState<RateLimitError | null>(initialRateLimitError);
  const [errorMessage, setErrorMessage] = useState<string | null>(initialError);
  const [isTreeTruncated, setIsTreeTruncated] = useState(false);
  const [isFromCache, setIsFromCache] = useState(false);

  const activeRunIdRef = useRef(0);
  const lastRepoKeyRef = useRef(formatRepoKey(initialIdentity ?? null));

  useEffect(() => {
    let active = true;
    settingsStore
      .getSettings()
      .then((loaded) => {
        if (active) setSettings(loaded);
      })
      .catch(() => {
        // Retain default settings if storage is unavailable
      });
    return () => {
      active = false;
    };
  }, [settingsStore]);

  const applyDetectedRepo = useCallback(
    (nextRepo: RepoIdentity | null) => {
      const nextKey = formatRepoKey(nextRepo);
      if (nextKey === lastRepoKeyRef.current) {
        setStatus((prev) => (prev === 'detecting' ? 'idle' : prev));
        return;
      }

      lastRepoKeyRef.current = nextKey;
      activeRunIdRef.current += 1;
      setIdentity(nextRepo);
      setRepoIndex(null);
      setOverview(null);
      setArchitecture(null);
      setExplorer(null);
      setChatMessages([]);
      setErrorMessage(null);
      setRateLimitError(null);
      setMissingApiKeyWarning(false);
      setIsTreeTruncated(false);
      setIsFromCache(false);
      setStageMessage(null);
      setStatus('idle');
      setGithubLinkRef(nextRepo?.commitSha || nextRepo?.branch || 'main');

      if (nextRepo?.commitSha) {
        repoCache
          .get(nextRepo.owner, nextRepo.repo, nextRepo.commitSha)
          .then((cached) => {
            if (!cached || formatRepoKey(nextRepo) !== lastRepoKeyRef.current) return;
            if (cached.overview) setOverview(cached.overview);
            if (cached.architecture) setArchitecture(cached.architecture);
            if (cached.explorer) setExplorer(cached.explorer);
            if (cached.overview && cached.architecture && cached.explorer) {
              setIsFromCache(true);
              setStatus('ready');
            }
          })
          .catch(() => {
            // Cache miss fallback
          });
      }
    },
    [repoCache]
  );

  useEffect(() => {
    if (initialIdentity !== undefined) return;
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
      setStatus('idle');
      return;
    }

    const queryActiveRepo = () => {
      try {
        chrome.runtime.sendMessage({ type: 'GET_CURRENT_REPO' }, (response) => {
          if (chrome.runtime.lastError) {
            setStatus('idle');
            return;
          }
          applyDetectedRepo((response?.repo as RepoIdentity | null) ?? null);
        });
      } catch {
        setStatus('idle');
      }
    };

    queryActiveRepo();

    const handleRuntimeMessage = (message: { type?: string }) => {
      if (message?.type === 'REPO_DETECTED') {
        queryActiveRepo();
      }
    };

    const handleTabActivated = () => {
      queryActiveRepo();
    };

    const handleTabUpdated = (
      _tabId: number,
      changeInfo: { status?: string; url?: string },
      tab: chrome.tabs.Tab
    ) => {
      if (tab.active && (changeInfo.url || changeInfo.status === 'complete')) {
        queryActiveRepo();
      }
    };

    chrome.runtime.onMessage?.addListener(handleRuntimeMessage);
    chrome.tabs?.onActivated?.addListener(handleTabActivated);
    chrome.tabs?.onUpdated?.addListener(handleTabUpdated);

    return () => {
      chrome.runtime.onMessage?.removeListener(handleRuntimeMessage);
      chrome.tabs?.onActivated?.removeListener(handleTabActivated);
      chrome.tabs?.onUpdated?.removeListener(handleTabUpdated);
    };
  }, [initialIdentity, applyDetectedRepo]);

  const activeApiKey =
    settings.aiProvider === 'openai' ? settings.openaiApiKey : settings.geminiApiKey;
  const activeModel =
    settings.aiProvider === 'openai'
      ? settings.openaiModel || 'gpt-4o-mini'
      : settings.geminiModel || 'gemini-1.5-flash';

  const runAnalysis = useCallback(
    async (forceRefresh: boolean = false) => {
      if (!identity) return;

      setErrorMessage(null);
      setRateLimitError(null);

      if (!activeApiKey || !activeApiKey.trim()) {
        setMissingApiKeyWarning(true);
        return;
      }

      setMissingApiKeyWarning(false);
      const runId = ++activeRunIdRef.current;
      const isStale = () => activeRunIdRef.current !== runId;

      setStatus('indexing');
      setStageMessage('Retrieving repository metadata and structure...');
      setIsFromCache(false);

      try {
        const client = new GitHubClient(settings.githubToken);
        const metadata = await client.getRepoMetadata(identity.owner, identity.repo);
        if (isStale()) return;

        const targetRef = identity.commitSha || identity.branch || metadata.defaultBranch || 'main';
        const treeRes = await client.getTree(identity.owner, identity.repo, targetRef);
        if (isStale()) return;

        setIsTreeTruncated(treeRes.truncated);

        const resolvedSha = identity.commitSha || treeRes.sha || targetRef;
        const linkRef = identity.commitSha || identity.branch || metadata.defaultBranch || 'main';
        setGithubLinkRef(linkRef);

        const resolvedIdentity: RepoIdentity = {
          ...identity,
          branch: identity.branch || metadata.defaultBranch,
          commitSha: resolvedSha,
        };

        const index = buildRepoIndex(resolvedIdentity, treeRes.tree, metadata);
        setRepoIndex(index);

        const cached = forceRefresh
          ? null
          : await repoCache.get(identity.owner, identity.repo, resolvedSha);
        if (isStale()) return;

        if (cached && cached.overview && cached.architecture && cached.explorer) {
          setOverview(cached.overview);
          setArchitecture(cached.architecture);
          setExplorer(cached.explorer);
          setIsFromCache(true);
          setStageMessage(null);
          setStatus('ready');
          return;
        }

        const provider =
          settings.aiProvider === 'openai'
            ? new OpenAIProvider(activeApiKey.trim(), activeModel)
            : new GeminiProvider(activeApiKey.trim(), activeModel);

        const engine = new AnalysisEngine(provider);
        setStatus('analyzing');

        // Stage 1: Overview
        let stage1Overview = cached?.overview;
        if (!stage1Overview) {
          setStageMessage('Stage 1/3: Generating project overview and tech stack...');
          const readmeItem = treeRes.tree.find(
            (item) => item.type === 'blob' && isReadme(item.path)
          );
          const manifestPaths = index.manifests.slice(0, 5);
          const filesToFetch = readmeItem ? [readmeItem.path, ...manifestPaths] : manifestPaths;
          const fetchedStage1 = await fetchBoundedContents(
            client,
            identity.owner,
            identity.repo,
            filesToFetch,
            targetRef
          );
          if (isStale()) return;

          const readmeContent = readmeItem ? fetchedStage1[readmeItem.path] ?? '' : '';
          const manifestContents: Record<string, string> = {};
          for (const mPath of manifestPaths) {
            if (fetchedStage1[mPath] !== undefined) {
              manifestContents[mPath] = fetchedStage1[mPath];
            }
          }

          stage1Overview = await engine.runStage1Overview(index, readmeContent, manifestContents);
          if (isStale()) return;
          setOverview(stage1Overview);
          await repoCache.set(identity.owner, identity.repo, resolvedSha, {
            overview: stage1Overview,
          });
        } else {
          setOverview(stage1Overview);
        }

        // Stage 2: Architecture & Execution Flow
        let stage2Arch = cached?.architecture;
        if (!stage2Arch) {
          setStageMessage('Stage 2/3: Mapping architecture and execution flow...');
          const sourceCandidates = [
            ...index.candidateEntryPoints,
            ...index.prioritizedFiles.filter((p) => !isManifest(p) && !isReadme(p)),
          ];
          const uniqueSourcePaths = Array.from(new Set(sourceCandidates)).slice(0, 6);
          const entryContents = await fetchBoundedContents(
            client,
            identity.owner,
            identity.repo,
            uniqueSourcePaths,
            targetRef
          );
          if (isStale()) return;

          stage2Arch = await engine.runStage2Architecture(index, stage1Overview, entryContents);
          if (isStale()) return;
          setArchitecture(stage2Arch);
          await repoCache.set(identity.owner, identity.repo, resolvedSha, {
            architecture: stage2Arch,
          });
        } else {
          setArchitecture(stage2Arch);
        }

        // Stage 3: Codebase Explorer
        let stage3Explorer = cached?.explorer;
        if (!stage3Explorer) {
          setStageMessage('Stage 3/3: Explaining key directories and files...');
          stage3Explorer = await engine.runStage3Explorer(index, stage2Arch);
          if (isStale()) return;
          setExplorer(stage3Explorer);
          await repoCache.set(identity.owner, identity.repo, resolvedSha, {
            explorer: stage3Explorer,
          });
        } else {
          setExplorer(stage3Explorer);
        }

        setStageMessage(null);
        setStatus('ready');
      } catch (err: unknown) {
        if (isStale()) return;
        setStageMessage(null);
        setStatus('error');

        if (err instanceof RateLimitError) {
          setRateLimitError(err);
          return;
        }
        if (err instanceof NotFoundError) {
          setErrorMessage(
            'Repository or branch not found. If this is a private repository, add a GitHub Personal Access Token in Settings.'
          );
          return;
        }
        if (err instanceof AIProviderError) {
          setErrorMessage(err.friendlyMessage);
          return;
        }
        if (err instanceof GitHubApiError) {
          setErrorMessage(err.message);
          return;
        }
        setErrorMessage(
          err instanceof Error ? err.message : 'An unexpected error occurred during analysis.'
        );
      }
    },
    [identity, activeApiKey, activeModel, settings.githubToken, settings.aiProvider, repoCache]
  );

  const hasAnalysis = Boolean(overview || architecture || explorer);

  const handleHeaderAnalyze = () => {
    void runAnalysis(hasAnalysis);
  };

  const handleSettingsSaved = (updated: UserSettings) => {
    setSettings(updated);
    const updatedKey =
      updated.aiProvider === 'openai' ? updated.openaiApiKey : updated.geminiApiKey;
    if (updatedKey && updatedKey.trim()) {
      setMissingApiKeyWarning(false);
    }
    if (updated.githubToken && updated.githubToken.trim()) {
      setRateLimitError(null);
    }
  };

  const handleCacheCleared = () => {
    setIsFromCache(false);
  };

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
      <Header
        identity={identity}
        defaultBranch={repoIndex?.defaultBranch}
        commitSha={repoIndex?.commitSha}
        status={status}
        stageMessage={stageMessage}
        isFromCache={isFromCache}
        hasAnalysis={hasAnalysis}
        onAnalyze={handleHeaderAnalyze}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {missingApiKeyWarning && (
        <div
          role="alert"
          className="mx-3 mt-3 flex items-center justify-between gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200"
        >
          <div className="flex items-start gap-2">
            <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" />
            <div>
              <p className="font-medium">AI API Key Required</p>
              <p className="mt-0.5 text-[11px] text-amber-200/80">
                Add a {settings.aiProvider === 'openai' ? 'OpenAI' : 'Google Gemini'} API key to analyze repositories.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            className="shrink-0 rounded-md border border-amber-400/40 bg-amber-500/20 px-2.5 py-1 text-[11px] font-medium text-amber-100 hover:bg-amber-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          >
            Configure API Key
          </button>
        </div>
      )}

      {rateLimitError && (
        <div
          role="alert"
          className="mx-3 mt-3 flex items-center justify-between gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-200"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" aria-hidden="true" />
            <div>
              <p className="font-medium">GitHub API rate limit exceeded</p>
              <p className="mt-0.5 text-[11px] text-rose-200/80">
                {rateLimitError.resetTimestamp > 0
                  ? `Resets around ${new Date(rateLimitError.resetTimestamp * 1000).toLocaleTimeString()}. `
                  : ''}
                Add a GitHub Personal Access Token for 5,000 req/hr.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            className="shrink-0 rounded-md border border-rose-400/40 bg-rose-500/20 px-2.5 py-1 text-[11px] font-medium text-rose-100 hover:bg-rose-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
          >
            Add GitHub Token
          </button>
        </div>
      )}

      {errorMessage && (
        <div
          role="alert"
          className="mx-3 mt-3 flex items-center justify-between gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-200"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" aria-hidden="true" />
            <span>{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => void runAnalysis(false)}
            className="shrink-0 rounded-md border border-rose-400/40 bg-rose-500/20 px-2.5 py-1 text-[11px] font-medium text-rose-100 hover:bg-rose-500/30"
          >
            Retry
          </button>
        </div>
      )}

      {isTreeTruncated && (
        <div className="mx-3 mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
          Repository file tree exceeded GitHub&apos;s recursive limit; analysis reflects the available prioritized slice.
        </div>
      )}

      {!identity ? (
        <main className="flex flex-1 flex-col items-center justify-center p-6 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 text-indigo-400">
            <Compass className="h-6 w-6" aria-hidden="true" />
          </div>
          <h2 className="mt-4 text-sm font-semibold text-zinc-100">No Repository Detected</h2>
          <p className="mt-1.5 max-w-xs text-xs leading-relaxed text-zinc-400">
            Navigate to a GitHub repository to begin analysis.
          </p>
        </main>
      ) : (
        <>
          <nav
            role="tablist"
            aria-label="Repository analysis views"
            className="grid grid-cols-5 border-b border-zinc-800 bg-zinc-950 px-2 pt-2"
          >
            {TABS.map(({ id, label, ariaLabel, Icon }) => {
              const isActive = activeTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-label={ariaLabel}
                  onClick={() => setActiveTab(id)}
                  className={`flex flex-col items-center gap-1 border-b-2 px-1 pb-2 pt-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                    isActive
                      ? 'border-indigo-500 text-indigo-300'
                      : 'border-transparent text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="truncate">{label}</span>
                </button>
              );
            })}
          </nav>

          <main className="flex-1 overflow-y-auto p-3.5" role="tabpanel">
            {status === 'idle' && !hasAnalysis && activeTab !== 'ask' && !missingApiKeyWarning && (
              <div className="mb-3 flex items-center gap-2 rounded-lg border border-zinc-800/90 bg-zinc-900/50 px-3 py-2 text-[11px] text-zinc-400">
                <GitBranch className="h-3.5 w-3.5 shrink-0 text-indigo-400" aria-hidden="true" />
                <span>
                  Selected repository context is sent to{' '}
                  <span className="font-medium text-zinc-200">
                    {settings.aiProvider === 'openai' ? 'OpenAI' : 'Google Gemini'}
                  </span>{' '}
                  (<span className="font-mono">{activeModel}</span>) when you click Analyze.
                </span>
              </div>
            )}

            {activeTab === 'overview' && (
              <OverviewTab
                overview={overview}
                owner={identity.owner}
                repo={identity.repo}
                gitRef={githubLinkRef}
                status={status}
                onAnalyze={() => void runAnalysis(false)}
              />
            )}

            {activeTab === 'architecture' && (
              <ArchitectureTab
                architecture={architecture}
                owner={identity.owner}
                repo={identity.repo}
                gitRef={githubLinkRef}
                status={status}
              />
            )}

            {activeTab === 'explorer' && (
              <CodebaseExplorerTab
                explorer={explorer}
                owner={identity.owner}
                repo={identity.repo}
                gitRef={githubLinkRef}
                treeOutline={repoIndex?.treeOutline}
                status={status}
              />
            )}

            {activeTab === 'flow' && (
              <ExecutionFlowTab
                steps={architecture?.executionFlow ?? []}
                owner={identity.owner}
                repo={identity.repo}
                gitRef={githubLinkRef}
                commitSha={repoIndex?.commitSha}
                status={status}
              />
            )}

            {activeTab === 'ask' && (
              <AskRepositoryTab
                repoIndex={repoIndex}
                overview={overview}
                architecture={architecture}
                settings={settings}
                gitRef={githubLinkRef}
                onOpenSettings={() => setIsSettingsOpen(true)}
                messages={chatMessages}
                onMessagesChange={setChatMessages}
              />
            )}
          </main>
        </>
      )}

      <footer className="flex items-center justify-between border-t border-zinc-800 bg-zinc-950 px-3.5 py-2 text-[11px] text-zinc-500">
        <span>
          {settings.aiProvider === 'openai' ? 'OpenAI' : 'Gemini'} ·{' '}
          <span className="font-mono text-zinc-400">{activeModel}</span>
        </span>
        {repoIndex?.commitSha ? (
          <span className="font-mono text-zinc-400">
            @{repoIndex.commitSha.slice(0, 7)}
          </span>
        ) : (
          <span>RepoLens MVP</span>
        )}
      </footer>

      <SettingsModal
        isOpen={isSettingsOpen}
        settings={settings}
        settingsStore={settingsStore}
        repoCache={repoCache}
        onClose={() => setIsSettingsOpen(false)}
        onSaved={handleSettingsSaved}
        onCacheCleared={handleCacheCleared}
      />
    </div>
  );
}

export default App;
