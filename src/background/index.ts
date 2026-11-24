// RepoLens Background Service Worker
console.log('[RepoLens] Background service worker initialized');

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
