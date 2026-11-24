export interface UserSettings {
  githubToken?: string;
  aiProvider: 'gemini' | 'openai';
  geminiApiKey?: string;
  geminiModel?: string;
  openaiApiKey?: string;
  openaiModel?: string;
}

const SETTINGS_KEY = 'repolens:settings';

const DEFAULT_SETTINGS: UserSettings = {
  aiProvider: 'gemini',
  geminiModel: 'gemini-1.5-flash',
  openaiModel: 'gpt-4o-mini',
};

const memoryFallback = new Map<string, UserSettings>();

export class SettingsStore {
  private hasChromeStorage(): boolean {
    return typeof chrome !== 'undefined' && Boolean(chrome?.storage?.local);
  }

  async getSettings(): Promise<UserSettings> {
    let stored: Partial<UserSettings> | undefined;

    if (this.hasChromeStorage()) {
      const result = await chrome.storage.local.get(SETTINGS_KEY);
      stored = result[SETTINGS_KEY] as Partial<UserSettings> | undefined;
    } else {
      stored = memoryFallback.get(SETTINGS_KEY);
    }

    return {
      ...DEFAULT_SETTINGS,
      ...(stored ?? {}),
    };
  }

  async saveSettings(settings: Partial<UserSettings>): Promise<void> {
    const current = await this.getSettings();
    const merged: UserSettings = {
      ...current,
      ...settings,
    };

    // Strip keys explicitly set to undefined so storage stays clean
    for (const key of Object.keys(merged) as Array<keyof UserSettings>) {
      if (merged[key] === undefined) {
        delete merged[key];
      }
    }

    if (this.hasChromeStorage()) {
      await chrome.storage.local.set({ [SETTINGS_KEY]: merged });
    } else {
      memoryFallback.set(SETTINGS_KEY, merged);
    }
  }

  async clearSettings(): Promise<void> {
    if (this.hasChromeStorage()) {
      await chrome.storage.local.remove(SETTINGS_KEY);
    } else {
      memoryFallback.delete(SETTINGS_KEY);
    }
  }
}
