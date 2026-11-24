import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RepoCache } from '../../../src/core/storage/cache';
import { OverviewOutput, ArchitectureOutput, CodebaseExplorerOutput } from '../../../src/core/ai/types';

describe('RepoCache', () => {
  const sampleOverview: OverviewOutput = {
    purpose: 'Test repository overview',
    technologies: [],
    keyModules: [],
    executionSummary: 'Runs from src/index.ts',
    observations: [],
  };

  const sampleArchitecture: ArchitectureOutput = {
    pattern: 'Modular',
    components: [],
    dataFlow: [],
    externalIntegrations: [],
    executionFlow: [],
  };

  const sampleExplorer: CodebaseExplorerOutput = {
    entries: [
      {
        path: 'src/index.ts',
        type: 'file',
        significance: 'critical',
        responsibility: 'Entry point',
        reason: 'Main bootstrap file',
      },
    ],
  };

  let cache: RepoCache;

  beforeEach(async () => {
    vi.unstubAllGlobals();
    cache = new RepoCache();
    await cache.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('in-memory fallback (no chrome.storage.local)', () => {
    it('returns null when no entry exists', async () => {
      const result = await cache.get('facebook', 'react', 'sha-1');
      expect(result).toBeNull();
    });

    it('stores and retrieves analysis by owner, repo (case-insensitive), and commitSha', async () => {
      const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1700000000000);

      await cache.set('Facebook', 'React', 'commit-abc', { overview: sampleOverview });
      const retrieved = await cache.get('facebook', 'react', 'commit-abc');

      expect(retrieved).toEqual({
        commitSha: 'commit-abc',
        timestamp: 1700000000000,
        overview: sampleOverview,
      });
      nowSpy.mockRestore();
    });

    it('returns null if requested commitSha does not match', async () => {
      await cache.set('owner', 'repo', 'commit-1', { overview: sampleOverview });
      const mismatch = await cache.get('owner', 'repo', 'commit-2');
      expect(mismatch).toBeNull();
    });

    it('merges partial updates for the same commit and updates timestamp', async () => {
      const nowSpy = vi.spyOn(Date, 'now');
      nowSpy.mockReturnValueOnce(1000);
      await cache.set('owner', 'repo', 'sha-1', { overview: sampleOverview });

      nowSpy.mockReturnValueOnce(2000);
      await cache.set('owner', 'repo', 'sha-1', { architecture: sampleArchitecture });

      nowSpy.mockReturnValueOnce(3000);
      await cache.set('owner', 'repo', 'sha-1', { explorer: sampleExplorer });

      const result = await cache.get('owner', 'repo', 'sha-1');
      expect(result).toEqual({
        commitSha: 'sha-1',
        timestamp: 3000,
        overview: sampleOverview,
        architecture: sampleArchitecture,
        explorer: sampleExplorer,
      });
    });

    it('clears cached items only for specified owner/repo', async () => {
      await cache.set('OwnerA', 'Repo1', 'sha-1', { overview: sampleOverview });
      await cache.set('OwnerA', 'Repo1', 'sha-2', { overview: sampleOverview });
      await cache.set('OwnerB', 'Repo2', 'sha-1', { overview: sampleOverview });

      await cache.clear('ownera', 'repo1');

      expect(await cache.get('OwnerA', 'Repo1', 'sha-1')).toBeNull();
      expect(await cache.get('OwnerA', 'Repo1', 'sha-2')).toBeNull();
      expect(await cache.get('OwnerB', 'Repo2', 'sha-1')).not.toBeNull();
    });

    it('clears all repo caches when no owner/repo is specified', async () => {
      await cache.set('OwnerA', 'Repo1', 'sha-1', { overview: sampleOverview });
      await cache.set('OwnerB', 'Repo2', 'sha-2', { architecture: sampleArchitecture });

      await cache.clear();

      expect(await cache.get('OwnerA', 'Repo1', 'sha-1')).toBeNull();
      expect(await cache.get('OwnerB', 'Repo2', 'sha-2')).toBeNull();
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
      store = {
        'repolens:settings': { aiProvider: 'gemini' },
      };

      mockStorageLocal = {
        get: vi.fn(async (keys: string | string[] | null) => {
          if (keys === null) {
            return { ...store };
          }
          if (typeof keys === 'string') {
            return keys in store ? { [keys]: store[keys] } : {};
          }
          const result: Record<string, unknown> = {};
          for (const key of keys) {
            if (key in store) {
              result[key] = store[key];
            }
          }
          return result;
        }),
        set: vi.fn(async (items: Record<string, unknown>) => {
          Object.assign(store, items);
        }),
        remove: vi.fn(async (keys: string | string[]) => {
          const list = Array.isArray(keys) ? keys : [keys];
          for (const key of list) {
            delete store[key];
          }
        }),
      };

      vi.stubGlobal('chrome', {
        storage: {
          local: mockStorageLocal,
        },
      });
    });

    it('uses versioned key format repolens:v1:<owner>/<repo>:<commitSha>', async () => {
      await cache.set('OctoCat', 'Hello-World', 'deadbeef', { overview: sampleOverview });

      const expectedKey = 'repolens:v1:octocat/hello-world:deadbeef';
      expect(expectedKey in store).toBe(true);
      expect(mockStorageLocal.set).toHaveBeenCalledTimes(1);

      const loaded = await cache.get('octocat', 'hello-world', 'deadbeef');
      expect(loaded?.overview).toEqual(sampleOverview);
    });

    it('returns null if stored entry commitSha mismatches requested commitSha', async () => {
      store['repolens:v1:owner/repo:sha-requested'] = {
        commitSha: 'sha-different',
        timestamp: 12345,
        overview: sampleOverview,
      };

      const loaded = await cache.get('owner', 'repo', 'sha-requested');
      expect(loaded).toBeNull();
    });

    it('clear() preserves non-cache keys such as repolens:settings', async () => {
      await cache.set('owner', 'repo', 'sha-1', { overview: sampleOverview });
      await cache.clear();

      expect('repolens:v1:owner/repo:sha-1' in store).toBe(false);
      expect(store['repolens:settings']).toEqual({ aiProvider: 'gemini' });
    });
  });
});
