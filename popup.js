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

// ── State ─────────────────────────────────

let settings = null;
let saveTimeout = null;

document.addEventListener("DOMContentLoaded", async () => {
  const data = await chrome.storage.sync.get("freecfd");
  settings = data.freecfd || structuredClone(DEFAULT_SETTINGS);
  settings = migrateSettings(settings);

  if (!data.freecfd || !Array.isArray((data.freecfd.rules || [])[0]?.matchUrls)) {
    await chrome.storage.sync.set({ freecfd: settings });
  }

  render();
  setupGlobalToggle();
  setupAddButton();
});

// ── Rendering ──────────────────────────────

function render() {
  const container = document.getElementById("rules-container");
  const emptyState = document.getElementById("empty-state");

  container.innerHTML = "";

  if (settings.rules.length === 0) {
    emptyState.style.display = "flex";
    container.style.display = "none";
  } else {
    emptyState.style.display = "none";
    container.style.display = "flex";
    settings.rules.forEach((rule, index) => {
      container.appendChild(createRuleCard(rule, index));
    });
  }
}

function createRuleCard(rule, index) {
  const card = document.createElement("div");
  card.className = "rule-card" + (rule.enabled ? "" : " disabled");
  card.dataset.id = rule.id;

  const firstPattern = rule.matchUrls.length > 0
    ? (rule.matchUrls[0].pattern || "(empty)")
    : "(no match URLs)";
  const matchCount = rule.matchUrls.length;

  card.innerHTML = `
    <div class="rule-header">
      <span class="rule-number">Rule ${index + 1}</span>
      <div class="rule-actions">
        <button class="add-match-btn" data-action="add-match" title="Add match URL">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
          </svg>
        </button>
        <label class="toggle toggle-sm">
          <input type="checkbox" ${rule.enabled ? "checked" : ""} data-action="toggle-rule">
          <span class="toggle-track">
            <span class="toggle-thumb"></span>
          </span>
        </label>
        <button class="delete-btn" data-action="delete-rule" title="Delete rule group">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>
    </div>
    <div class="field">
      <label class="field-label">Prefix URL</label>
      <input type="text" class="field-input" data-field="prefixUrl" value="${escapeAttr(rule.prefixUrl)}" placeholder="https://freedium-mirror.cfd/" spellcheck="false">
    </div>
    <div class="match-urls-section collapsed">
      <div class="match-urls-header" data-action="toggle-matches">
        <div class="match-urls-summary">
          <span class="match-urls-preview">${escapeAttr(firstPattern)}</span>
        </div>
        <div class="match-urls-right">
          <span class="match-count-badge">${matchCount}</span>
          <svg class="chevron-icon" width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
      </div>
      <div class="match-urls-list"></div>
    </div>
    <div class="confirm-bar" data-confirm="rule">
      <span>Delete this rule group?</span>
      <div class="confirm-actions">
        <button class="btn-cancel" data-action="cancel-delete-rule">Cancel</button>
        <button class="btn-confirm-delete" data-action="confirm-delete-rule">Delete</button>
      </div>
    </div>
  `;

  // Populate match URL rows
  const matchList = card.querySelector(".match-urls-list");
  rule.matchUrls.forEach(match => {
    matchList.appendChild(createMatchUrlRow(rule, match, card));
  });

  // Prefix URL input
  const prefixInput = card.querySelector('[data-field="prefixUrl"]');
  prefixInput.addEventListener("input", () => {
    rule.prefixUrl = prefixInput.value;
    debounceSave();
  });

  // Per-rule toggle
  const toggleInput = card.querySelector('[data-action="toggle-rule"]');
  toggleInput.addEventListener("change", () => {
    rule.enabled = toggleInput.checked;
    card.classList.toggle("disabled", !rule.enabled);
    debounceSave();
  });

  // Collapse/expand match URLs
  const section = card.querySelector(".match-urls-section");
  const header = card.querySelector('[data-action="toggle-matches"]');
  header.addEventListener("click", () => {
    section.classList.toggle("collapsed");
  });

  // Add match URL button
  card.querySelector('[data-action="add-match"]').addEventListener("click", () => {
    const newMatch = { id: crypto.randomUUID(), pattern: "" };
    rule.matchUrls.push(newMatch);

    const newRow = createMatchUrlRow(rule, newMatch, card);
    matchList.appendChild(newRow);

    // Auto-expand
    section.classList.remove("collapsed");

    // Focus the new input
    newRow.querySelector("input").focus();

    updateMatchUrlsPreview(card, rule);
    save();
  });

  // Rule-level delete
  const deleteBtn = card.querySelector('[data-action="delete-rule"]');
  const ruleConfirm = card.querySelector('[data-confirm="rule"]');

  deleteBtn.addEventListener("click", () => {
    section.classList.add("collapsed");
    ruleConfirm.classList.add("visible");
  });

  card.querySelector('[data-action="cancel-delete-rule"]').addEventListener("click", () => {
    ruleConfirm.classList.remove("visible");
  });

  card.querySelector('[data-action="confirm-delete-rule"]').addEventListener("click", () => {
    card.classList.add("removing");
    card.addEventListener("animationend", () => {
      settings.rules = settings.rules.filter(r => r.id !== rule.id);
      save();
      render();
    }, { once: true });
  });

  return card;
}

function createMatchUrlRow(rule, match, card) {
  const row = document.createElement("div");
  row.className = "match-url-row";
  row.dataset.matchId = match.id;

  row.innerHTML = `
    <span class="drag-handle" draggable="true" title="Drag to reorder">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
        <circle cx="9" cy="5" r="1.5" fill="currentColor"/>
        <circle cx="15" cy="5" r="1.5" fill="currentColor"/>
        <circle cx="9" cy="12" r="1.5" fill="currentColor"/>
        <circle cx="15" cy="12" r="1.5" fill="currentColor"/>
        <circle cx="9" cy="19" r="1.5" fill="currentColor"/>
        <circle cx="15" cy="19" r="1.5" fill="currentColor"/>
      </svg>
    </span>
    <input type="text" class="field-input match-input" value="${escapeAttr(match.pattern)}" placeholder="*.medium.* or https://medium.com/" spellcheck="false">
    <button class="match-delete-btn" title="Delete this match URL">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
        <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>
    <div class="match-confirm-bar" data-confirm="match">
      <span>Delete?</span>
      <div class="confirm-actions">
        <button class="btn-cancel" data-action="cancel-delete-match">Cancel</button>
        <button class="btn-confirm-delete" data-action="confirm-delete-match">Delete</button>
      </div>
    </div>
  `;

  // Input handler
  const input = row.querySelector("input");
  input.addEventListener("input", () => {
    match.pattern = input.value;
    updateMatchUrlsPreview(card, rule);
    debounceSave();
  });

  // Delete flow
  const deleteBtn = row.querySelector(".match-delete-btn");
  const confirmBar = row.querySelector('[data-confirm="match"]');

  deleteBtn.addEventListener("click", () => {
    confirmBar.classList.add("visible");
  });

  row.querySelector('[data-action="cancel-delete-match"]').addEventListener("click", () => {
    confirmBar.classList.remove("visible");
  });

  row.querySelector('[data-action="confirm-delete-match"]').addEventListener("click", () => {
    row.classList.add("removing");
    row.addEventListener("animationend", () => {
      rule.matchUrls = rule.matchUrls.filter(m => m.id !== match.id);
      row.remove();
      updateMatchUrlsPreview(card, rule);
      save();
    }, { once: true });
  });

  // Drag-to-reorder
  const handle = row.querySelector(".drag-handle");

  handle.addEventListener("dragstart", (e) => {
    row.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", match.id);
  });

  handle.addEventListener("dragend", () => {
    row.classList.remove("dragging");
    card.querySelectorAll(".match-url-row.drag-over").forEach(r => r.classList.remove("drag-over"));
  });

  row.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    row.classList.add("drag-over");
  });

  row.addEventListener("dragleave", () => {
    row.classList.remove("drag-over");
  });

  row.addEventListener("drop", (e) => {
    e.preventDefault();
    row.classList.remove("drag-over");
    const draggedId = e.dataTransfer.getData("text/plain");
    if (draggedId === match.id) return;

    const fromIdx = rule.matchUrls.findIndex(m => m.id === draggedId);
    const toIdx = rule.matchUrls.findIndex(m => m.id === match.id);
    if (fromIdx === -1 || toIdx === -1) return;

    const [moved] = rule.matchUrls.splice(fromIdx, 1);
    rule.matchUrls.splice(toIdx, 0, moved);

    const draggedRow = card.querySelector(`[data-match-id="${draggedId}"]`);
    const matchList = card.querySelector(".match-urls-list");
    if (fromIdx < toIdx) {
      matchList.insertBefore(draggedRow, row.nextSibling);
    } else {
      matchList.insertBefore(draggedRow, row);
    }

    updateMatchUrlsPreview(card, rule);
    save();
  });

  return row;
}

function updateMatchUrlsPreview(card, rule) {
  const preview = card.querySelector(".match-urls-preview");
  const badge = card.querySelector(".match-count-badge");
  preview.textContent = rule.matchUrls.length > 0
    ? (rule.matchUrls[0].pattern || "(empty)")
    : "(no match URLs)";
  badge.textContent = rule.matchUrls.length;
}

// ── Global Toggle ──────────────────────────

function setupGlobalToggle() {
  const toggle = document.querySelector("#global-toggle input");
  toggle.checked = settings.globalEnabled;
  updateGlobalState();

  toggle.addEventListener("change", () => {
    settings.globalEnabled = toggle.checked;
    updateGlobalState();
    save();
  });
}

function updateGlobalState() {
  document.body.classList.toggle("globally-disabled", !settings.globalEnabled);
}

// ── Add Rule ───────────────────────────────

function setupAddButton() {
  document.getElementById("add-rule-btn").addEventListener("click", () => {
    settings.rules.push({
      id: crypto.randomUUID(),
      prefixUrl: "",
      matchUrls: [{ id: crypto.randomUUID(), pattern: "" }],
      enabled: true
    });
    save();
    render();

    // Focus the prefix URL input of the new card
    const container = document.getElementById("rules-container");
    const lastCard = container.lastElementChild;
    if (lastCard) {
      const firstInput = lastCard.querySelector('[data-field="prefixUrl"]');
      if (firstInput) firstInput.focus();
    }
  });
}

// ── Persistence ────────────────────────────

function debounceSave() {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(save, 300);
}

function save() {
  chrome.storage.sync.set({ freecfd: settings });
}

// ── Utility ────────────────────────────────

function escapeAttr(str) {
  return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
