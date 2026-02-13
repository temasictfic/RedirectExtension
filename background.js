const DEFAULT_MATCH_PATTERNS = [
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
  rules: [{
    id: crypto.randomUUID(),
    prefixUrl: "https://freedium-mirror.cfd/",
    matchUrls: DEFAULT_MATCH_PATTERNS.map(pattern => ({
      id: crypto.randomUUID(),
      pattern
    })),
    enabled: true
  }]
};

// ── Migration ─────────────────────────────

function migrateSettings(data) {
  if (!data.rules || data.rules.length === 0) return data;
  if (Array.isArray(data.rules[0].matchUrls)) return data;

  const groupMap = new Map();
  for (const oldRule of data.rules) {
    const key = oldRule.prefixUrl || "";
    if (!groupMap.has(key)) {
      groupMap.set(key, { matchUrls: [], hasEnabled: false });
    }
    const group = groupMap.get(key);
    group.matchUrls.push({ id: crypto.randomUUID(), pattern: oldRule.matchUrl || "" });
    if (oldRule.enabled) group.hasEnabled = true;
  }

  const newRules = [];
  for (const [prefixUrl, group] of groupMap) {
    newRules.push({
      id: crypto.randomUUID(),
      prefixUrl,
      matchUrls: group.matchUrls,
      enabled: group.hasEnabled
    });
  }

  return { globalEnabled: data.globalEnabled ?? true, rules: newRules };
}

// ── Regex ─────────────────────────────────

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
    for (const match of rule.matchUrls) {
      try {
        regexCache.set(match.id, wildcardToRegex(match.pattern));
      } catch (e) {
        // Invalid pattern — skip
      }
    }
  }
}

// ── Settings ──────────────────────────────

async function loadSettings() {
  const data = await chrome.storage.sync.get("freecfd");
  if (data.freecfd) {
    settings = migrateSettings(data.freecfd);
    // Persist if migration happened
    if (data.freecfd !== settings) {
      await chrome.storage.sync.set({ freecfd: settings });
    }
  } else {
    settings = structuredClone(DEFAULT_SETTINGS);
    await chrome.storage.sync.set({ freecfd: settings });
  }
  rebuildRegexCache();
}

loadSettings();

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.freecfd) {
    settings = migrateSettings(changes.freecfd.newValue);
    rebuildRegexCache();
  }
});

// ── Redirect ──────────────────────────────

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

    for (const match of rule.matchUrls) {
      const regex = regexCache.get(match.id);
      if (regex && regex.test(url)) {
        const redirectUrl = rule.prefixUrl + url;
        recentRedirects.set(tabId, Date.now());
        chrome.tabs.update(tabId, { url: redirectUrl });
        return;
      }
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
