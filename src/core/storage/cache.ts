import { OverviewOutput, ArchitectureOutput, CodebaseExplorerOutput } from '../ai/types';
import type { RepoIndex } from '../indexer/indexer';

export interface CachedAnalysis {
  commitSha: string;
  timestamp: number;
  repoIndex?: RepoIndex;
  overview?: OverviewOutput;
  architecture?: ArchitectureOutput;
  explorer?: CodebaseExplorerOutput;
}

const memoryFallback = new Map<string, CachedAnalysis>();

export class RepoCache {
  constructor(private prefix: string = 'repolens:v1:') {}

  private buildKey(owner: string, repo: string, commitSha: string): string {
    return `${this.prefix}${owner.toLowerCase()}/${repo.toLowerCase()}:${commitSha}`;
  }

  private hasChromeStorage(): boolean {
    return typeof chrome !== 'undefined' && Boolean(chrome?.storage?.local);
  }

  async get(owner: string, repo: string, commitSha: string): Promise<CachedAnalysis | null> {
    const key = this.buildKey(owner, repo, commitSha);
    let entry: CachedAnalysis | undefined;

    if (this.hasChromeStorage()) {
      const result = await chrome.storage.local.get(key);
      entry = result[key] as CachedAnalysis | undefined;
    } else {
      entry = memoryFallback.get(key);
    }

    if (!entry || entry.commitSha !== commitSha) {
      return null;
    }

    return entry;
  }

  async set(
    owner: string,
    repo: string,
    commitSha: string,
    data: Partial<CachedAnalysis>
  ): Promise<void> {
    const key = this.buildKey(owner, repo, commitSha);
    const existing = await this.get(owner, repo, commitSha);

    const updated: CachedAnalysis = {
      ...(existing ?? {}),
      ...data,
      commitSha,
      timestamp: Date.now(),
    };

    if (this.hasChromeStorage()) {
      await chrome.storage.local.set({ [key]: updated });
    } else {
      memoryFallback.set(key, updated);
    }
  }

  async clear(owner?: string, repo?: string): Promise<void> {
    let targetPrefix = this.prefix;
    if (owner && repo) {
      targetPrefix = `${this.prefix}${owner.toLowerCase()}/${repo.toLowerCase()}:`;
    } else if (owner) {
      targetPrefix = `${this.prefix}${owner.toLowerCase()}/`;
    }

    if (this.hasChromeStorage()) {
      const allEntries = await chrome.storage.local.get(null);
      const keysToRemove = Object.keys(allEntries).filter((key) => key.startsWith(targetPrefix));
      if (keysToRemove.length > 0) {
        await chrome.storage.local.remove(keysToRemove);
      }
      return;
    }

    for (const key of Array.from(memoryFallback.keys())) {
      if (key.startsWith(targetPrefix)) {
        memoryFallback.delete(key);
      }
    }
  }
}
