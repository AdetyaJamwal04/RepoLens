import { parseGitHubUrl } from '../core/github/url-parser';

let lastReportedPayload: string | null = null;

function detectAndNotifyRepo(): void {
  const currentUrl = window.location.href;
  const identity = parseGitHubUrl(currentUrl);
  const serialized = JSON.stringify(identity);

  if (serialized === lastReportedPayload) {
    return;
  }
  lastReportedPayload = serialized;

  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    chrome.runtime.sendMessage({ type: 'REPO_DETECTED', payload: identity }).catch(() => {
      // Background service worker might be dormant or inactive
    });
  }
}

// Initial detection on load
detectAndNotifyRepo();

// GitHub Turbo / PJAX navigation events
document.addEventListener('turbo:load', detectAndNotifyRepo);
document.addEventListener('turbo:render', detectAndNotifyRepo);

// Browser back / forward navigation
window.addEventListener('popstate', detectAndNotifyRepo);

// Intercept pushState & replaceState for SPA navigations
const originalPushState = history.pushState;
history.pushState = function (...args) {
  const result = originalPushState.apply(this, args);
  detectAndNotifyRepo();
  return result;
};

const originalReplaceState = history.replaceState;
history.replaceState = function (...args) {
  const result = originalReplaceState.apply(this, args);
  detectAndNotifyRepo();
  return result;
};
