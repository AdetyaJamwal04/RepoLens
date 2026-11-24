import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileCode,
  Folder,
  FolderTree,
  Loader2,
} from 'lucide-react';
import type { CodebaseExplorerEntry, CodebaseExplorerOutput } from '../../core/ai/types';
import {
  AnalysisStatus,
  buildGitHubFileUrl,
  EXTERNAL_LINK_CLASSES,
  handleExternalLinkClick,
} from '../utils';

export interface CodebaseExplorerTabProps {
  explorer: CodebaseExplorerOutput | null;
  owner: string;
  repo: string;
  gitRef: string;
  treeOutline?: string;
  status: AnalysisStatus;
}

type SignificanceFilter = 'all' | 'critical' | 'important' | 'supporting';

const SIGNIFICANCE_BADGE_CLASSES: Record<CodebaseExplorerEntry['significance'], string> = {
  critical: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  important: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  supporting: 'bg-slate-700/50 text-slate-300 border-slate-600/50',
};

export const CodebaseExplorerTab: React.FC<CodebaseExplorerTabProps> = ({
  explorer,
  owner,
  repo,
  gitRef,
  treeOutline,
  status,
}) => {
  const [filter, setFilter] = useState<SignificanceFilter>('all');
  const [showOutline, setShowOutline] = useState(false);

  if (!explorer) {
    if (status === 'indexing' || status === 'analyzing') {
      return (
        <div className="flex flex-col items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/60 p-6 text-center">
          <Loader2 className="h-6 w-6 animate-spin text-indigo-400" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium text-zinc-200">Mapping Codebase Explorer</p>
          <p className="mt-1 text-xs text-zinc-400">
            Assigning significance ratings and plain-English responsibilities to key paths.
          </p>
        </div>
      );
    }

    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-5 text-center">
        <FolderTree className="mx-auto h-6 w-6 text-indigo-400" aria-hidden="true" />
        <h2 className="mt-2.5 text-sm font-semibold text-zinc-100">Codebase Explorer</h2>
        <p className="mt-1 text-xs text-zinc-400">
          Analyze the repository to view prioritized files, directories, and their responsibilities.
        </p>
      </div>
    );
  }

  const filteredEntries =
    filter === 'all'
      ? explorer.entries
      : explorer.entries.filter((entry) => entry.significance === filter);

  const grouped = new Map<string, CodebaseExplorerEntry[]>();
  for (const entry of filteredEntries) {
    const clean = entry.path.replace(/^\/+/, '');
    const topGroup = clean.includes('/') ? `${clean.split('/')[0]}/` : 'root';
    const list = grouped.get(topGroup) ?? [];
    list.push(entry);
    grouped.set(topGroup, list);
  }

  const counts = {
    all: explorer.entries.length,
    critical: explorer.entries.filter((e) => e.significance === 'critical').length,
    important: explorer.entries.filter((e) => e.significance === 'important').length,
    supporting: explorer.entries.filter((e) => e.significance === 'supporting').length,
  };

  return (
    <div className="space-y-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Codebase Explorer
        </h2>
        {treeOutline && (
          <button
            type="button"
            onClick={() => setShowOutline((prev) => !prev)}
            className="inline-flex items-center gap-1 rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-300 hover:border-zinc-700 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
          >
            {showOutline ? (
              <ChevronDown className="h-3 w-3" aria-hidden="true" />
            ) : (
              <ChevronRight className="h-3 w-3" aria-hidden="true" />
            )}
            Tree Outline
          </button>
        )}
      </div>

      {showOutline && treeOutline && (
        <pre className="max-h-52 overflow-auto rounded-lg border border-zinc-800 bg-zinc-950 p-3 font-mono text-[11px] leading-relaxed text-zinc-300">
          {treeOutline}
        </pre>
      )}

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by significance">
        {(['all', 'critical', 'important', 'supporting'] as const).map((level) => (
          <button
            key={level}
            type="button"
            onClick={() => setFilter(level)}
            className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
              filter === level
                ? 'border-indigo-500/60 bg-indigo-500/20 text-indigo-200'
                : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {level} ({counts[level]})
          </button>
        ))}
      </div>

      {filteredEntries.length === 0 ? (
        <p className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 text-center text-xs text-zinc-500">
          No entries match the selected filter.
        </p>
      ) : (
        <div className="space-y-3">
          {Array.from(grouped.entries()).map(([groupName, entries]) => (
            <section
              key={groupName}
              className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-3"
            >
              <h3 className="font-mono text-[11px] font-semibold text-zinc-400">{groupName}</h3>
              <ul className="mt-2 space-y-2">
                {entries.map((entry, idx) => {
                  const url = buildGitHubFileUrl({
                    owner,
                    repo,
                    ref: gitRef || 'main',
                    filePath: entry.path,
                    type: entry.type,
                  });
                  return (
                    <li
                      key={`${entry.path}-${idx}`}
                      className="rounded-md border border-zinc-800/90 bg-zinc-950/60 p-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => handleExternalLinkClick(e, url)}
                          className={`inline-flex items-center gap-1.5 font-mono text-xs break-all ${EXTERNAL_LINK_CLASSES}`}
                        >
                          {entry.type === 'dir' ? (
                            <Folder className="h-3.5 w-3.5 shrink-0 text-amber-400" aria-hidden="true" />
                          ) : (
                            <FileCode className="h-3.5 w-3.5 shrink-0 text-indigo-400" aria-hidden="true" />
                          )}
                          <span>{entry.path}</span>
                          <ExternalLink className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
                        </a>

                        <span
                          className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${SIGNIFICANCE_BADGE_CLASSES[entry.significance]}`}
                        >
                          {entry.significance}
                        </span>
                      </div>

                      <p className="mt-1.5 text-xs leading-relaxed text-zinc-200">
                        {entry.responsibility}
                      </p>
                      <p className="mt-1 text-[11px] text-zinc-400">
                        <span className="font-medium text-zinc-500">Rationale:</span> {entry.reason}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
};
