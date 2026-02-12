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

let settings = null;
let saveTimeout = null;

document.addEventListener("DOMContentLoaded", async () => {
  const data = await chrome.storage.sync.get("freecfd");
  settings = data.freecfd || structuredClone(DEFAULT_SETTINGS);

  if (!data.freecfd) {
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

  card.innerHTML = `
    <div class="rule-header">
      <span class="rule-number">Rule ${index + 1}</span>
      <div class="rule-actions">
        <label class="toggle toggle-sm">
          <input type="checkbox" ${rule.enabled ? "checked" : ""} data-action="toggle-rule">
          <span class="toggle-track">
            <span class="toggle-thumb"></span>
          </span>
        </label>
        <button class="delete-btn" data-action="delete-rule" title="Delete rule">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>
    </div>
    <div class="field">
      <label class="field-label">Match URL</label>
      <input type="text" class="field-input" data-field="matchUrl" value="${escapeAttr(rule.matchUrl)}" placeholder="*.medium.* or https://medium.com/" spellcheck="false">
    </div>
    <div class="field">
      <label class="field-label">Prefix URL</label>
      <input type="text" class="field-input" data-field="prefixUrl" value="${escapeAttr(rule.prefixUrl)}" placeholder="https://freedium-mirror.cfd/" spellcheck="false">
    </div>
    <div class="confirm-bar" data-confirm>
      <span>Delete this rule?</span>
      <div class="confirm-actions">
        <button class="btn-cancel" data-action="cancel-delete">Cancel</button>
        <button class="btn-confirm-delete" data-action="confirm-delete">Delete</button>
      </div>
    </div>
  `;

  // Per-rule toggle
  const toggleInput = card.querySelector('[data-action="toggle-rule"]');
  toggleInput.addEventListener("change", () => {
    rule.enabled = toggleInput.checked;
    card.classList.toggle("disabled", !rule.enabled);
    debounceSave();
  });

  // Delete button — show confirmation
  const deleteBtn = card.querySelector('[data-action="delete-rule"]');
  const confirmBar = card.querySelector('[data-confirm]');

  deleteBtn.addEventListener("click", () => {
    confirmBar.classList.add("visible");
  });

  // Cancel delete
  card.querySelector('[data-action="cancel-delete"]').addEventListener("click", () => {
    confirmBar.classList.remove("visible");
  });

  // Confirm delete
  card.querySelector('[data-action="confirm-delete"]').addEventListener("click", () => {
    card.classList.add("removing");
    card.addEventListener("animationend", () => {
      settings.rules = settings.rules.filter(r => r.id !== rule.id);
      save();
      render();
    }, { once: true });
  });

  // Input fields
  card.querySelectorAll(".field-input").forEach(input => {
    input.addEventListener("input", () => {
      rule[input.dataset.field] = input.value;
      debounceSave();
    });
  });

  return card;
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
      matchUrl: "",
      prefixUrl: "",
      enabled: true
    });
    save();
    render();

    // Focus the first input of the new card
    const container = document.getElementById("rules-container");
    const lastCard = container.lastElementChild;
    if (lastCard) {
      const firstInput = lastCard.querySelector(".field-input");
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
