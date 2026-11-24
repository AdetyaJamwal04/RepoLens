import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitHubClient, RateLimitError, NotFoundError, GitHubApiError } from '../../../src/core/github/client';

describe('GitHubClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('attaches Authorization header when token is provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        owner: { login: 'facebook' },
        name: 'react',
        default_branch: 'main',
        description: 'React library',
        private: false,
        language: 'JavaScript'
      }),
      headers: new Headers({ 'x-ratelimit-remaining': '4999', 'x-ratelimit-reset': '1700000000' })
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new GitHubClient('ghp_test123');
    const meta = await client.getRepoMetadata('facebook', 'react');
    expect(meta.name).toBe('react');
    expect(meta.defaultBranch).toBe('main');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/repos/facebook/react',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer ghp_test123',
          Accept: 'application/vnd.github.v3+json'
        })
      })
    );
  });

  it('sends request without Authorization header when token is omitted', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        owner: { login: 'facebook' },
        name: 'react',
        default_branch: 'main',
        description: null,
        private: false,
        language: null
      }),
      headers: new Headers({ 'x-ratelimit-remaining': '59', 'x-ratelimit-reset': '1700000000' })
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new GitHubClient();
    await client.getRepoMetadata('facebook', 'react');
    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers.Authorization).toBeUndefined();
  });

  it('detects rate limits and throws RateLimitError with remaining and reset info', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      headers: new Headers({ 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1700003600' }),
      json: async () => ({ message: 'API rate limit exceeded' })
    }));

    const client = new GitHubClient();
    await expect(client.getRepoMetadata('owner', 'repo')).rejects.toThrowError(RateLimitError);
    await expect(client.getRepoMetadata('owner', 'repo')).rejects.toMatchObject({
      remaining: 0,
      resetTimestamp: 1700003600,
      name: 'RateLimitError'
    });
  });

  it('throws NotFoundError on 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      headers: new Headers(),
      json: async () => ({ message: 'Not Found' })
    }));

    const client = new GitHubClient();
    await expect(client.getRepoMetadata('owner', 'nonexistent')).rejects.toThrowError(NotFoundError);
  });

  it('throws GitHubApiError on other error statuses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      headers: new Headers(),
      json: async () => ({ message: 'Internal Server Error' })
    }));

    const client = new GitHubClient();
    await expect(client.getRepoMetadata('owner', 'repo')).rejects.toThrowError(GitHubApiError);
    await expect(client.getRepoMetadata('owner', 'repo')).rejects.toMatchObject({
      status: 500,
      name: 'GitHubApiError'
    });
  });

  it('fetches recursive git tree with truncation detection', async () => {
    const mockTree = [
      { path: 'package.json', mode: '100644', type: 'blob', sha: 'sha1', size: 120 },
      { path: 'src', mode: '040000', type: 'tree', sha: 'sha2' }
    ];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'x-ratelimit-remaining': '50' }),
      json: async () => ({
        sha: 'main',
        tree: mockTree,
        truncated: false
      })
    }));

    const client = new GitHubClient();
    const result = await client.getTree('owner', 'repo', 'main');
    expect(result.tree).toHaveLength(2);
    expect(result.truncated).toBe(false);
    expect(result.sha).toBe('main');
  });

  it('fetches raw file content via raw accept header', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'x-ratelimit-remaining': '50' }),
      text: async () => 'console.log("hello world");'
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new GitHubClient();
    const content = await client.getFileContent('owner', 'repo', 'src/index.ts', 'main');
    expect(content).toBe('console.log("hello world");');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/repos/owner/repo/contents/src/index.ts?ref=main',
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: 'application/vnd.github.v3.raw'
        })
      })
    );
  });
});
