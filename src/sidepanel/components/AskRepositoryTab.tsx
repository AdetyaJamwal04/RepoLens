import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Loader2, MessageSquare, Send, Trash2 } from 'lucide-react';
import { AnalysisEngine } from '../../core/ai/engine';
import { GeminiProvider } from '../../core/ai/gemini-provider';
import { OpenAIProvider } from '../../core/ai/openai-provider';
import {
  AIProviderError,
  ArchitectureOutput,
  ChatMessage,
  CodebaseExplorerOutput,
  OverviewOutput,
} from '../../core/ai/types';
import type { RepoIndex } from '../../core/indexer/indexer';
import type { UserSettings } from '../../core/storage/settings';
import {
  buildGitHubFileUrl,
  EXTERNAL_LINK_CLASSES,
  handleExternalLinkClick,
  parseInlineTokens,
  parseMarkdownBlocks,
} from '../utils';

export interface AskRepositoryTabProps {
  repoIndex: RepoIndex | null;
  overview: OverviewOutput | null;
  architecture: ArchitectureOutput | null;
  explorer?: CodebaseExplorerOutput | null;
  readmeSummary?: string;
  manifestContents?: Record<string, string>;
  settings: UserSettings;
  gitRef: string;
  onOpenSettings: () => void;
  messages?: ChatMessage[];
  onMessagesChange?: (messages: ChatMessage[]) => void;
}

const PRESET_QUESTIONS = [
  'How do I run this locally?',
  'Where is authentication handled?',
  'What are the entry points?',
];

export const AskRepositoryTab: React.FC<AskRepositoryTabProps> = ({
  repoIndex,
  overview,
  architecture,
  explorer,
  readmeSummary,
  manifestContents,
  settings,
  gitRef,
  onOpenSettings,
  messages: controlledMessages,
  onMessagesChange,
}) => {
  const [internalMessages, setInternalMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [chatError, setChatError] = useState<string | null>(null);

  const messages = controlledMessages ?? internalMessages ?? [];
  const updateMessages = (next: ChatMessage[]) => {
    if (onMessagesChange) {
      onMessagesChange(next);
    } else {
      setInternalMessages(next);
    }
  };

  const repoKey = repoIndex
    ? `${repoIndex.identity.owner.toLowerCase()}/${repoIndex.identity.repo.toLowerCase()}:${repoIndex.commitSha || repoIndex.defaultBranch}`
    : '';
  const repoKeyRef = useRef(repoKey);
  const streamRunIdRef = useRef(0);
  const isControlledRef = useRef(Boolean(onMessagesChange));
  isControlledRef.current = Boolean(onMessagesChange);

  useEffect(() => {
    if (repoKeyRef.current === repoKey) return;
    repoKeyRef.current = repoKey;
    streamRunIdRef.current += 1;
    setIsStreaming(false);
    setStreamingContent('');
    setChatError(null);
    setInput('');
    if (!isControlledRef.current) {
      setInternalMessages([]);
    }
  }, [repoKey]);

  useEffect(() => {
    return () => {
      streamRunIdRef.current += 1;
    };
  }, []);

  const activeApiKey =
    settings.aiProvider === 'openai' ? settings.openaiApiKey : settings.geminiApiKey;
  const hasApiKey = Boolean(activeApiKey && activeApiKey.trim().length > 0);

  const knownFiles = useMemo(() => {
    const set = new Set<string>();
    if (!repoIndex) return set;
    for (const p of repoIndex.manifests ?? []) set.add(p);
    for (const p of repoIndex.candidateEntryPoints ?? []) set.add(p);
    for (const p of repoIndex.prioritizedFiles ?? []) set.add(p);
    return set;
  }, [repoIndex]);

  const renderInline = (text: string) => {
    const tokens = parseInlineTokens(text);
    return tokens.map((token, idx) => {
      if (token.type === 'bold') {
        return (
          <strong key={idx} className="font-semibold text-zinc-100">
            {token.value}
          </strong>
        );
      }
      if (token.type === 'link') {
        return (
          <a
            key={idx}
            href={token.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => handleExternalLinkClick(e, token.url)}
            className={EXTERNAL_LINK_CLASSES}
          >
            {token.label}
          </a>
        );
      }
      if (token.type === 'code') {
        const match = token.value.match(/^([^#:\s]+)(?:#L(\d+)(?:-L(\d+))?)?$/);
        const fileCandidate = match?.[1];
        if (repoIndex && fileCandidate && knownFiles.has(fileCandidate)) {
          const lineStart = match?.[2] ? Number(match[2]) : undefined;
          const lineEnd = match?.[3] ? Number(match[3]) : undefined;
          const fileUrl = buildGitHubFileUrl({
            owner: repoIndex.identity.owner,
            repo: repoIndex.identity.repo,
            ref: gitRef || repoIndex.defaultBranch || 'main',
            filePath: fileCandidate,
            lineStart,
            lineEnd,
          });
          return (
            <a
              key={idx}
              href={fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => handleExternalLinkClick(e, fileUrl)}
              className={`rounded bg-zinc-800 px-1 py-0.5 font-mono text-[11px] ${EXTERNAL_LINK_CLASSES}`}
            >
              {token.value}
            </a>
          );
        }
        return (
          <code
            key={idx}
            className="rounded bg-zinc-800 px-1 py-0.5 font-mono text-[11px] text-amber-200"
          >
            {token.value}
          </code>
        );
      }
      return <React.Fragment key={idx}>{token.value}</React.Fragment>;
    });
  };

  const renderSafeMarkdown = (content: string) => {
    const blocks = parseMarkdownBlocks(content);
    return (
      <div className="space-y-2 text-xs leading-relaxed text-zinc-200">
        {blocks.map((block, idx) => {
          if (block.type === 'code') {
            return (
              <pre
                key={idx}
                className="overflow-x-auto rounded border border-zinc-800 bg-zinc-950 p-2.5 font-mono text-[11px] text-zinc-200"
              >
                <code>{block.content}</code>
              </pre>
            );
          }
          if (block.type === 'heading') {
            return (
              <h4 key={idx} className="font-semibold text-zinc-100">
                {renderInline(block.text)}
              </h4>
            );
          }
          if (block.type === 'ul') {
            return (
              <ul key={idx} className="list-disc space-y-1 pl-4">
                {block.items.map((item, itemIdx) => (
                  <li key={itemIdx}>{renderInline(item)}</li>
                ))}
              </ul>
            );
          }
          if (block.type === 'ol') {
            return (
              <ol key={idx} className="list-decimal space-y-1 pl-4">
                {block.items.map((item, itemIdx) => (
                  <li key={itemIdx}>{renderInline(item)}</li>
                ))}
              </ol>
            );
          }
          return <p key={idx}>{renderInline(block.text)}</p>;
        })}
      </div>
    );
  };

  const submitQuestion = async (questionText: string) => {
    const trimmed = questionText.trim();
    if (!trimmed || isStreaming) return;

    if (!repoIndex) {
      setChatError('Analyze the repository first so Q&A has repository context.');
      return;
    }

    if (!hasApiKey || !activeApiKey) {
      setChatError('Configure an AI API key in Settings before asking questions.');
      return;
    }

    setChatError(null);
    const runId = ++streamRunIdRef.current;
    const requestRepoKey = repoKey;
    const isStale = () =>
      streamRunIdRef.current !== runId || repoKeyRef.current !== requestRepoKey;

    const nextHistory: ChatMessage[] = [...messages, { role: 'user', content: trimmed }];
    updateMessages(nextHistory);
    setInput('');
    setIsStreaming(true);
    setStreamingContent('');

    try {
      const provider =
        settings.aiProvider === 'openai'
          ? new OpenAIProvider(activeApiKey, settings.openaiModel || 'gpt-4o-mini')
          : new GeminiProvider(activeApiKey, settings.geminiModel || 'gemini-1.5-flash');

      const engine = new AnalysisEngine(provider);
      let accumulated = '';

      const fullResponse = await engine.askQuestion(
        repoIndex,
        {
          overview: overview ?? undefined,
          architecture: architecture ?? undefined,
          explorer: explorer ?? undefined,
          readmeSummary,
          manifestContents,
        },
        nextHistory,
        (chunk) => {
          if (isStale()) return;
          accumulated += chunk;
          setStreamingContent(accumulated);
        }
      );

      if (isStale()) return;
      const finalAnswer = fullResponse || accumulated;
      updateMessages([...nextHistory, { role: 'assistant', content: finalAnswer }]);
    } catch (err: unknown) {
      if (isStale()) return;
      if (err instanceof AIProviderError) {
        setChatError(err.friendlyMessage);
      } else {
        setChatError(err instanceof Error ? err.message : 'Failed to stream response.');
      }
    } finally {
      if (!isStale()) {
        setIsStreaming(false);
        setStreamingContent('');
      }
    }
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    void submitQuestion(input);
  };

  return (
    <div className="flex flex-col space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Ask Repository
          </h2>
          <p className="text-[11px] text-zinc-500">
            Grounded in the analyzed repository slice
            {repoIndex ? ` (${(repoIndex.prioritizedFiles ?? []).length} prioritized files)` : ''}.
          </p>
        </div>

        {messages.length > 0 && !isStreaming && (
          <button
            type="button"
            onClick={() => updateMessages([])}
            className="inline-flex items-center gap-1 rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-400 hover:border-zinc-700 hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
          >
            <Trash2 className="h-3 w-3" aria-hidden="true" />
            Clear
          </button>
        )}
      </div>

      {!hasApiKey && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-200">
          <span className="flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>Add an API key to ask questions.</span>
          </span>
          <button
            type="button"
            onClick={onOpenSettings}
            className="shrink-0 rounded border border-amber-400/40 bg-amber-500/20 px-2 py-1 text-[11px] font-medium hover:bg-amber-500/30"
          >
            Configure API Key
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {PRESET_QUESTIONS.map((q) => (
          <button
            key={q}
            type="button"
            disabled={!repoIndex || isStreaming}
            onClick={() => void submitQuestion(q)}
            className="rounded-full border border-zinc-700/80 bg-zinc-900 px-2.5 py-1 text-[11px] text-zinc-300 transition-colors hover:border-indigo-500/50 hover:text-indigo-200 disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
          >
            {q}
          </button>
        ))}
      </div>

      <div className="space-y-2.5 min-h-[160px] max-h-[380px] overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
        {messages.length === 0 && !isStreaming ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <MessageSquare className="h-5 w-5 text-zinc-600" aria-hidden="true" />
            <p className="mt-2 text-xs text-zinc-400">
              {repoIndex
                ? 'Ask a question or pick a prompt chip above.'
                : 'Analyze this repository first to enable Q&A.'}
            </p>
          </div>
        ) : (
          <>
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`rounded-lg border p-2.5 ${
                  msg.role === 'user'
                    ? 'ml-6 border-indigo-500/30 bg-indigo-500/10 text-zinc-100'
                    : 'mr-2 border-zinc-800 bg-zinc-900/90 text-zinc-200'
                }`}
              >
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                  {msg.role === 'user' ? 'You' : 'RepoLens'}
                </div>
                {msg.role === 'user' ? (
                  <p className="text-xs leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                ) : (
                  renderSafeMarkdown(msg.content)
                )}
              </div>
            ))}

            {isStreaming && (
              <div className="mr-2 rounded-lg border border-zinc-800 bg-zinc-900/90 p-2.5 text-zinc-200">
                <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-indigo-300">
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                  <span>RepoLens</span>
                </div>
                {streamingContent ? (
                  renderSafeMarkdown(streamingContent)
                ) : (
                  <p className="text-xs text-zinc-400">Thinking...</p>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {chatError && (
        <div
          role="alert"
          className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200"
        >
          {chatError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex items-end gap-2">
        <label htmlFor="ask-repo-input" className="sr-only">
          Ask a question about this repository
        </label>
        <textarea
          id="ask-repo-input"
          rows={2}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void submitQuestion(input);
            }
          }}
          disabled={!repoIndex || isStreaming}
          placeholder={
            repoIndex
              ? 'Ask about entry points, data flow, or setup...'
              : 'Analyze the repository to ask questions...'
          }
          className="flex-1 resize-none rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!repoIndex || isStreaming || !input.trim()}
          className="inline-flex h-9 items-center gap-1.5 rounded-md bg-indigo-600 px-3 text-xs font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
        >
          <Send className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Send</span>
        </button>
      </form>
    </div>
  );
};
