export interface GitTreeItem {
  path: string;
  mode: string;
  type: 'blob' | 'tree';
  sha: string;
  size?: number;
}

export interface GitTreeResponse {
  sha: string;
  tree: GitTreeItem[];
  truncated: boolean;
}

export interface RepoMetadata {
  owner: string;
  name: string;
  defaultBranch: string;
  description: string | null;
  isPrivate: boolean;
  language: string | null;
}

export class RateLimitError extends Error {
  constructor(message: string, public remaining: number, public resetTimestamp: number) {
    super(message);
    this.name = 'RateLimitError';
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class GitHubApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = 'GitHubApiError';
  }
}

export class GitHubClient {
  constructor(private token?: string) {}

  private async request(url: string, accept: string = 'application/vnd.github.v3+json'): Promise<Response> {
    const headers: Record<string, string> = {
      Accept: accept,
      'User-Agent': 'RepoLens-Extension',
    };

    if (this.token && this.token.trim()) {
      headers['Authorization'] = `Bearer ${this.token.trim()}`;
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
      let remaining = 0;
      let resetTimestamp = 0;

      if (response.headers) {
        if (typeof response.headers.get === 'function') {
          const remainingHeader = response.headers.get('x-ratelimit-remaining');
          const resetHeader = response.headers.get('x-ratelimit-reset');
          if (remainingHeader !== null && remainingHeader !== undefined) {
            remaining = parseInt(remainingHeader, 10);
          }
          if (resetHeader !== null && resetHeader !== undefined) {
            resetTimestamp = parseInt(resetHeader, 10);
          }
        } else {
          const headersObj = response.headers as unknown as Record<string, string | undefined>;
          if (headersObj['x-ratelimit-remaining'] !== undefined) {
            remaining = parseInt(headersObj['x-ratelimit-remaining'] as string, 10);
          }
          if (headersObj['x-ratelimit-reset'] !== undefined) {
            resetTimestamp = parseInt(headersObj['x-ratelimit-reset'] as string, 10);
          }
        }
      }

      let message = `GitHub API request failed with status ${response.status}`;
      try {
        const data = await response.json();
        if (data && typeof data === 'object' && typeof data.message === 'string') {
          message = data.message;
        }
      } catch {
        // response body may not be JSON
      }

      if (
        response.status === 429 ||
        (response.status === 403 && (remaining === 0 || message.toLowerCase().includes('rate limit')))
      ) {
        throw new RateLimitError(message, remaining, resetTimestamp);
      }

      if (response.status === 404) {
        throw new NotFoundError(message);
      }

      throw new GitHubApiError(message, response.status);
    }

    return response;
  }

  async getRepoMetadata(owner: string, repo: string): Promise<RepoMetadata> {
    const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
    const response = await this.request(url);
    const data = await response.json();

    const ownerLogin =
      typeof data.owner === 'object' && data.owner !== null
        ? data.owner.login
        : data.owner || owner;

    return {
      owner: ownerLogin,
      name: data.name,
      defaultBranch: data.default_branch,
      description: data.description ?? null,
      isPrivate: Boolean(data.private),
      language: data.language ?? null,
    };
  }

  async getTree(owner: string, repo: string, ref: string): Promise<GitTreeResponse> {
    const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(ref)}?recursive=1`;
    const response = await this.request(url);
    const data = await response.json();

    return {
      sha: data.sha,
      tree: (data.tree || []).map((item: any) => {
        const treeItem: GitTreeItem = {
          path: item.path,
          mode: item.mode,
          type: item.type,
          sha: item.sha,
        };
        if (item.size !== undefined) {
          treeItem.size = item.size;
        }
        return treeItem;
      }),
      truncated: Boolean(data.truncated),
    };
  }

  async getFileContent(owner: string, repo: string, path: string, ref: string): Promise<string> {
    const cleanPath = path.replace(/^\/+/, '');
    const url = ref
      ? `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${cleanPath}?ref=${encodeURIComponent(ref)}`
      : `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${cleanPath}`;

    const response = await this.request(url, 'application/vnd.github.v3.raw');
    return response.text();
  }
}
