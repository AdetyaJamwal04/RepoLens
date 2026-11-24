import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Background Service Worker Tab Navigation Validation', () => {
  type MessageListener = (
    message: any,
    sender: any,
    sendResponse: (res: any) => void
  ) => boolean | undefined;

  let messageListener: MessageListener;
  let tabsQueryMock: ReturnType<typeof vi.fn>;
  let tabsGetMock: ReturnType<typeof vi.fn>;
  let tabRepoMap: Map<number, unknown>;

  beforeEach(async () => {
    vi.resetModules();
    vi.unstubAllGlobals();

    tabsQueryMock = vi.fn();
    tabsGetMock = vi.fn();

    vi.stubGlobal('chrome', {
      sidePanel: {
        setPanelBehavior: vi.fn().mockResolvedValue(undefined),
      },
      runtime: {
        lastError: undefined,
        onInstalled: { addListener: vi.fn() },
        onMessage: {
          addListener: vi.fn((fn: MessageListener) => {
            messageListener = fn;
          }),
        },
      },
      tabs: {
        onRemoved: { addListener: vi.fn() },
        query: tabsQueryMock,
        get: tabsGetMock,
      },
    });

    const mod = await import('../../src/background/index');
    tabRepoMap = mod.tabRepoMap;
    tabRepoMap.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('re-validates activeTab.url in GET_CURRENT_REPO and clears stale mapping when navigating away from GitHub', () => {
    tabRepoMap.set(10, { owner: 'facebook', repo: 'react', pageType: 'repo_root' });
    tabsQueryMock.mockImplementation((_q: unknown, cb: (tabs: any[]) => void) => {
      cb([{ id: 10, url: 'https://google.com/search?q=react' }]);
    });

    const sendResponse = vi.fn();
    const isAsync = messageListener({ type: 'GET_CURRENT_REPO' }, {}, sendResponse);

    expect(isAsync).toBe(true);
    expect(sendResponse).toHaveBeenCalledWith({ repo: null });
    expect(tabRepoMap.has(10)).toBe(false);
  });

  it('re-validates requestedTabId via chrome.tabs.get before returning', () => {
    tabRepoMap.set(22, { owner: 'facebook', repo: 'react', pageType: 'repo_root' });
    tabsGetMock.mockImplementation((_tabId: number, cb: (tab: any) => void) => {
      cb({ id: 22, url: 'https://github.com/explore' });
    });

    const sendResponse = vi.fn();
    const isAsync = messageListener(
      { type: 'GET_CURRENT_REPO', payload: { tabId: 22 } },
      {},
      sendResponse
    );

    expect(isAsync).toBe(true);
    expect(tabsGetMock).toHaveBeenCalledWith(22, expect.any(Function));
    expect(sendResponse).toHaveBeenCalledWith({ repo: null });
    expect(tabRepoMap.has(22)).toBe(false);
  });

  it('validates and derives identity from sender.tab.url in REPO_DETECTED', () => {
    const sendResponse = vi.fn();
    messageListener(
      {
        type: 'REPO_DETECTED',
        payload: { owner: 'spoofed', repo: 'evil', pageType: 'repo_root' },
      },
      { tab: { id: 5, url: 'https://github.com/vercel/next.js' } },
      sendResponse
    );

    expect(sendResponse).toHaveBeenCalledWith({ success: true });
    expect(tabRepoMap.get(5)).toEqual({
      owner: 'vercel',
      repo: 'next.js',
      pageType: 'repo_root',
    });

    // Rejects invalid payload when sender.tab.url is absent
    messageListener(
      { type: 'REPO_DETECTED', payload: { bad: true } },
      { tab: { id: 5 } },
      sendResponse
    );
    expect(tabRepoMap.has(5)).toBe(false);
  });
});
