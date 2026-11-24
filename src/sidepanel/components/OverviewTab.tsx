import React from 'react';
import { ExternalLink, Layers, Loader2, Sparkles, Terminal } from 'lucide-react';
import type { OverviewOutput } from '../../core/ai/types';
import {
  AnalysisStatus,
  buildGitHubFileUrl,
  EXTERNAL_LINK_CLASSES,
  formatEvidenceCitation,
  handleExternalLinkClick,
} from '../utils';

export interface OverviewTabProps {
  overview: OverviewOutput | null;
  owner: string;
  repo: string;
  gitRef: string;
  status: AnalysisStatus;
  onAnalyze?: () => void;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
  overview,
  owner,
  repo,
  gitRef,
  status,
  onAnalyze,
}) => {
  if (!overview) {
    if (status === 'indexing' || status === 'analyzing' || status === 'detecting') {
      return (
        <div className="flex flex-col items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/60 p-6 text-center">
          <Loader2 className="h-6 w-6 animate-spin text-indigo-400" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium text-zinc-200">Generating Overview</p>
          <p className="mt-1 text-xs text-zinc-400">
            Extracting project purpose, technologies, and key modules from repository evidence.
          </p>
        </div>
      );
    }

    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-5 text-center">
        <Sparkles className="mx-auto h-6 w-6 text-indigo-400" aria-hidden="true" />
        <h2 className="mt-2.5 text-sm font-semibold text-zinc-100">Repository Overview</h2>
        <p className="mt-1 text-xs text-zinc-400">
          Run analysis to generate an evidence-backed summary, technology stack, and key module breakdown.
        </p>
        {onAnalyze && (
          <button
            type="button"
            onClick={onAnalyze}
            className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            Analyze Repository
          </button>
        )}
      </div>
    );
  }

  const techByCategory = new Map<string, OverviewOutput['technologies']>();
  for (const tech of overview.technologies) {
    const category = tech.category || 'Other';
    const existing = techByCategory.get(category) ?? [];
    existing.push(tech);
    techByCategory.set(category, existing);
  }

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-3.5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Project Purpose
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-zinc-100">{overview.purpose}</p>
      </section>

      <section className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-3.5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Tech Stack
        </h2>
        {techByCategory.size === 0 ? (
          <p className="mt-2 text-xs text-zinc-500">No technologies identified.</p>
        ) : (
          <div className="mt-2.5 space-y-3">
            {Array.from(techByCategory.entries()).map(([category, items]) => (
              <div key={category}>
                <h3 className="text-[11px] font-medium text-zinc-400">{category}</h3>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {items.map((tech, idx) => {
                    const evidenceUrl = buildGitHubFileUrl({
                      owner,
                      repo,
                      ref: gitRef || tech.evidence.commitSha || 'main',
                      filePath: tech.evidence.filePath,
                      lineStart: tech.evidence.lineStart,
                      lineEnd: tech.evidence.lineEnd,
                    });
                    const citationText = formatEvidenceCitation(tech.evidence);
                    const tooltip = `${citationText} (${tech.evidence.confidence})${
                      tech.evidence.snippet ? ` — ${tech.evidence.snippet}` : ''
                    }`;

                    return (
                      <a
                        key={`${category}-${tech.name}-${idx}`}
                        href={evidenceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => handleExternalLinkClick(e, evidenceUrl)}
                        title={tooltip}
                        className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700/80 bg-zinc-800/80 px-2 py-1 text-xs text-zinc-200 hover:border-indigo-500/50 hover:bg-zinc-800 hover:text-indigo-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                      >
                        <span className="font-medium">{tech.name}</span>
                        <span className="font-mono text-[10px] text-zinc-400">
                          {tech.evidence.filePath.split('/').pop()}
                        </span>
                        <ExternalLink className="h-2.5 w-2.5 text-zinc-500" aria-hidden="true" />
                      </a>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-3.5">
        <div className="flex items-center gap-1.5">
          <Layers className="h-3.5 w-3.5 text-indigo-400" aria-hidden="true" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Key Modules
          </h2>
        </div>
        {overview.keyModules.length === 0 ? (
          <p className="mt-2 text-xs text-zinc-500">No key modules identified.</p>
        ) : (
          <ul className="mt-2.5 space-y-2">
            {overview.keyModules.map((mod, idx) => {
              const modUrl = buildGitHubFileUrl({
                owner,
                repo,
                ref: gitRef || 'main',
                filePath: mod.path,
              });
              return (
                <li
                  key={`${mod.name}-${idx}`}
                  className="rounded-md border border-zinc-800/90 bg-zinc-950/60 p-2.5"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs font-semibold text-zinc-100">{mod.name}</span>
                    <a
                      href={modUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => handleExternalLinkClick(e, modUrl)}
                      className={`inline-flex items-center gap-1 truncate font-mono text-[11px] ${EXTERNAL_LINK_CLASSES}`}
                    >
                      <span className="truncate">{mod.path}</span>
                      <ExternalLink className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
                    </a>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-300">{mod.description}</p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-3.5">
        <div className="flex items-center gap-1.5">
          <Terminal className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Execution Summary
          </h2>
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-zinc-200">{overview.executionSummary}</p>
      </section>

      {overview.observations.length > 0 && (
        <section className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-3.5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Key Observations
          </h2>
          <ul className="mt-2 space-y-1.5 list-disc pl-4 text-xs text-zinc-300">
            {overview.observations.map((obs, idx) => (
              <li key={idx} className="leading-relaxed">
                {obs}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
};
