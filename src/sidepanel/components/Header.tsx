import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Compass,
  GitBranch,
  GitCommit,
  Loader2,
  RefreshCw,
  Settings,
  Sparkles,
} from 'lucide-react';
import type { RepoIdentity } from '../../core/github/url-parser';
import { AnalysisStatus, handleExternalLinkClick } from '../utils';

export interface HeaderProps {
  identity: RepoIdentity | null;
  defaultBranch?: string;
  commitSha?: string;
  status: AnalysisStatus;
  stageMessage?: string | null;
  isFromCache?: boolean;
  hasAnalysis?: boolean;
  hasFullAnalysis?: boolean;
  onAnalyze: () => void;
  onOpenSettings: () => void;
}

const STATUS_STYLES: Record<AnalysisStatus, { classes: string; label: string }> = {
  idle: {
    classes: 'bg-zinc-800/80 text-zinc-300 border-zinc-700',
    label: 'idle',
  },
  detecting: {
    classes: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    label: 'detecting',
  },
  indexing: {
    classes: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
    label: 'indexing',
  },
  analyzing: {
    classes: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    label: 'analyzing',
  },
  ready: {
    classes: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    label: 'ready',
  },
  error: {
    classes: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    label: 'error',
  },
};

export const Header: React.FC<HeaderProps> = ({
  identity,
  defaultBranch,
  commitSha,
  status,
  stageMessage,
  isFromCache = false,
  hasAnalysis = false,
  hasFullAnalysis = false,
  onAnalyze,
  onOpenSettings,
}) => {
  const isBusy = status === 'detecting' || status === 'indexing' || status === 'analyzing';
  const statusConfig = STATUS_STYLES[status];
  const rawBranch = identity?.branch || defaultBranch || 'main';
  const branchLabel = /^[0-9a-f]{40}$/i.test(rawBranch)
    ? defaultBranch || rawBranch.slice(0, 7)
    : rawBranch;
  const effectiveSha = commitSha || identity?.commitSha;
  const shortSha = effectiveSha ? effectiveSha.slice(0, 7) : null;
  const repoUrl = identity
    ? `https://github.com/${encodeURIComponent(identity.owner)}/${encodeURIComponent(identity.repo)}`
    : null;

  return (
    <header className="border-b border-zinc-800 bg-zinc-950/95 px-3.5 py-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-indigo-500/15 border border-indigo-500/30 text-indigo-400">
            <Compass className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold tracking-tight text-zinc-100">
                RepoLens
              </h1>
              <span
                data-status={status}
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${statusConfig.classes}`}
              >
                {isBusy && <Loader2 className="h-2.5 w-2.5 animate-spin" aria-hidden="true" />}
                {status === 'ready' && <CheckCircle2 className="h-2.5 w-2.5" aria-hidden="true" />}
                {status === 'error' && <AlertTriangle className="h-2.5 w-2.5" aria-hidden="true" />}
                {statusConfig.label}
              </span>
              {isFromCache && status === 'ready' && (
                <span className="rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-[10px] text-zinc-400">
                  cached
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onAnalyze}
            disabled={!identity || isBusy}
            className="inline-flex items-center gap-1.5 rounded-md border border-indigo-500/40 bg-indigo-600/90 px-2.5 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
            title={
              hasFullAnalysis
                ? 'Refresh analysis'
                : hasAnalysis
                  ? 'Resume partial analysis'
                  : 'Analyze repository'
            }
          >
            {hasAnalysis ? (
              <RefreshCw className={`h-3.5 w-3.5 ${isBusy ? 'animate-spin' : ''}`} aria-hidden="true" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            <span>{hasAnalysis ? 'Refresh' : 'Analyze'}</span>
          </button>

          <button
            type="button"
            onClick={onOpenSettings}
            aria-label="Settings"
            title="Settings"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900 text-zinc-400 transition-colors hover:border-zinc-700 hover:bg-zinc-800 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
          >
            <Settings className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {identity && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs">
          {repoUrl && (
            <a
              href={repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => handleExternalLinkClick(e, repoUrl)}
              className="truncate font-mono font-medium text-zinc-200 hover:text-indigo-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded"
            >
              {identity.owner}/{identity.repo}
            </a>
          )}

          <span className="inline-flex items-center gap-1 rounded bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 font-mono text-[11px] text-zinc-300">
            <GitBranch className="h-3 w-3 text-zinc-400" aria-hidden="true" />
            {branchLabel}
          </span>

          {shortSha && (
            <span
              className="inline-flex items-center gap-1 rounded bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 font-mono text-[11px] text-zinc-400"
              title={`Commit SHA: ${effectiveSha}`}
            >
              <GitCommit className="h-3 w-3 text-zinc-500" aria-hidden="true" />
              {shortSha}
            </span>
          )}
        </div>
      )}

      {isBusy && stageMessage && (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-indigo-300/90" aria-live="polite">
          <Loader2 className="h-3 w-3 shrink-0 animate-spin" aria-hidden="true" />
          <span className="truncate">{stageMessage}</span>
        </p>
      )}
    </header>
  );
};
