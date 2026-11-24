import React from 'react';
import { CheckCircle2, ExternalLink, Loader2, Sparkles, Terminal } from 'lucide-react';
import type { ExecutionFlowStep } from '../../core/ai/types';
import {
  AnalysisStatus,
  buildGitHubFileUrl,
  EXTERNAL_LINK_CLASSES,
  formatEvidenceCitation,
  handleExternalLinkClick,
} from '../utils';

export interface ExecutionFlowTabProps {
  steps: ExecutionFlowStep[];
  owner: string;
  repo: string;
  gitRef?: string;
  commitSha?: string;
  status: AnalysisStatus;
}

export const ExecutionFlowTab: React.FC<ExecutionFlowTabProps> = ({
  steps,
  owner,
  repo,
  gitRef,
  commitSha,
  status,
}) => {
  const safeSteps = steps ?? [];
  if (safeSteps.length === 0) {
    if (status === 'indexing' || status === 'analyzing') {
      return (
        <div className="flex flex-col items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/60 p-6 text-center">
          <Loader2 className="h-6 w-6 animate-spin text-indigo-400" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium text-zinc-200">Tracing Execution Flow</p>
          <p className="mt-1 text-xs text-zinc-400">
            Building source-cited startup and runtime sequences from entry points.
          </p>
        </div>
      );
    }

    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-5 text-center">
        <Terminal className="mx-auto h-6 w-6 text-indigo-400" aria-hidden="true" />
        <h2 className="mt-2.5 text-sm font-semibold text-zinc-100">Execution Flow</h2>
        <p className="mt-1 text-xs text-zinc-400">
          Analyze the repository to trace the startup and runtime execution path with file citations.
        </p>
      </div>
    );
  }

  const orderedSteps = [...safeSteps].sort((a, b) => a.stepNumber - b.stepNumber);

  return (
    <div className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
        Execution Flow
      </h2>

      <ol className="relative space-y-3 border-l border-zinc-800 pl-4 ml-2">
        {orderedSteps.map((step, idx) => {
          const sourceRef = step.sourceReference ?? {
            filePath: '',
            commitSha: '',
            type: 'source' as const,
            confidence: 'unknown' as const,
          };
          const effectiveRef =
            gitRef || commitSha || sourceRef.commitSha || 'main';
          const sourceUrl = buildGitHubFileUrl({
            owner,
            repo,
            ref: effectiveRef,
            filePath: sourceRef.filePath || '',
            lineStart: sourceRef.lineStart,
            lineEnd: sourceRef.lineEnd,
          });
          const citationLabel = formatEvidenceCitation(sourceRef);
          const isVerified = step.confidence === 'verified';

          return (
            <li
              key={`${step.stepNumber}-${idx}`}
              className="relative rounded-lg border border-zinc-800 bg-zinc-900/70 p-3"
            >
              <span
                className="absolute -left-[25px] top-3.5 flex h-5 w-5 items-center justify-center rounded-full border border-indigo-500/40 bg-zinc-950 font-mono text-[10px] font-semibold text-indigo-300"
                aria-hidden="true"
              >
                {step.stepNumber}
              </span>

              <div className="flex flex-wrap items-start justify-between gap-2">
                <h3 className="text-xs font-semibold text-zinc-100">
                  {step.stepNumber}. {step.title}
                </h3>

                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                    isVerified
                      ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300'
                      : 'border-indigo-500/30 bg-indigo-500/15 text-indigo-300'
                  }`}
                >
                  {isVerified ? (
                    <CheckCircle2 className="h-2.5 w-2.5" aria-hidden="true" />
                  ) : (
                    <Sparkles className="h-2.5 w-2.5" aria-hidden="true" />
                  )}
                  {step.confidence}
                </span>
              </div>

              <p className="mt-1.5 text-xs leading-relaxed text-zinc-300">{step.description}</p>

              <div className="mt-2 pt-2 border-t border-zinc-800/80">
                <a
                  href={sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => handleExternalLinkClick(e, sourceUrl)}
                  className={`inline-flex items-center gap-1 font-mono text-[11px] break-all ${EXTERNAL_LINK_CLASSES}`}
                >
                  <span>{citationLabel}</span>
                  <ExternalLink className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
                </a>

                {sourceRef.snippet && (
                  <pre className="mt-2 overflow-x-auto rounded border border-zinc-800 bg-zinc-950 p-2 font-mono text-[11px] text-zinc-300">
                    {sourceRef.snippet}
                  </pre>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
};
