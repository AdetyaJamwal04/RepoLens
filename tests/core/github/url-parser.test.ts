import { describe, it, expect } from 'vitest';
import { parseGitHubUrl } from '../../../src/core/github/url-parser';

describe('parseGitHubUrl', () => {
  it('parses repository root URL', () => {
    const parsed = parseGitHubUrl('https://github.com/facebook/react');
    expect(parsed).toEqual({
      owner: 'facebook',
      repo: 'react',
      pageType: 'repo_root'
    });
  });

  it('parses repository root with trailing slash', () => {
    const parsed = parseGitHubUrl('https://github.com/facebook/react/');
    expect(parsed).toEqual({
      owner: 'facebook',
      repo: 'react',
      pageType: 'repo_root'
    });
  });

  it('parses tree and blob URLs with branches and paths', () => {
    const tree = parseGitHubUrl('https://github.com/facebook/react/tree/main/packages/react');
    expect(tree).toEqual({
      owner: 'facebook',
      repo: 'react',
      branch: 'main',
      path: 'packages/react',
      pageType: 'tree'
    });

    const blob = parseGitHubUrl('https://github.com/facebook/react/blob/main/packages/react/index.js');
    expect(blob).toEqual({
      owner: 'facebook',
      repo: 'react',
      branch: 'main',
      path: 'packages/react/index.js',
      pageType: 'blob'
    });
  });

  it('parses commit SHA URLs', () => {
    const commit = parseGitHubUrl('https://github.com/facebook/react/tree/7743520cb6f403677e0db4fed575ad0e972f53b5/src');
    expect(commit).toEqual({
      owner: 'facebook',
      repo: 'react',
      commitSha: '7743520cb6f403677e0db4fed575ad0e972f53b5',
      branch: '7743520cb6f403677e0db4fed575ad0e972f53b5',
      path: 'src',
      pageType: 'tree'
    });
  });

  it('parses pull requests and issues pages', () => {
    const pr = parseGitHubUrl('https://github.com/facebook/react/pull/123');
    expect(pr?.pageType).toBe('pull');
    expect(pr?.owner).toBe('facebook');
    expect(pr?.repo).toBe('react');

    const issues = parseGitHubUrl('https://github.com/facebook/react/issues');
    expect(issues?.pageType).toBe('issues');
  });

  it('returns null for non-repository GitHub URLs', () => {
    expect(parseGitHubUrl('https://github.com/settings/profile')).toBeNull();
    expect(parseGitHubUrl('https://github.com/explore')).toBeNull();
    expect(parseGitHubUrl('https://github.com/marketplace')).toBeNull();
    expect(parseGitHubUrl('https://google.com')).toBeNull();
    expect(parseGitHubUrl('')).toBeNull();
  });
});
