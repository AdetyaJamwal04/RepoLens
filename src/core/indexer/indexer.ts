import { GitTreeItem, RepoMetadata } from '../github/client';
import { RepoIdentity } from '../github/url-parser';
import {
  isExcluded,
  isManifest,
  isCandidateEntryPoint,
  getFilePriorityScore,
  detectLanguages,
} from './prioritizer';

export interface PrioritizationResult {
  prioritized: string[];
  excluded: string[];
  manifests: string[];
  candidateEntryPoints: string[];
}

export interface RepoIndex {
  identity: RepoIdentity;
  defaultBranch: string;
  commitSha: string;
  languages: string[];
  manifests: string[];
  candidateEntryPoints: string[];
  prioritizedFiles: string[];
  treeOutline: string;
}

interface TreeNode {
  name: string;
  isDir: boolean;
  children: Map<string, TreeNode>;
}

export function generateTreeOutline(tree: GitTreeItem[], maxDepth = 3): string {
  const root: TreeNode = { name: '', isDir: true, children: new Map() };

  for (const item of tree) {
    if (isExcluded(item.path, item.type)) continue;

    const parts = item.path.replace(/\\/g, '/').replace(/^\/+/, '').split('/');
    let current = root;

    for (let depth = 0; depth < parts.length; depth++) {
      const part = parts[depth];
      const isLast = depth === parts.length - 1;
      const isDir = !isLast || item.type === 'tree';

      if (!current.children.has(part)) {
        current.children.set(part, {
          name: part,
          isDir,
          children: new Map(),
        });
      }

      current = current.children.get(part)!;
      if (isDir) {
        current.isDir = true;
      }
    }
  }

  const lines: string[] = [];

  function renderNode(node: TreeNode, currentDepth: number) {
    if (currentDepth > maxDepth) return;

    const sortedChildren = Array.from(node.children.values()).sort((a, b) => {
      if (a.isDir !== b.isDir) {
        return a.isDir ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    for (const child of sortedChildren) {
      const indent = '  '.repeat(currentDepth);
      if (child.isDir) {
        lines.push(`${indent}${child.name}/`);
        renderNode(child, currentDepth + 1);
      } else {
        lines.push(`${indent}${child.name}`);
      }
    }
  }

  renderNode(root, 0);
  return lines.join('\n');
}

export function prioritizeTree(tree: GitTreeItem[], maxPrioritized = 20): PrioritizationResult {
  const excluded: string[] = [];
  const manifests: string[] = [];
  const candidateEntryPoints: string[] = [];
  const eligibleFiles: { path: string; score: number; index: number }[] = [];

  for (let i = 0; i < tree.length; i++) {
    const item = tree[i];
    if (isExcluded(item.path, item.type)) {
      excluded.push(item.path);
      continue;
    }

    if (item.type === 'tree') {
      continue;
    }

    if (isManifest(item.path)) {
      manifests.push(item.path);
    }

    if (isCandidateEntryPoint(item.path)) {
      candidateEntryPoints.push(item.path);
    }

    const score = getFilePriorityScore(item.path);
    eligibleFiles.push({ path: item.path, score, index: i });
  }

  eligibleFiles.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.index - b.index;
  });

  const prioritized = eligibleFiles.slice(0, maxPrioritized).map(f => f.path);

  return {
    prioritized,
    excluded,
    manifests,
    candidateEntryPoints,
  };
}

export function buildRepoIndex(
  identity: RepoIdentity,
  tree: GitTreeItem[],
  metadata?: Partial<RepoMetadata>
): RepoIndex {
  const prioritization = prioritizeTree(tree);
  const languages = detectLanguages(tree, metadata);
  const treeOutline = generateTreeOutline(tree);

  return {
    identity,
    defaultBranch: metadata?.defaultBranch || identity.branch || 'main',
    commitSha: identity.commitSha || '',
    languages,
    manifests: prioritization.manifests,
    candidateEntryPoints: prioritization.candidateEntryPoints,
    prioritizedFiles: prioritization.prioritized,
    treeOutline,
  };
}

export const extractRepoIndex = buildRepoIndex;
