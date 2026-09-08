// Every state-changing request carries this header. The server refuses any
// POST without it (see requireSameOrigin in server.mjs). A cross-origin page
// cannot set a custom header without a CORS preflight, and this server
// answers no preflights, so a forged form post from another site fails
// before it reaches a route. That was the audit's first critical finding.
const JSON_POST_HEADERS = {
  "Content-Type": "application/json",
  "X-Requested-By": "kcit-dashboard",
};

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function loadDigest() {
  const el = document.getElementById("digest-content");
  try {
    const { digest, exists } = await fetchJson("/api/digest");
    if (!exists) {
      el.innerHTML = '<p class="empty">No digest yet - executive-assistant hasn\'t produced one.</p>';
      return;
    }
    el.innerHTML = `<div class="digest-body">${escapeHtml(digest)}</div>`;
  } catch (err) {
    el.textContent = `Failed to load: ${err.message}`;
  }
}

async function loadCosts() {
  const el = document.getElementById("costs-content");
  try {
    const { clients } = await fetchJson("/api/costs");
    if (clients.length === 0) {
      el.innerHTML = '<p class="empty">No usage recorded yet. Run dashboard/cost-report.mjs to pull the latest.</p>';
      return;
    }
    const totalCost = clients.reduce((sum, c) => sum + c.cost_usd, 0);
    const rows = clients
      .map(
        (c) => `<tr>
          <td>${escapeHtml(c.client_id)}</td>
          <td>${c.requests}</td>
          <td class="cost-total">$${c.cost_usd.toFixed(4)}</td>
        </tr>`
      )
      .join("");
    el.innerHTML = `
      <table>
        <thead><tr><th>Client</th><th>Requests</th><th>Cost</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><th>Total</th><th></th><th class="cost-total">$${totalCost.toFixed(4)}</th></tr></tfoot>
      </table>`;
  } catch (err) {
    el.textContent = `Failed to load: ${err.message}`;
  }
}

async function loadAgentCosts() {
  const el = document.getElementById("agent-costs-content");
  try {
    const { agents } = await fetchJson("/api/agent-costs");
    if (agents.length === 0) {
      el.innerHTML = '<p class="empty">No dashboard chat runs yet.</p>';
      return;
    }
    const totalCost = agents.reduce((sum, a) => sum + a.cost_usd, 0);
    const rows = agents
      .map(
        (a) => `<tr>
          <td>${escapeHtml(a.agent_name)}</td>
          <td>${a.runs}</td>
          <td class="cost-total">$${a.cost_usd.toFixed(4)}</td>
        </tr>`
      )
      .join("");
    el.innerHTML = `
      <table>
        <thead><tr><th>Agent</th><th>Runs</th><th>Cost</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><th>Total</th><th></th><th class="cost-total">$${totalCost.toFixed(4)}</th></tr></tfoot>
      </table>`;
  } catch (err) {
    el.textContent = `Failed to load: ${err.message}`;
  }
}

async function loadActivity() {
  const el = document.getElementById("activity-content");
  try {
    const { entries } = await fetchJson("/api/activity");
    if (entries.length === 0) {
      el.innerHTML = '<p class="empty">No activity logged yet.</p>';
      return;
    }
    el.innerHTML = entries
      .map(
        (e) => `<div class="activity-entry">
          <span class="activity-agent">${escapeHtml(e.agent)}</span>
          <span class="activity-date">&middot; ${escapeHtml(e.date)}</span>
          <div>${escapeHtml(e.summary)}</div>
        </div>`
      )
      .join("");
  } catch (err) {
    el.textContent = `Failed to load: ${err.message}`;
  }
}

function appendChatMessage(log, role, text) {
  log.querySelector(".chat-empty")?.remove();
  const el = document.createElement("div");
  el.className = `chat-msg ${role}`;
  el.textContent = text;
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
  return el;
}

// --- Resizable chat column ----------------------------------------------

function initResize() {
  const chatColumn = document.getElementById("chat-column");
  const handle = document.getElementById("resize-handle");
  const app = document.getElementById("app");
  let dragging = false;
  handle.addEventListener("mousedown", (e) => {
    dragging = true;
    handle.classList.add("active");
    e.preventDefault();
  });
  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const rect = app.getBoundingClientRect();
    const w = Math.min(660, Math.max(320, e.clientX - rect.left));
    chatColumn.style.width = `${w}px`;
  });
  window.addEventListener("mouseup", () => {
    dragging = false;
    handle.classList.remove("active");
  });
}

// --- Tabs -------------------------------------------------------------

function initTabs() {
  const tabs = document.getElementById("tabs");
  tabs.addEventListener("click", (e) => {
    const btn = e.target.closest(".tab");
    if (!btn) return;
    for (const t of tabs.querySelectorAll(".tab")) t.classList.toggle("active", t === btn);
    for (const panel of document.querySelectorAll(".tab-panel")) {
      panel.hidden = panel.dataset.tabPanel !== btn.dataset.tab;
    }
  });
}

// --- Auto-approve: an explicit, loud, human-flipped override -----------
// Session-only, never persisted - see permissions.mjs for why this is a
// visible toggle and not a smarter allowlist.

async function initAutoApprove() {
  const btn = document.getElementById("auto-toggle");
  const warning = document.getElementById("auto-warning");

  function render(on) {
    btn.textContent = on ? "[ auto-approve: on ]" : "[ auto-approve: off ]";
    btn.classList.toggle("solid", on);
    warning.classList.toggle("show", on);
  }

  try {
    const { autoApprove } = await fetchJson("/api/auto-approve");
    render(autoApprove);
  } catch {
    // starts rendered off, matches the safe default if this fails
  }

  btn.addEventListener("click", async () => {
    const wantOn = !btn.classList.contains("solid");
    try {
      const { autoApprove } = await fetchJson("/api/auto-approve", {
        method: "POST",
        headers: JSON_POST_HEADERS,
        body: JSON.stringify({ on: wantOn }),
      });
      render(autoApprove);
    } catch {
      // leave it as it was - a failed toggle should not silently claim success
    }
  });
}

// --- Fleet: what's running right now -----------------------------------
// Polls independently of any in-flight chat request, because a
// scheduler-fired run (the 7am standup, prospect-scout's Mon/Wed/Fri slot)
// starts with no browser request active at all.

let fleetTimer = null;

function renderRuns(runs) {
  const el = document.getElementById("fleet-content");

  // One frame per agent that's actually doing something right now, not one
  // per top-level run with everything else nested inside it. A tool's own
  // `agent` field (resolved server-side in runs.mjs) already says who's
  // really running it, whether that's the agent Kevin addressed directly
  // or one it delegated to - grouping by that field is what separates them.
  const byAgent = new Map();
  for (const run of runs) {
    if (!byAgent.has(run.agent)) byAgent.set(run.agent, { agent: run.agent, tools: [] });
    for (const tool of run.activeTools) {
      const key = tool.agent || run.agent;
      if (!byAgent.has(key)) byAgent.set(key, { agent: key, tools: [] });
      byAgent.get(key).tools.push(tool);
    }
  }

  const groups = [...byAgent.values()];
  if (groups.length === 0) {
    el.innerHTML = '<p class="empty">Nothing running right now.</p>';
    return;
  }

  el.innerHTML = groups
    .map((group) => {
      const waiting = group.tools.some((t) => t.status === "awaiting confirmation");
      const state = waiting ? "waiting" : "running";
      const stateLabel = waiting ? "confirm" : "running";
      const tools =
        group.tools.length === 0
          ? '<div class="agent-card-tool"><span class="prompt">&gt;</span><code>thinking&hellip;</code></div>'
          : group.tools
              .map(
                (t) => `<div class="agent-card-tool">
                  <span class="prompt">&gt;</span>
                  <span class="tool-type">${escapeHtml(t.name)}</span>
                  <code>${escapeHtml(t.summary)}</code>
                </div>`
              )
              .join("");
      return `<div class="agent-card active">
        <span class="cb1"></span><span class="cb2"></span>
        <div class="agent-card-head">
          <span class="agent-card-name">${escapeHtml(group.agent)}</span>
          <span class="agent-card-state ${state}">${stateLabel}</span>
        </div>
        ${tools}
      </div>`;
    })
    .join("");
}

async function loadRuns() {
  try {
    const { runs } = await fetchJson("/api/runs");
    renderRuns(runs);
    return runs;
  } catch (err) {
    document.getElementById("fleet-content").textContent = `Failed to load: ${err.message}`;
    return [];
  }
}

function startFleetPoll() {
  stopFleetPoll();
  loadRuns();
  fleetTimer = setInterval(() => {
    if (document.visibilityState === "visible") loadRuns();
  }, 1500);
}

function stopFleetPoll() {
  if (fleetTimer) clearInterval(fleetTimer);
  fleetTimer = null;
}

// --- Confirm-step: polls while a run is in flight ----------------------

let pollTimer = null;

function renderPending(entry) {
  const banner = document.getElementById("confirm-banner");
  if (!entry) {
    banner.hidden = true;
    banner.innerHTML = "";
    return;
  }
  banner.hidden = false;
  banner.innerHTML = `
    <div class="confirm-title">confirm before this runs :: ${escapeHtml(entry.toolName)}</div>
    <code>${escapeHtml(JSON.stringify(entry.input, null, 2))}</code>
    <div class="confirm-actions">
      <button class="bracket-btn solid" type="button">[ approve ]</button>
      <button class="bracket-btn danger" type="button">[ deny ]</button>
    </div>
  `;
  banner.querySelector(".solid").onclick = () => respondToPending(entry.id, true);
  banner.querySelector(".danger").onclick = () => respondToPending(entry.id, false);
}

async function respondToPending(id, approve) {
  try {
    await fetch("/api/confirm", {
      method: "POST",
      headers: JSON_POST_HEADERS,
      body: JSON.stringify({ id, approve }),
    });
  } finally {
    renderPending(null);
  }
}

function startPendingPoll() {
  stopPendingPoll();
  pollTimer = setInterval(async () => {
    try {
      const { pending } = await fetchJson("/api/pending");
      renderPending(pending[0] ?? null);
    } catch {
      // transient - next tick will retry
    }
  }, 1200);
}

function stopPendingPoll() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  renderPending(null);
}

// --- A live "working" strip, separate from any chat bubble --------------
// Kevin's own catch: a raw command like "code-reviewer: Running: git branch
// -v" should never render as chat text. It's a status line above the
// eventual reply, the way Claude's own interface shows tool use separately
// from the answer - shown while a run is in flight, removed the moment a
// real reply (or an error) actually arrives.

function workingLineFor(run) {
  if (!run || run.activeTools.length === 0) return null;
  const tool = [...run.activeTools].sort((a, b) => b.startedAt - a.startedAt)[0];
  if (tool.status === "awaiting confirmation") return { who: tool.agent, cmd: "awaiting your confirmation below" };
  if (tool.name === "Task") return { who: run.agent, cmd: `delegating to ${tool.summary}` };
  return { who: tool.agent, cmd: tool.summary || tool.name };
}

function setWorking(log, who, cmd) {
  let el = log.querySelector(".working");
  if (!el) {
    el = document.createElement("div");
    el.className = "working";
    log.appendChild(el);
  }
  el.innerHTML = `<span class="prompt">&gt;</span><span class="who">${escapeHtml(who)}</span><span class="cmd">${escapeHtml(cmd)}</span>`;
  log.scrollTop = log.scrollHeight;
}

function clearWorking(log) {
  log.querySelector(".working")?.remove();
}

function startStatusPoll(log, agent) {
  return setInterval(async () => {
    const runs = await loadRuns();
    const mine = runs.filter((r) => r.agent === agent).sort((a, b) => b.startedAt - a.startedAt)[0];
    const line = workingLineFor(mine);
    if (line) setWorking(log, line.who, line.cmd);
    else clearWorking(log);
  }, 900);
}

// --- executive-assistant's own chat, always open ------------------------

function initChat() {
  const form = document.getElementById("chat-form");
  const input = document.getElementById("chat-input");
  const button = form.querySelector("button");
  const log = document.getElementById("chat-log");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const message = input.value.trim();
    if (!message) return;

    appendChatMessage(log, "user", message);
    input.value = "";
    input.disabled = true;
    button.disabled = true;

    startPendingPoll();
    const statusTimer = startStatusPoll(log, "executive-assistant");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: JSON_POST_HEADERS,
        body: JSON.stringify({ message }),
      });
      const data = await res.json();
      clearWorking(log);
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      appendChatMessage(log, "agent", data.reply);
      loadAgentCosts(); // this run just logged a cost - refresh the panel
    } catch (err) {
      clearWorking(log);
      appendChatMessage(log, "error", `Couldn't reach executive-assistant: ${err.message}`);
    } finally {
      clearInterval(statusTimer);
      stopPendingPoll();
      input.disabled = false;
      button.disabled = false;
      input.focus();
    }
  });
}

// --- The collapsible drawer: talk to one other agent directly -----------
// A separate session from executive-assistant's, on purpose - picking a
// different agent here never touches the main chat above it.

async function initDrawer() {
  const toggle = document.getElementById("drawer-toggle");
  const body = document.getElementById("drawer-body");
  const chips = document.getElementById("drawer-chips");
  const log = document.getElementById("drawer-log");
  const form = document.getElementById("drawer-form");
  const input = document.getElementById("drawer-input");
  let selected = null;

  toggle.addEventListener("click", () => {
    toggle.classList.toggle("open");
    body.classList.toggle("open");
  });

  try {
    const { agents } = await fetchJson("/api/agents");
    for (const a of agents) {
      if (a.name === "executive-assistant") continue;
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "agent-chip";
      chip.textContent = a.name;
      chip.addEventListener("click", () => {
        selected = a.name;
        for (const c of chips.querySelectorAll(".agent-chip")) c.classList.toggle("selected", c === chip);
        input.placeholder = `> ask ${a.name} directly`;
        input.disabled = false;
      });
      chips.appendChild(chip);
    }
  } catch {
    chips.textContent = "Couldn't load the agent list.";
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!selected) return;
    const message = input.value.trim();
    if (!message) return;

    appendChatMessage(log, "user", message);
    input.value = "";
    input.disabled = true;

    startPendingPoll();
    const statusTimer = startStatusPoll(log, selected);

    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: JSON_POST_HEADERS,
        body: JSON.stringify({ agent: selected, message }),
      });
      const data = await res.json();
      clearWorking(log);
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      appendChatMessage(log, "agent", data.reply);
      loadAgentCosts();
    } catch (err) {
      clearWorking(log);
      appendChatMessage(log, "error", `Couldn't reach ${selected}: ${err.message}`);
    } finally {
      clearInterval(statusTimer);
      stopPendingPoll();
      input.disabled = false;
      input.focus();
    }
  });
}

initTabs();
initResize();
initAutoApprove();
loadDigest();
loadCosts();
loadAgentCosts();
loadActivity();
startFleetPoll();
initChat();
initDrawer();
