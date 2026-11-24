import React, { useEffect, useState } from 'react';
import { ArrowRight, Cpu, Database, ExternalLink, Loader2, Network } from 'lucide-react';
import type { ArchitectureOutput } from '../../core/ai/types';
import {
  AnalysisStatus,
  buildGitHubFileUrl,
  EXTERNAL_LINK_CLASSES,
  handleExternalLinkClick,
} from '../utils';

export interface ArchitectureTabProps {
  architecture: ArchitectureOutput | null;
  owner: string;
  repo: string;
  gitRef: string;
  status: AnalysisStatus;
}

export const ArchitectureTab: React.FC<ArchitectureTabProps> = ({
  architecture,
  owner,
  repo,
  gitRef,
  status,
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(
    architecture?.components?.[0]?.id ?? null
  );

  useEffect(() => {
    setSelectedId(architecture?.components?.[0]?.id ?? null);
  }, [architecture]);

  if (!architecture) {
    if (status === 'indexing' || status === 'analyzing') {
      return (
        <div className="flex flex-col items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/60 p-6 text-center">
          <Loader2 className="h-6 w-6 animate-spin text-indigo-400" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium text-zinc-200">Mapping Architecture</p>
          <p className="mt-1 text-xs text-zinc-400">
            Inspecting entry points, component dependencies, and data flow pathways.
          </p>
        </div>
      );
    }

    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-5 text-center">
        <Network className="mx-auto h-6 w-6 text-indigo-400" aria-hidden="true" />
        <h2 className="mt-2.5 text-sm font-semibold text-zinc-100">Architecture</h2>
        <p className="mt-1 text-xs text-zinc-400">
          Analyze the repository to inspect architectural patterns, components, and dependencies.
        </p>
      </div>
    );
  }

  const components = architecture.components ?? [];
  const dataFlow = architecture.dataFlow ?? [];
  const externalIntegrations = architecture.externalIntegrations ?? [];

  const componentByIdOrName = new Map(
    components.flatMap((c) => [
      [c.id.toLowerCase(), c],
      [c.name.toLowerCase(), c],
    ])
  );

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Architectural Pattern
          </h2>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/15 px-2.5 py-0.5 text-xs font-medium text-indigo-300">
            <Cpu className="h-3 w-3" aria-hidden="true" />
            {architecture.pattern}
          </span>
        </div>
      </section>

      <section className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-3.5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Components ({components.length})
        </h2>
        <p className="mt-1 text-[11px] text-zinc-500">
          Select a component card to highlight its dependencies and related modules.
        </p>

        {components.length === 0 ? (
          <p className="mt-2 text-xs text-zinc-500">No components extracted.</p>
        ) : (
          <div className="mt-2.5 space-y-2.5">
            {components.map((comp) => {
              const importantFiles = comp.importantFiles ?? [];
              const dependencies = comp.dependencies ?? [];
              const isSelected = selectedId === comp.id;
              const usedBy = components.filter(
                (other) =>
                  other.id !== comp.id &&
                  (other.dependencies ?? []).some(
                    (dep) =>
                      dep.toLowerCase() === comp.id.toLowerCase() ||
                      dep.toLowerCase() === comp.name.toLowerCase()
                  )
              );

              return (
                <div
                  key={comp.id}
                  className={`rounded-lg border transition-colors ${
                    isSelected
                      ? 'border-indigo-500/60 bg-indigo-950/20'
                      : 'border-zinc-800 bg-zinc-950/60 hover:border-zinc-700'
                  }`}
                >
                  <button
                    type="button"
                    aria-expanded={isSelected}
                    onClick={() => setSelectedId(isSelected ? null : comp.id)}
                    className="flex w-full items-start justify-between gap-2 p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 rounded-lg"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs font-semibold text-zinc-100">{comp.name}</span>
                        <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
                          {comp.id}
                        </span>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-zinc-300">
                        {comp.responsibility}
                      </p>
                    </div>
                  </button>

                  <div className="border-t border-zinc-800/80 px-3 py-2.5 space-y-2 text-xs">
                    {importantFiles.length > 0 && (
                      <div>
                        <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                          Important Files
                        </span>
                        <ul className="mt-1 space-y-1">
                          {importantFiles.map((filePath) => {
                            const fileUrl = buildGitHubFileUrl({
                              owner,
                              repo,
                              ref: gitRef || 'main',
                              filePath,
                            });
                            return (
                              <li key={filePath}>
                                <a
                                  href={fileUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => handleExternalLinkClick(e, fileUrl)}
                                  className={`inline-flex items-center gap-1 font-mono text-[11px] break-all ${EXTERNAL_LINK_CLASSES}`}
                                >
                                  <span>{filePath}</span>
                                  <ExternalLink className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
                                </a>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                        Dependencies:
                      </span>
                      {dependencies.length === 0 ? (
                        <span className="text-[11px] text-zinc-500">None</span>
                      ) : (
                        dependencies.map((dep) => {
                          const target = componentByIdOrName.get(dep.toLowerCase());
                          if (target) {
                            return (
                              <button
                                key={dep}
                                type="button"
                                onClick={() => setSelectedId(target.id)}
                                className="rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-indigo-300 hover:border-indigo-500/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                              >
                                {dep}
                              </button>
                            );
                          }
                          return (
                            <span
                              key={dep}
                              className="rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-zinc-300"
                            >
                              {dep}
                            </span>
                          );
                        })
                      )}
                    </div>

                    {isSelected && usedBy.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                        <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                          Used by:
                        </span>
                        {usedBy.map((caller) => (
                          <button
                            key={caller.id}
                            type="button"
                            onClick={() => setSelectedId(caller.id)}
                            className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] text-emerald-300 hover:border-emerald-400/50"
                          >
                            {caller.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-3.5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Data Flow
        </h2>
        {dataFlow.length === 0 ? (
          <p className="mt-2 text-xs text-zinc-500">No data flow steps documented.</p>
        ) : (
          <ol className="mt-2.5 space-y-2">
            {dataFlow.map((step, idx) => (
              <li key={idx} className="flex items-start gap-2 text-xs text-zinc-200">
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-zinc-800 font-mono text-[10px] text-indigo-300">
                  {idx + 1}
                </span>
                <span className="leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-3.5">
        <div className="flex items-center gap-1.5">
          <Database className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            External Integrations
          </h2>
        </div>
        {externalIntegrations.length === 0 ? (
          <p className="mt-2 text-xs text-zinc-500">No external integrations detected.</p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {externalIntegrations.map((integration, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1 rounded-md border border-zinc-800 bg-zinc-950/70 px-2 py-1 text-xs text-zinc-200"
              >
                <ArrowRight className="h-3 w-3 text-zinc-500" aria-hidden="true" />
                {integration}
              </span>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
