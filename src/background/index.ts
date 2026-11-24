import type { RepoIdentity } from '../core/github/url-parser';
import { parseGitHubUrl } from '../core/github/url-parser';

// Active tab to repository mapping
export const tabRepoMap = new Map<number, RepoIdentity>();

const VALID_PAGE_TYPES = new Set<RepoIdentity['pageType']>([
  'repo_root',
  'tree',
  'blob',
  'pull',
  'issues',
  'other',
]);

function isValidRepoIdentity(payload: unknown): payload is RepoIdentity {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return false;
  }
  const candidate = payload as Record<string, unknown>;
  if (
    typeof candidate.owner !== 'string' ||
    !candidate.owner ||
    typeof candidate.repo !== 'string' ||
    !candidate.repo ||
    typeof candidate.pageType !== 'string' ||
    !VALID_PAGE_TYPES.has(candidate.pageType as RepoIdentity['pageType'])
  ) {
    return false;
  }
  if (candidate.branch !== undefined && typeof candidate.branch !== 'string') return false;
  if (candidate.commitSha !== undefined && typeof candidate.commitSha !== 'string') return false;
  if (candidate.path !== undefined && typeof candidate.path !== 'string') return false;
  return true;
}

function resolveRepoForTab(tab: chrome.tabs.Tab | undefined): RepoIdentity | null {
  if (!tab || tab.id === undefined) {
    return null;
  }
  if (tab.url) {
    const parsed = parseGitHubUrl(tab.url);
    if (!parsed) {
      tabRepoMap.delete(tab.id);
      return null;
    }
    tabRepoMap.set(tab.id, parsed);
    return parsed;
  }
  return tabRepoMap.get(tab.id) ?? null;
}

// Side panel setup
if (typeof chrome !== 'undefined' && chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error: unknown) => console.error('[RepoLens] Failed to set side panel behavior:', error));
}

if (typeof chrome !== 'undefined' && chrome.runtime?.onInstalled) {
  chrome.runtime.onInstalled.addListener(() => {
    console.log('[RepoLens] Extension installed');
  });
}

// Clean up mapping when tab is closed
if (typeof chrome !== 'undefined' && chrome.tabs?.onRemoved) {
  chrome.tabs.onRemoved.addListener((tabId) => {
    tabRepoMap.delete(tabId);
  });
}

// Listen for messages from content scripts and side panel
if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === 'REPO_DETECTED') {
      const tabId = sender.tab?.id;
      if (tabId !== undefined) {
        if (sender.tab?.url) {
          const verified = parseGitHubUrl(sender.tab.url);
          if (verified && message.payload) {
            tabRepoMap.set(tabId, verified);
          } else {
            tabRepoMap.delete(tabId);
          }
        } else if (isValidRepoIdentity(message.payload)) {
          tabRepoMap.set(tabId, message.payload);
        } else {
          tabRepoMap.delete(tabId);
        }
      }
      sendResponse({ success: true });
      return false;
    }

    if (message?.type === 'GET_CURRENT_REPO') {
      const requestedTabId = message.payload?.tabId;
      if (requestedTabId !== undefined) {
        if (typeof requestedTabId !== 'number') {
          sendResponse({ repo: null });
          return false;
        }
        if (chrome.tabs?.get) {
          chrome.tabs.get(requestedTabId, (tab) => {
            if (chrome.runtime?.lastError || !tab) {
              tabRepoMap.delete(requestedTabId);
              sendResponse({ repo: null });
              return;
            }
            sendResponse({ repo: resolveRepoForTab(tab) });
          });
          return true; // Keep channel open for async sendResponse
        }
        const repo = tabRepoMap.get(requestedTabId) ?? null;
        sendResponse({ repo });
        return false;
      }

      if (chrome.tabs?.query) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          sendResponse({ repo: resolveRepoForTab(tabs[0]) });
        });
        return true; // Keep channel open for async sendResponse
      }

      sendResponse({ repo: null });
      return false;
    }
  });
}
