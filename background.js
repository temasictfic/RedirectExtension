const DEFAULT_RULES = [
  "*.medium.*",
  "https://blog.stackademic.com/",
  "https://towardsdatascience.com/",
  "https://hackernoon.com/",
  "https://levelup.gitconnected.com/",
  "https://betterprogramming.pub/",
  "https://betterhumans.pub/",
  "https://bettermarketing.pub/",
  "https://writingcooperative.com/",
  "https://itnext.io/",
  "https://codeburst.io/",
  "https://infosecwriteups.com/",
  "https://blog.devgenius.io/",
  "https://blog.bitsrc.io/",
  "https://blog.usejournal.com/",
  "https://blog.prototypr.io/",
  "https://uxdesign.cc/",
  "https://uxplanet.org/",
  "https://proandroiddev.com/",
  "https://javascript.plainenglish.io/",
  "https://python.plainenglish.io/",
  "https://aws.plainenglish.io/",
  "https://plainenglish.io/",
  "https://entrepreneurshandbook.co/",
  "https://thebolditalic.com/",
  "https://chatbotslife.com/",
  "https://code.likeagirl.io/",
  "https://byrslf.co/",
  "https://thebelladonnacomedy.com/",
];

const DEFAULT_SETTINGS = {
  globalEnabled: true,
  rules: DEFAULT_RULES.map(matchUrl => ({
    id: crypto.randomUUID(),
    matchUrl,
    prefixUrl: "https://freedium-mirror.cfd/",
    enabled: true
  }))
};

let settings = { globalEnabled: true, rules: [] };
let regexCache = new Map();

function wildcardToRegex(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const withWildcards = escaped.replace(/\*/g, '.*');
  return new RegExp('^' + withWildcards);
}

function rebuildRegexCache() {
  regexCache.clear();
  for (const rule of settings.rules) {
    try {
      regexCache.set(rule.id, wildcardToRegex(rule.matchUrl));
    } catch (e) {
      // Invalid pattern — skip
    }
  }
}

async function loadSettings() {
  const data = await chrome.storage.sync.get("freecfd");
  if (data.freecfd) {
    settings = data.freecfd;
  } else {
    settings = structuredClone(DEFAULT_SETTINGS);
    await chrome.storage.sync.set({ freecfd: settings });
  }
  rebuildRegexCache();
}

loadSettings();

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.freecfd) {
    settings = changes.freecfd.newValue;
    rebuildRegexCache();
  }
});

const recentRedirects = new Map();

chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (details.frameId !== 0) return;
  if (!settings.globalEnabled) return;

  const url = details.url;
  const tabId = details.tabId;

  // Debounce: skip if we just redirected this tab in the last 500ms
  const lastRedirect = recentRedirects.get(tabId);
  if (lastRedirect && Date.now() - lastRedirect < 500) return;

  for (const rule of settings.rules) {
    if (!rule.enabled) continue;

    // Loop prevention: skip if URL already starts with the prefix
    if (url.startsWith(rule.prefixUrl)) continue;

    const regex = regexCache.get(rule.id);
    if (regex && regex.test(url)) {
      const redirectUrl = rule.prefixUrl + url;
      recentRedirects.set(tabId, Date.now());
      chrome.tabs.update(tabId, { url: redirectUrl });
      return;
    }
  }
});

// Clean up stale entries from recentRedirects
setInterval(() => {
  const now = Date.now();
  for (const [tabId, timestamp] of recentRedirects) {
    if (now - timestamp > 5000) {
      recentRedirects.delete(tabId);
    }
  }
}, 10000);
