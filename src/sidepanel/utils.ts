import type { MouseEvent } from 'react';
import type { EvidenceItem } from '../core/ai/types';

export type AnalysisStatus =
  | 'idle'
  | 'detecting'
  | 'indexing'
  | 'analyzing'
  | 'ready'
  | 'error';

export type TabId = 'overview' | 'architecture' | 'explorer' | 'flow' | 'ask';

export const EXTERNAL_LINK_CLASSES =
  'text-indigo-400 hover:text-indigo-300 underline decoration-indigo-500/40 hover:decoration-indigo-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded';

export function sanitizeExternalUrl(url: string): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

export interface GitHubFileUrlOptions {
  owner: string;
  repo: string;
  ref?: string;
  filePath: string;
  lineStart?: number;
  lineEnd?: number;
  type?: 'dir' | 'file';
}

export function buildGitHubFileUrl({
  owner,
  repo,
  ref = 'main',
  filePath,
  lineStart,
  lineEnd,
  type = 'file',
}: GitHubFileUrlOptions): string {
  const safeOwner = encodeURIComponent(owner);
  const safeRepo = encodeURIComponent(repo);
  const cleanRef = (ref || 'main').replace(/^\/+|\/+$/g, '');
  const encodedRef = cleanRef
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/');

  const cleanPath = filePath.replace(/^\/+|\/+$/g, '');
  if (!cleanPath) {
    return `https://github.com/${safeOwner}/${safeRepo}`;
  }

  const encodedPath = cleanPath
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/');

  const kind = type === 'dir' ? 'tree' : 'blob';
  let lineHash = '';
  if (type !== 'dir' && typeof lineStart === 'number' && Number.isInteger(lineStart) && lineStart > 0) {
    lineHash = `#L${lineStart}`;
    if (typeof lineEnd === 'number' && Number.isInteger(lineEnd) && lineEnd >= lineStart) {
      lineHash += `-L${lineEnd}`;
    }
  }

  return `https://github.com/${safeOwner}/${safeRepo}/${kind}/${encodedRef || 'main'}/${encodedPath}${lineHash}`;
}

export function openSafeExternalUrl(url: string): void {
  const safeUrl = sanitizeExternalUrl(url);
  if (!safeUrl) return;

  if (typeof chrome !== 'undefined' && typeof chrome.tabs?.create === 'function') {
    chrome.tabs.create({ url: safeUrl }).catch(() => {
      if (typeof window !== 'undefined') {
        window.open(safeUrl, '_blank', 'noopener,noreferrer');
      }
    });
    return;
  }

  if (typeof window !== 'undefined') {
    window.open(safeUrl, '_blank', 'noopener,noreferrer');
  }
}

export function handleExternalLinkClick(
  event: MouseEvent<HTMLAnchorElement>,
  url: string
): void {
  const safeUrl = sanitizeExternalUrl(url);
  if (!safeUrl) {
    event.preventDefault();
    return;
  }

  if (typeof chrome !== 'undefined' && typeof chrome.tabs?.create === 'function') {
    event.preventDefault();
    openSafeExternalUrl(safeUrl);
  }
}

export function formatEvidenceCitation(evidence: EvidenceItem): string {
  if (typeof evidence.lineStart === 'number' && evidence.lineStart > 0) {
    if (typeof evidence.lineEnd === 'number' && evidence.lineEnd >= evidence.lineStart) {
      return `${evidence.filePath}#L${evidence.lineStart}-L${evidence.lineEnd}`;
    }
    return `${evidence.filePath}#L${evidence.lineStart}`;
  }
  return evidence.filePath;
}

export type MarkdownBlock =
  | { type: 'heading'; level: number; text: string }
  | { type: 'code'; language: string; content: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'paragraph'; text: string };

export function parseMarkdownBlocks(input: string): MarkdownBlock[] {
  const lines = input.replace(/\r\n/g, '\n').split('\n');
  const blocks: MarkdownBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i++;
      continue;
    }

    if (line.trimStart().startsWith('```')) {
      const fenceMatch = line.trimStart().match(/^```([a-zA-Z0-9_-]*)/);
      const language = fenceMatch?.[1] || '';
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++;
      blocks.push({ type: 'code', language, content: codeLines.join('\n') });
      continue;
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length,
        text: headingMatch[2].trim(),
      });
      i++;
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, '').trim());
        i++;
      }
      blocks.push({ type: 'ul', items });
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, '').trim());
        i++;
      }
      blocks.push({ type: 'ol', items });
      continue;
    }

    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].trimStart().startsWith('```') &&
      !/^(#{1,3})\s+/.test(lines[i]) &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i])
    ) {
      paraLines.push(lines[i].trim());
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push({ type: 'paragraph', text: paraLines.join(' ') });
    }
  }

  return blocks;
}

export type InlineToken =
  | { type: 'text'; value: string }
  | { type: 'bold'; value: string }
  | { type: 'code'; value: string }
  | { type: 'link'; label: string; url: string };

export function parseInlineTokens(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  const pattern = /(\[([^\]]+)\]\(([^)]+)\)|`([^`]+)`|\*\*([^*]+)\*\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    }

    if (match[2] !== undefined && match[3] !== undefined) {
      const safeUrl = sanitizeExternalUrl(match[3]);
      if (safeUrl) {
        tokens.push({ type: 'link', label: match[2], url: safeUrl });
      } else {
        tokens.push({ type: 'text', value: match[2] });
      }
    } else if (match[4] !== undefined) {
      tokens.push({ type: 'code', value: match[4] });
    } else if (match[5] !== undefined) {
      tokens.push({ type: 'bold', value: match[5] });
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    tokens.push({ type: 'text', value: text.slice(lastIndex) });
  }

  return tokens;
}
