import React, { useEffect, useState } from 'react';
import { Check, Eye, EyeOff, KeyRound, ShieldAlert, Trash2, X } from 'lucide-react';
import type { RepoCache } from '../../core/storage/cache';
import type { SettingsStore, UserSettings } from '../../core/storage/settings';

export interface SettingsModalProps {
  isOpen: boolean;
  settings: UserSettings;
  settingsStore: SettingsStore;
  repoCache: RepoCache;
  onClose: () => void;
  onSaved: (updated: UserSettings) => void;
  onCacheCleared?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  settings,
  settingsStore,
  repoCache,
  onClose,
  onSaved,
  onCacheCleared,
}) => {
  const [githubToken, setGithubToken] = useState(settings.githubToken ?? '');
  const [aiProvider, setAiProvider] = useState<'gemini' | 'openai'>(settings.aiProvider);
  const [geminiApiKey, setGeminiApiKey] = useState(settings.geminiApiKey ?? '');
  const [geminiModel, setGeminiModel] = useState(settings.geminiModel ?? 'gemini-1.5-flash');
  const [openaiApiKey, setOpenaiApiKey] = useState(settings.openaiApiKey ?? '');
  const [openaiModel, setOpenaiModel] = useState(settings.openaiModel ?? 'gpt-4o-mini');

  const [showGithubToken, setShowGithubToken] = useState(false);
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [cacheMessage, setCacheMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setGithubToken(settings.githubToken ?? '');
    setAiProvider(settings.aiProvider);
    setGeminiApiKey(settings.geminiApiKey ?? '');
    setGeminiModel(settings.geminiModel ?? 'gemini-1.5-flash');
    setOpenaiApiKey(settings.openaiApiKey ?? '');
    setOpenaiModel(settings.openaiModel ?? 'gpt-4o-mini');
    setCacheMessage(null);
  }, [isOpen, settings]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    try {
      const nextSettings: Partial<UserSettings> = {
        githubToken: githubToken.trim() || undefined,
        aiProvider,
        geminiApiKey: geminiApiKey.trim() || undefined,
        geminiModel: geminiModel.trim() || 'gemini-1.5-flash',
        openaiApiKey: openaiApiKey.trim() || undefined,
        openaiModel: openaiModel.trim() || 'gpt-4o-mini',
      };
      await settingsStore.saveSettings(nextSettings);
      const persisted = await settingsStore.getSettings();
      onSaved(persisted);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearCache = async () => {
    await repoCache.clear();
    setCacheMessage('Cached repository analyses cleared.');
    onCacheCleared?.();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="repolens-settings-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-indigo-400" aria-hidden="true" />
            <h2 id="repolens-settings-title" className="text-sm font-semibold text-zinc-100">
              RepoLens Settings
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="rounded p-1 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-4 p-4 text-xs">
          <div>
            <label htmlFor="github-pat-input" className="block font-medium text-zinc-200">
              GitHub Personal Access Token (Optional)
            </label>
            <p className="mt-0.5 text-[11px] text-zinc-400">
              Increases GitHub API limit to 5,000 req/hr and unlocks private repositories. Stored locally in{' '}
              <code className="font-mono text-zinc-300">chrome.storage.local</code>.
            </p>
            <div className="mt-1.5 flex items-center gap-1.5">
              <input
                id="github-pat-input"
                type={showGithubToken ? 'text' : 'password'}
                value={githubToken}
                onChange={(e) => setGithubToken(e.target.value)}
                placeholder="ghp_... or github_pat_..."
                autoComplete="off"
                className="flex-1 rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 font-mono text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowGithubToken((v) => !v)}
                aria-label={showGithubToken ? 'Hide GitHub token' : 'Show GitHub token'}
                className="rounded-md border border-zinc-800 bg-zinc-900 p-1.5 text-zinc-400 hover:text-zinc-200"
              >
                {showGithubToken ? (
                  <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          <fieldset>
            <legend className="font-medium text-zinc-200">AI Provider</legend>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setAiProvider('gemini')}
                aria-pressed={aiProvider === 'gemini'}
                className={`rounded-md border px-3 py-2 text-left transition-colors ${
                  aiProvider === 'gemini'
                    ? 'border-indigo-500 bg-indigo-500/15 text-indigo-200'
                    : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700'
                }`}
              >
                <div className="font-medium">Google Gemini</div>
                <div className="text-[10px] text-zinc-400">Gemini REST API</div>
              </button>

              <button
                type="button"
                onClick={() => setAiProvider('openai')}
                aria-pressed={aiProvider === 'openai'}
                className={`rounded-md border px-3 py-2 text-left transition-colors ${
                  aiProvider === 'openai'
                    ? 'border-indigo-500 bg-indigo-500/15 text-indigo-200'
                    : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700'
                }`}
              >
                <div className="font-medium">OpenAI</div>
                <div className="text-[10px] text-zinc-400">Chat Completions API</div>
              </button>
            </div>
          </fieldset>

          <div
            className={`space-y-2.5 rounded-lg border p-3 ${
              aiProvider === 'gemini'
                ? 'border-indigo-500/40 bg-indigo-950/10'
                : 'border-zinc-800 bg-zinc-900/40'
            }`}
          >
            <div className="font-medium text-zinc-200">Google Gemini Configuration</div>
            <div>
              <label htmlFor="gemini-key-input" className="block text-[11px] text-zinc-400">
                Gemini API Key
              </label>
              <div className="mt-1 flex items-center gap-1.5">
                <input
                  id="gemini-key-input"
                  type={showGeminiKey ? 'text' : 'password'}
                  value={geminiApiKey}
                  onChange={(e) => setGeminiApiKey(e.target.value)}
                  placeholder="AIza..."
                  autoComplete="off"
                  className="flex-1 rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 font-mono text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowGeminiKey((v) => !v)}
                  aria-label={showGeminiKey ? 'Hide Gemini key' : 'Show Gemini key'}
                  className="rounded-md border border-zinc-800 bg-zinc-900 p-1.5 text-zinc-400 hover:text-zinc-200"
                >
                  {showGeminiKey ? (
                    <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>
            <div>
              <label htmlFor="gemini-model-input" className="block text-[11px] text-zinc-400">
                Gemini Model
              </label>
              <input
                id="gemini-model-input"
                type="text"
                value={geminiModel}
                onChange={(e) => setGeminiModel(e.target.value)}
                placeholder="gemini-1.5-flash"
                className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 font-mono text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          <div
            className={`space-y-2.5 rounded-lg border p-3 ${
              aiProvider === 'openai'
                ? 'border-indigo-500/40 bg-indigo-950/10'
                : 'border-zinc-800 bg-zinc-900/40'
            }`}
          >
            <div className="font-medium text-zinc-200">OpenAI Configuration</div>
            <div>
              <label htmlFor="openai-key-input" className="block text-[11px] text-zinc-400">
                OpenAI API Key
              </label>
              <div className="mt-1 flex items-center gap-1.5">
                <input
                  id="openai-key-input"
                  type={showOpenaiKey ? 'text' : 'password'}
                  value={openaiApiKey}
                  onChange={(e) => setOpenaiApiKey(e.target.value)}
                  placeholder="sk-..."
                  autoComplete="off"
                  className="flex-1 rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 font-mono text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowOpenaiKey((v) => !v)}
                  aria-label={showOpenaiKey ? 'Hide OpenAI key' : 'Show OpenAI key'}
                  className="rounded-md border border-zinc-800 bg-zinc-900 p-1.5 text-zinc-400 hover:text-zinc-200"
                >
                  {showOpenaiKey ? (
                    <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>
            <div>
              <label htmlFor="openai-model-input" className="block text-[11px] text-zinc-400">
                OpenAI Model
              </label>
              <input
                id="openai-model-input"
                type="text"
                value={openaiModel}
                onChange={(e) => setOpenaiModel(e.target.value)}
                placeholder="gpt-4o-mini"
                className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 font-mono text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 p-2.5 text-[11px] text-zinc-400">
            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400" aria-hidden="true" />
            <span>
              Keys are stored in browser extension-local storage (not a hardware-backed vault) and sent directly to your selected AI provider only when you run analysis or Q&amp;A.
            </span>
          </div>

          <div className="flex items-center justify-between border-t border-zinc-800 pt-3">
            <button
              type="button"
              onClick={handleClearCache}
              className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-zinc-300 hover:border-rose-500/40 hover:text-rose-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Clear Cache</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
              >
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Save</span>
              </button>
            </div>
          </div>

          {cacheMessage && (
            <p className="text-[11px] text-emerald-400" role="status">
              {cacheMessage}
            </p>
          )}
        </form>
      </div>
    </div>
  );
};
