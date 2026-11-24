import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SettingsStore, UserSettings } from '../../../src/core/storage/settings';

describe('SettingsStore', () => {
  let settingsStore: SettingsStore;

  beforeEach(async () => {
    vi.unstubAllGlobals();
    settingsStore = new SettingsStore();
    await settingsStore.clearSettings();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('in-memory fallback (no chrome.storage.local)', () => {
    it('returns default settings when nothing is stored', async () => {
      const settings = await settingsStore.getSettings();

      expect(settings).toEqual({
        aiProvider: 'gemini',
        geminiModel: 'gemini-1.5-flash',
        openaiModel: 'gpt-4o-mini',
      });
    });

    it('saves partial settings and merges with existing/default settings', async () => {
      await settingsStore.saveSettings({
        aiProvider: 'openai',
        openaiApiKey: 'sk-test-123',
        githubToken: 'ghp-token-456',
      });

      const settings = await settingsStore.getSettings();
      expect(settings).toEqual({
        aiProvider: 'openai',
        geminiModel: 'gemini-1.5-flash',
        openaiModel: 'gpt-4o-mini',
        openaiApiKey: 'sk-test-123',
        githubToken: 'ghp-token-456',
      });
    });

    it('clears saved settings and restores defaults', async () => {
      await settingsStore.saveSettings({
        aiProvider: 'openai',
        geminiApiKey: 'gem-key',
      });

      await settingsStore.clearSettings();
      const settings = await settingsStore.getSettings();

      expect(settings).toEqual({
        aiProvider: 'gemini',
        geminiModel: 'gemini-1.5-flash',
        openaiModel: 'gpt-4o-mini',
      });
      expect(settings.geminiApiKey).toBeUndefined();
    });
  });

  describe('chrome.storage.local adapter', () => {
    let store: Record<string, unknown>;
    let mockStorageLocal: {
      get: ReturnType<typeof vi.fn>;
      set: ReturnType<typeof vi.fn>;
      remove: ReturnType<typeof vi.fn>;
    };

    beforeEach(() => {
      store = {};
      mockStorageLocal = {
        get: vi.fn(async (key: string) => {
          return key in store ? { [key]: store[key] } : {};
        }),
        set: vi.fn(async (items: Record<string, unknown>) => {
          Object.assign(store, items);
        }),
        remove: vi.fn(async (key: string) => {
          delete store[key];
        }),
      };

      vi.stubGlobal('chrome', {
        storage: {
          local: mockStorageLocal,
        },
      });
    });

    it('stores settings under repolens:settings in chrome.storage.local', async () => {
      const update: Partial<UserSettings> = {
        aiProvider: 'gemini',
        geminiApiKey: 'test-gemini-key',
        geminiModel: 'gemini-2.0-flash',
      };

      await settingsStore.saveSettings(update);

      expect(mockStorageLocal.set).toHaveBeenCalledWith({
        'repolens:settings': {
          aiProvider: 'gemini',
          geminiApiKey: 'test-gemini-key',
          geminiModel: 'gemini-2.0-flash',
          openaiModel: 'gpt-4o-mini',
        },
      });

      const loaded = await settingsStore.getSettings();
      expect(loaded.geminiApiKey).toBe('test-gemini-key');
      expect(loaded.geminiModel).toBe('gemini-2.0-flash');
    });

    it('removes repolens:settings on clearSettings()', async () => {
      await settingsStore.saveSettings({ githubToken: 'ghp_abc' });
      await settingsStore.clearSettings();

      expect(mockStorageLocal.remove).toHaveBeenCalledWith('repolens:settings');
      expect('repolens:settings' in store).toBe(false);
    });
  });
});
