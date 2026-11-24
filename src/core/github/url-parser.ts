export interface RepoIdentity {
  owner: string;
  repo: string;
  branch?: string;
  commitSha?: string;
  path?: string;
  pageType: 'repo_root' | 'tree' | 'blob' | 'pull' | 'issues' | 'other';
}

const RESERVED_PATHS = new Set([
  'settings',
  'explore',
  'marketplace',
  'trending',
  'pricing',
  'features',
  'topics',
  'collections',
  'events',
  'sponsors',
  'login',
  'join',
  'logout',
  'dashboard',
  'notifications',
  'search',
  'orgs',
  'organizations',
  'site',
  'about',
  'contact',
  'security',
  'customer-stories',
  'readme',
  'pulls',
  'issues',
]);

const SHA_REGEX = /^[0-9a-f]{40}$/i;

export function parseGitHubUrl(url: string): RepoIdentity | null {
  if (!url) return null;

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return null;
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  if (hostname !== 'github.com' && hostname !== 'www.github.com') {
    return null;
  }

  const segments = parsedUrl.pathname.split('/').filter(Boolean);
  if (segments.length < 2) {
    return null;
  }

  const owner = segments[0];
  const repo = segments[1].replace(/\.git$/, '');

  if (RESERVED_PATHS.has(owner.toLowerCase())) {
    return null;
  }

  if (segments.length === 2) {
    return {
      owner,
      repo,
      pageType: 'repo_root',
    };
  }

  const action = segments[2].toLowerCase();
  let pageType: RepoIdentity['pageType'] = 'other';

  if (action === 'tree') {
    pageType = 'tree';
  } else if (action === 'blob') {
    pageType = 'blob';
  } else if (action === 'pull' || action === 'pulls') {
    pageType = 'pull';
  } else if (action === 'issues' || action === 'issue') {
    pageType = 'issues';
  } else {
    pageType = 'other';
  }

  const identity: RepoIdentity = {
    owner,
    repo,
    pageType,
  };

  if (action === 'tree' || action === 'blob') {
    if (segments.length > 3) {
      const branchOrSha = segments[3];
      identity.branch = branchOrSha;
      if (SHA_REGEX.test(branchOrSha)) {
        identity.commitSha = branchOrSha;
      }
    }
    if (segments.length > 4) {
      identity.path = segments.slice(4).join('/');
    }
  } else if (action === 'commit' && segments.length > 3) {
    const sha = segments[3];
    if (SHA_REGEX.test(sha)) {
      identity.commitSha = sha;
    }
  }

  return identity;
}
