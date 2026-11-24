import type { RepoIdentity } from '../core/github/url-parser';
import { parseGitHubUrl } from '../core/github/url-parser';

// Active tab to repository mapping
export const tabRepoMap = new Map<number, RepoIdentity>();

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
        if (message.payload) {
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
        const repo = tabRepoMap.get(requestedTabId) ?? null;
        sendResponse({ repo });
        return false;
      }

      if (chrome.tabs?.query) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          const activeTab = tabs[0];
          if (!activeTab || activeTab.id === undefined) {
            sendResponse({ repo: null });
            return;
          }

          let repo = tabRepoMap.get(activeTab.id) ?? null;
          if (!repo && activeTab.url) {
            const parsed = parseGitHubUrl(activeTab.url);
            if (parsed) {
              tabRepoMap.set(activeTab.id, parsed);
              repo = parsed;
            }
          }

          sendResponse({ repo });
        });
        return true; // Keep channel open for async sendResponse
      }

      sendResponse({ repo: null });
      return false;
    }
  });
}
