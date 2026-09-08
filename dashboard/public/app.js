// =====================================================================
//  KC IT Agent Ops - frontend.
//
//  Everything on this page comes from a real endpoint. Where there is no
//  data source there is an empty state, never a placeholder number: this
//  screen is how Kevin decides what to do next, and an invented figure on
//  it is worse than a blank.
// =====================================================================

// Every state-changing request carries this header. The server refuses any
// POST without it (see requireSameOrigin in server.mjs). A cross-origin page
// cannot set a custom header without a CORS preflight, and this server
// answers no preflights, so a forged form post from another site fails
// before it reaches a route. That was the audit's first critical finding.
const JSON_POST_HEADERS = {
  "Content-Type": "application/json",
  "X-Requested-By": "kcit-dashboard",
};

const $ = (id) => document.getElementById(id);

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function money(n) {
  return `$${Number(n || 0).toFixed(n >= 100 ? 2 : 4)}`;
}

// --- Agents -------------------------------------------------------------
// Icon and accent per agent. The keys are the real filenames in
// .claude/agents/, so adding an agent there without adding it here falls
// back to the generic chip rather than rendering nothing.

const AGENT_META = {
  "executive-assistant": { ic: "i-ea", ac: "--ag-ea" },
  developer: { ic: "i-dev", ac: "--ag-dev" },
  "code-reviewer": { ic: "i-rev", ac: "--ag-rev" },
  "prospect-scout": { ic: "i-scout", ac: "--ag-scout" },
  "client-onboarder": { ic: "i-onb", ac: "--ag-onb" },
  "follow-up": { ic: "i-fu", ac: "--ag-fu" },
};
const FALLBACK_META = { ic: "i-gen", ac: "--ag-ea" };
const meta = (name) => AGENT_META[name] || FALLBACK_META;

function icon(name) {
  const m = meta(name);
  return `<svg class="ic" style="--ac:var(${m.ac})" viewBox="0 0 16 16" aria-hidden="true"><use href="#${m.ic}"/></svg>`;
}

let AGENTS = []; // [{name, description, tools}] from /api/agents
let current = "executive-assistant";

// --- Screens ------------------------------------------------------------

let screen = "home";

function show(name) {
  screen = name;
  for (const b of document.querySelectorAll("#nav button")) {
    if (b.dataset.s === name) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  }
  for (const s of document.querySelectorAll(".screen")) s.classList.toggle("on", s.dataset.s === name);
}

$("nav").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-s]");
  if (b) show(b.dataset.s);
});
document.addEventListener("click", (e) => {
  const g = e.target.closest("[data-goto]");
  if (g) show(g.dataset.goto);
});

// --- Theme --------------------------------------------------------------

const root = document.documentElement;
const SUN = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.6v2.2M12 19.2v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2.6 12h2.2M19.2 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6"/></svg>';
const MOON = '<svg viewBox="0 0 24 24"><path d="M20 14.2A8.2 8.2 0 0 1 9.8 4a8.2 8.2 0 1 0 10.2 10.2z"/></svg>';

function theme() {
  const t = root.getAttribute("data-theme");
  if (t === "dark" || t === "light") return t;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
function paintTheme() {
  const dark = theme() === "dark";
  $("thm").innerHTML = dark ? SUN : MOON;
  $("thm").title = dark ? "Switch to light" : "Switch to dark";
  $("thm").setAttribute("aria-label", $("thm").title);
}
try {
  const stored = localStorage.getItem("theme");
  if (stored === "dark" || stored === "light") root.setAttribute("data-theme", stored);
} catch {}
$("thm").addEventListener("click", () => {
  const next = theme() === "dark" ? "light" : "dark";
  root.setAttribute("data-theme", next);
  try { localStorage.setItem("theme", next); } catch {}
  paintTheme();
});
window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener("change", paintTheme);
paintTheme();

// --- Collapsible sections ----------------------------------------------

for (const sec of document.querySelectorAll(".sec")) {
  const key = `sec:${sec.dataset.k}`;
  const head = sec.querySelector(":scope > .hd3, :scope > .ch");
  if (!head) continue;
  try { if (localStorage.getItem(key) === "0") sec.dataset.open = "false"; } catch {}
  head.setAttribute("role", "button");
  head.tabIndex = 0;
  const sync = () => head.setAttribute("aria-expanded", sec.dataset.open !== "false");
  const toggle = () => {
    const open = sec.dataset.open !== "false";
    sec.dataset.open = open ? "false" : "true";
    try { localStorage.setItem(key, open ? "0" : "1"); } catch {}
    sync();
  };
  head.addEventListener("click", (e) => {
    if (e.target.closest("[data-goto], button.more")) return;
    toggle();
  });
  head.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); }
  });
  sync();
}

// --- Resizable fleet rail ------------------------------------------------

const consoleEl = document.querySelector(".console");
const RAIL_MIN = 170, RAIL_MAX = 520;
try {
  const w = parseInt(localStorage.getItem("railW"), 10);
  if (w >= RAIL_MIN && w <= RAIL_MAX) consoleEl.style.setProperty("--railW", `${w}px`);
} catch {}

$("grip").addEventListener("pointerdown", function (e) {
  e.preventDefault();
  this.setPointerCapture(e.pointerId);
  document.body.classList.add("dragging");
  const move = (ev) => {
    let w = Math.round(consoleEl.getBoundingClientRect().right - ev.clientX);
    w = Math.max(RAIL_MIN, Math.min(RAIL_MAX, w));
    consoleEl.style.setProperty("--railW", `${w}px`);
  };
  const up = () => {
    document.body.classList.remove("dragging");
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    try { localStorage.setItem("railW", parseInt(consoleEl.style.getPropertyValue("--railW"), 10)); } catch {}
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
});

let railMin = false;
try { railMin = localStorage.getItem("railMin") === "1"; } catch {}
document.body.classList.toggle("rail-min", railMin);
$("rail-toggle").addEventListener("click", function () {
  railMin = !railMin;
  document.body.classList.toggle("rail-min", railMin);
  this.title = railMin ? "Expand" : "Collapse";
  this.setAttribute("aria-label", railMin ? "Expand fleet" : "Collapse fleet");
  try { localStorage.setItem("railMin", railMin ? "1" : "0"); } catch {}
});

// --- Auto-approve --------------------------------------------------------
// Session-only, never persisted. See permissions.mjs for why this is a
// visible toggle and not a smarter allowlist.

async function initAutoApprove() {
  const btn = $("auto-toggle");
  const warn = $("auto-warning");
  const paint = (on) => {
    btn.classList.toggle("on", on);
    btn.setAttribute("aria-pressed", String(on));
    warn.hidden = !on;
  };
  try {
    const { autoApprove } = await fetchJson("/api/auto-approve");
    paint(autoApprove);
  } catch {
    // starts off, which matches the safe default if this fails
  }
  btn.addEventListener("click", async () => {
    const wantOn = !btn.classList.contains("on");
    try {
      const { autoApprove } = await fetchJson("/api/auto-approve", {
        method: "POST",
        headers: JSON_POST_HEADERS,
        body: JSON.stringify({ on: wantOn }),
      });
      paint(autoApprove);
    } catch {
      // leave it as it was - a failed toggle must not claim success
    }
  });
}

// --- Fleet ---------------------------------------------------------------
// One row per agent, always all of them: lit when running, dimmed when
// idle. That is the whole point of the rail - seeing at a glance who is
// doing what - so it lists the roster, not just whatever happens to be
// active. A tool's own `agent` field (resolved server-side in runs.mjs)
// says who is really running it, whether Kevin addressed that agent
// directly or executive-assistant delegated to it.

let latestRuns = [];

function agentStates(runs) {
  const state = new Map();
  for (const run of runs) {
    if (!state.has(run.agent)) state.set(run.agent, { tools: [] });
    for (const tool of run.activeTools) {
      const key = tool.agent || run.agent;
      if (!state.has(key)) state.set(key, { tools: [] });
      state.get(key).tools.push(tool);
    }
  }
  return state;
}

function fleetRowHtml(name, st, selectable) {
  const waiting = st && st.tools.some((t) => t.status === "awaiting confirmation");
  const live = Boolean(st);
  const cls = !live ? "idle" : waiting ? "live held" : "live";
  const newest = st && st.tools.length
    ? [...st.tools].sort((a, b) => b.startedAt - a.startedAt)[0]
    : null;
  let line = "";
  if (waiting) line = "Waiting on your approval";
  else if (newest) line = `${newest.name}  ${newest.summary || ""}`.trim();
  else if (live) line = "Thinking";
  const sel = selectable && name === current ? " sel" : "";
  return `<button class="ag ${cls}${sel}" data-agent="${escapeHtml(name)}" type="button" title="${escapeHtml(name)}">
    <span class="ico">${icon(name)}<span class="led"></span></span>
    <span class="bd">
      <span class="nm">${escapeHtml(name)}</span>
      ${line ? `<span class="ln">${escapeHtml(line)}</span>` : ""}
      ${live ? "" : '<span class="mt"><span>idle</span></span>'}
    </span>
  </button>`;
}

function renderFleet(runs) {
  const state = agentStates(runs);
  const names = AGENTS.length ? AGENTS.map((a) => a.name) : [...state.keys()];
  const liveCount = names.filter((n) => state.has(n)).length;

  $("fleet-rows").innerHTML = names.map((n) => fleetRowHtml(n, state.get(n), true)).join("");
  $("home-fleet").innerHTML = names.map((n) => fleetRowHtml(n, state.get(n), false)).join("");
  $("fleet-count").textContent = `${liveCount} live`;
  $("home-fleet-cnt").textContent = `${liveCount} live`;
  $("fleet-sum").textContent = `${liveCount} live, ${names.length - liveCount} idle`;

  const ea = state.get("executive-assistant");
  $("home-chat-state").textContent = ea ? "working" : "";
}

// Clicking an agent anywhere switches the Console conversation to it. A
// full window each, not a split - the drawer this replaces put two
// conversations on screen at once and neither had room.
document.addEventListener("click", (e) => {
  const row = e.target.closest(".ag[data-agent]");
  if (!row) return;
  current = row.dataset.agent;
  paintChatHeader();
  renderFleet(latestRuns);
  show("console");
  $("chat-input").focus();
});

async function loadRuns() {
  try {
    const { runs } = await fetchJson("/api/runs");
    latestRuns = runs;
    renderFleet(runs);
    return runs;
  } catch {
    return latestRuns;
  }
}

// --- Pending confirmations ----------------------------------------------
// Polled continuously and visibility-gated, not only while a browser
// request is in flight. A scheduler-fired run (the 7am standup) reaches
// the confirm gate with no chat request open at all, and the old
// behaviour showed Kevin nothing to approve in that case.

let pendingCache = [];

// listPending() deliberately returns only {id, toolName, input, createdAt} -
// it has toolUseID internally but does not expose it, so there is no exact
// join key. The live runs do know who is blocked: every tool sitting at the
// gate is flagged "awaiting confirmation" and carries its own resolved agent.
// Pair them by order, which is exact in the normal case of one at a time,
// and fall back to an honest generic label rather than guessing a name.
function waitingAgents() {
  const out = [];
  for (const run of latestRuns) {
    for (const tool of run.activeTools) {
      if (tool.status === "awaiting confirmation") out.push(tool.agent || run.agent);
    }
  }
  return out;
}

function whoAsked(index) {
  const waiting = waitingAgents();
  if (waiting.length === pendingCache.length && waiting[index]) return waiting[index];
  if (waiting.length === 1) return waiting[0];
  return "An agent";
}

// An unanswered confirmation now expires and resolves as a denial that says
// so (permissions.mjs). That is a different thing from Kevin refusing, and
// the agent is told which it was, so the countdown is worth showing rather
// than letting one lapse silently while he is looking at the screen.
function expiryLabel(entry) {
  if (!entry.expiresAt) return "";
  const left = Math.round((entry.expiresAt - Date.now()) / 1000);
  if (left <= 0) return "expiring";
  if (left < 60) return `${left}s left`;
  return `${Math.round(left / 60)}m left`;
}

function confirmHtml(entry, index) {
  const cmd = entry.input && typeof entry.input.command === "string"
    ? entry.input.command
    : JSON.stringify(entry.input, null, 2);
  return `<div class="t">${escapeHtml(whoAsked(index))} is asking to run a command<span class="k">${escapeHtml(entry.toolName)}${expiryLabel(entry) ? " &middot; " + expiryLabel(entry) : ""}</span></div>
    <pre>${escapeHtml(cmd)}</pre>
    <div class="a">
      <button class="y" type="button" data-confirm="${escapeHtml(entry.id)}" data-approve="1">Approve</button>
      <button class="n" type="button" data-confirm="${escapeHtml(entry.id)}" data-approve="0">Deny</button>
    </div>`;
}

function renderPending(pending) {
  pendingCache = pending;

  const banner = $("confirm-banner");
  if (pending.length === 0) {
    banner.hidden = true;
    banner.innerHTML = "";
  } else {
    banner.hidden = false;
    banner.innerHTML = confirmHtml(pending[0], 0);
  }

  const needs = $("needs");
  const cnt = $("needs-cnt");
  cnt.hidden = pending.length === 0;
  cnt.textContent = String(pending.length);
  $("needs-sum").textContent = pending.length
    ? `${pending.length} waiting on you`
    : "nothing waiting";

  if (pending.length === 0) {
    needs.innerHTML = '<p class="empty">Nothing is waiting on you.</p>';
    return;
  }
  needs.innerHTML = pending
    .map((entry, index) => {
      const cmd = entry.input && typeof entry.input.command === "string"
        ? entry.input.command
        : JSON.stringify(entry.input, null, 2);
      return `<div class="need">
        <div class="bd">
          <div class="ttl">${escapeHtml(whoAsked(index))} wants to run ${escapeHtml(entry.toolName)}</div>
          <pre>${escapeHtml(cmd)}</pre>
          <div class="act">
            <button class="pri" type="button" data-confirm="${escapeHtml(entry.id)}" data-approve="1">Approve</button>
            <button type="button" data-confirm="${escapeHtml(entry.id)}" data-approve="0">Deny</button>
            <button type="button" data-goto="console">Open in Console</button>
            <span class="who2">${escapeHtml(expiryLabel(entry))}</span>
          </div>
        </div>
      </div>`;
    })
    .join("");
}

document.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-confirm]");
  if (!btn) return;
  const id = btn.dataset.confirm;
  const approve = btn.dataset.approve === "1";
  for (const b of document.querySelectorAll(`[data-confirm="${CSS.escape(id)}"]`)) b.disabled = true;
  try {
    await fetch("/api/confirm", {
      method: "POST",
      headers: JSON_POST_HEADERS,
      body: JSON.stringify({ id, approve }),
    });
  } finally {
    loadPending();
  }
});

async function loadPending() {
  try {
    const { pending } = await fetchJson("/api/pending");
    renderPending(pending);
  } catch {
    // transient - the next tick retries
  }
}

// --- The live poll -------------------------------------------------------
// One timer for both, gated on tab visibility so an unwatched tab is quiet.

function startPolling() {
  loadRuns();
  loadPending();
  setInterval(() => {
    if (document.visibilityState !== "visible") return;
    loadRuns();
    loadPending();
  }, 1500);
}

// --- Chat ----------------------------------------------------------------

function paintChatHeader() {
  const a = AGENTS.find((x) => x.name === current);
  $("chat-av").innerHTML = icon(current);
  $("chat-who").textContent = current;
  // The description is a long list of trigger phrases for the SDK. Only the
  // first sentence of it is a description a person wants in a header.
  $("chat-role").textContent = (a?.description || "").split(/\.\s/)[0].replace(/\.$/, "");
  $("chat-to").innerHTML = `${icon(current)}${escapeHtml(current)}`;
  $("chat-input").placeholder = `Ask ${current}`;
  $("home-chat-av").innerHTML = icon("executive-assistant");
}

function appendMessage(log, role, text, who) {
  log.querySelector(".empty")?.remove();
  const el = document.createElement("div");
  el.className = `msg ${role}`;
  const avatar = role === "me" ? "KC" : icon(who || current);
  el.innerHTML = `<span class="av">${avatar}</span><div class="bub"></div>`;
  el.querySelector(".bub").textContent = text;
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
  return el;
}

// A status line above the eventual reply, never chat text. Kevin's own
// catch: "code-reviewer: Running: git branch -v" does not belong in a
// bubble, it belongs in small type the way a tool call does in Claude's
// own interface.
function setWorking(log, tool, arg) {
  let el = log.querySelector(".work");
  if (!el) {
    el = document.createElement("div");
    el.className = "work";
    el.innerHTML = '<span class="tk"></span><span class="tool"></span><span class="arg"></span>';
    log.appendChild(el);
  }
  el.querySelector(".tool").textContent = tool;
  el.querySelector(".arg").textContent = arg;
  log.scrollTop = log.scrollHeight;
}
function clearWorking(log) {
  log.querySelector(".work")?.remove();
}

function workingFor(agent) {
  const run = latestRuns.filter((r) => r.agent === agent).sort((a, b) => b.startedAt - a.startedAt)[0];
  if (!run) return null;
  if (run.activeTools.length === 0) return { tool: "Thinking", arg: "" };
  const t = [...run.activeTools].sort((a, b) => b.startedAt - a.startedAt)[0];
  if (t.status === "awaiting confirmation") return { tool: "Waiting", arg: "on your confirmation below" };
  if (t.name === "Task") return { tool: "Task", arg: t.summary || "" };
  return { tool: t.name, arg: t.summary || "" };
}

function wireChat(formId, inputId, logId, agentFor) {
  const form = $(formId);
  const input = $(inputId);
  const log = $(logId);
  const button = form.querySelector("button");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const message = input.value.trim();
    if (!message) return;
    const agent = agentFor();

    appendMessage(log, "me", message);
    input.value = "";
    input.disabled = true;
    button.disabled = true;

    const ticker = setInterval(() => {
      const w = workingFor(agent);
      if (w) setWorking(log, w.tool, w.arg);
    }, 900);

    const isEa = agent === "executive-assistant";
    try {
      const res = await fetch(isEa ? "/api/chat" : "/api/run", {
        method: "POST",
        headers: JSON_POST_HEADERS,
        body: JSON.stringify(isEa ? { message } : { agent, message }),
      });
      const data = await res.json();
      clearWorking(log);
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      appendMessage(log, "agent", data.reply, agent);
      loadCosts();
      loadTodayKpi();
    } catch (err) {
      clearWorking(log);
      appendMessage(log, "error", `Couldn't reach ${agent}: ${err.message}`, agent);
    } finally {
      clearInterval(ticker);
      input.disabled = false;
      button.disabled = false;
      input.focus();
    }
  });
}

// --- Costs ---------------------------------------------------------------

function costTable(rows, nameKey, countKey, countLabel, withIcon) {
  if (rows.length === 0) return null;
  const total = rows.reduce((s, r) => s + r.cost_usd, 0);
  const body = rows
    .map((r) => {
      const label = escapeHtml(r[nameKey]);
      const cell = withIcon ? `<span>${icon(r[nameKey])}${label}</span>` : label;
      return `<tr><td class="nm">${cell}</td><td class="r">${r[countKey]}</td><td class="r">${money(r.cost_usd)}</td></tr>`;
    })
    .join("");
  return `<table>
    <thead><tr><th>${withIcon ? "Agent" : "Client"}</th><th class="r">${countLabel}</th><th class="r">Cost</th></tr></thead>
    <tbody>${body}</tbody>
    <tfoot><tr><td>Total</td><td></td><td class="r">${money(total)}</td></tr></tfoot>
  </table>`;
}

// Windows. summaryByAgent/summaryByClient always took a sinceMs and no
// caller ever passed one, so every figure here used to be an all-time total
// with no date on it. That is how a fleet total got read as one day s spend
// and reached Kevin wrong. Every number now carries the window it covers.
const RANGES = {
  today: { label: "today", since: () => new Date().setHours(0, 0, 0, 0) },
  "7d": { label: "last 7 days", since: () => Date.now() - 7 * 864e5 },
  "30d": { label: "last 30 days", since: () => Date.now() - 30 * 864e5 },
  all: { label: "all time", since: () => 0 },
};
let range = "today";
try { if (RANGES[localStorage.getItem("costRange")]) range = localStorage.getItem("costRange"); } catch {}

$("ranges").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-range]");
  if (!b) return;
  range = b.dataset.range;
  try { localStorage.setItem("costRange", range); } catch {}
  paintRanges();
  loadCosts();
});
function paintRanges() {
  for (const b of document.querySelectorAll("#ranges button")) {
    b.setAttribute("aria-pressed", String(b.dataset.range === range));
  }
}

async function loadCosts() {
  const win = RANGES[range] || RANGES.today;
  const since = win.since();
  const qs = since > 0 ? `?since=${since}` : "";
  let agentTotal = 0, clientTotal = 0, runCount = 0, reqCount = 0;

  try {
    const { agents } = await fetchJson(`/api/agent-costs${qs}`);
    agentTotal = agents.reduce((s, a) => s + a.cost_usd, 0);
    runCount = agents.reduce((s, a) => s + a.runs, 0);
    $("agent-costs").innerHTML =
      costTable(agents, "agent_name", "runs", "Runs", true) ||
      `<p class="empty">No agent runs ${win.label}.</p>`;
  } catch (err) {
    $("agent-costs").innerHTML = `<p class="empty">Failed to load: ${escapeHtml(err.message)}</p>`;
  }

  try {
    const { clients } = await fetchJson(`/api/costs${qs}`);
    clientTotal = clients.reduce((s, c) => s + c.cost_usd, 0);
    reqCount = clients.reduce((s, c) => s + c.requests, 0);
    $("client-costs").innerHTML =
      costTable(clients, "client_id", "requests", "Requests", false) ||
      `<p class="empty">No chatbot traffic ${win.label}. Run dashboard/cost-report.mjs to pull the latest.</p>`;
  } catch (err) {
    $("client-costs").innerHTML = `<p class="empty">Failed to load: ${escapeHtml(err.message)}</p>`;
  }

  $("cost-stats").innerHTML = `
    <div><div class="lab">Agent fleet, ${win.label}</div><div class="big">${money(agentTotal)}</div><div class="sub">${runCount} runs</div></div>
    <div><div class="lab">Client chatbots, ${win.label}</div><div class="big">${money(clientTotal)}</div><div class="sub">${reqCount} requests</div></div>
    <div><div class="lab">Combined, ${win.label}</div><div class="big">${money(agentTotal + clientTotal)}</div><div class="sub">both fleets together</div></div>`;

  // The footer used to say "totals are all time" whatever window was picked.
  // A stale qualifier is worse than none: it is the same mistake as no date
  // at all, only harder to spot because it looks like it was checked.
  $("cost-foot").innerHTML =
    `Covering <strong>${escapeHtml(win.label)}</strong>, in your timezone. ` +
    `Chatbot figures come from the last <code>dashboard/cost-report.mjs</code> run.`;
}

// Home always reports today, whatever window the Costs tab is set to. The
// two are answering different questions and the labels say so on both.
async function loadTodayKpi() {
  const since = RANGES.today.since();
  let agentTotal = 0, clientTotal = 0, runCount = 0;
  try {
    const { agents } = await fetchJson(`/api/agent-costs?since=${since}`);
    agentTotal = agents.reduce((s, a) => s + a.cost_usd, 0);
    runCount = agents.reduce((s, a) => s + a.runs, 0);
  } catch {}
  try {
    const { clients } = await fetchJson(`/api/costs?since=${since}`);
    clientTotal = clients.reduce((s, c) => s + c.cost_usd, 0);
  } catch {}
  renderKpi(agentTotal, clientTotal, runCount);
}

function renderKpi(agentTotal, clientTotal, runCount) {
  const live = latestRuns.length;
  const waiting = pendingCache.length;
  $("kpi").innerHTML = `
    <div><div class="lab">Agent fleet, today</div><div class="big">${money(agentTotal)}</div><div class="sub">${runCount} runs today</div></div>
    <div><div class="lab">Client chatbots, today</div><div class="big">${money(clientTotal)}</div><div class="sub">recoverable</div></div>
    <div><div class="lab">Running now</div><div class="big">${live}</div><div class="sub">${live ? "agents working" : "fleet idle"}</div></div>
    <div><div class="lab">Awaiting approval</div><div class="big">${waiting}</div><div class="sub ${waiting ? "up" : ""}">${waiting ? "blocking an agent" : "nothing blocked"}</div></div>`;
  $("snap-sum").textContent = `${money(agentTotal + clientTotal)} today, ${waiting} awaiting you`;
}

// --- Board ---------------------------------------------------------------
// Backed by vault/50-Workspace/Board.md. Deliberately not derived from
// anything clever: what shipped, what is moving and what is next are
// judgement calls, so they live in a file Kevin and executive-assistant
// both edit rather than being inferred from commits.

async function loadBoard() {
  const el = $("board");
  try {
    const { columns, exists } = await fetchJson("/api/board");
    if (!exists) {
      el.innerHTML = '<p class="empty">No board yet. Create vault/50-Workspace/Board.md with "## Shipped", "## In flight" and "## Up next" headings, or ask executive-assistant to start one.</p>';
      $("board-sum").textContent = "empty";
      return;
    }
    const dots = { Shipped: "ok", "In flight": "go", "Up next": "" };
    const total = columns.reduce((s, c) => s + c.items.length, 0);
    if (total === 0) {
      el.innerHTML = '<p class="empty">The board is empty.</p>';
      $("board-sum").textContent = "empty";
      return;
    }
    el.innerHTML = `<div class="board">${columns
      .map(
        (col) => `<div class="col">
          <div class="ch3"><span class="dt ${dots[col.title] ?? ""}"></span>${escapeHtml(col.title)}<span class="n3">${col.items.length}</span></div>
          ${col.items
            .map(
              (it) => `<div class="it">
                <div class="t3">${escapeHtml(it.text)}${it.you ? '<span class="flag">you</span>' : ""}</div>
                ${it.note ? `<div class="m3">${escapeHtml(it.note)}</div>` : ""}
              </div>`
            )
            .join("")}
        </div>`
      )
      .join("")}</div>`;
    $("board-sum").textContent = columns.map((c) => `${c.items.length} ${c.title.toLowerCase()}`).join(", ");
  } catch (err) {
    el.innerHTML = `<p class="empty">Failed to load: ${escapeHtml(err.message)}</p>`;
  }
}

// --- Digest --------------------------------------------------------------
// Split on the date headings the standup writes, newest first, with just
// enough markdown rendered to be readable. Frontmatter is dropped: it is
// metadata for Obsidian, not something to read here.

function inline(md) {
  return escapeHtml(md)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\[\[([^\]]+)\]\]/g, "$1");
}

function renderMarkdown(md) {
  const out = [];
  let list = [];
  let para = [];
  const flushList = () => { if (list.length) { out.push(`<ul>${list.join("")}</ul>`); list = []; } };
  // A wrapped sentence is one paragraph, not one paragraph per source line.
  const flushPara = () => { if (para.length) { out.push(`<p>${inline(para.join(" "))}</p>`); para = []; } };

  for (const raw of md.split("\n")) {
    const line = raw.trim();
    if (!line) { flushPara(); flushList(); continue; }
    const heading = line.match(/^(#{2,6})\s+(.*)$/);
    if (heading) { flushPara(); flushList(); out.push(`<h5>${inline(heading[2])}</h5>`); continue; }
    if (/^[-*]\s+/.test(line)) {
      flushPara();
      list.push(`<li>${inline(line.replace(/^[-*]\s+/, ""))}</li>`);
      continue;
    }
    flushList();
    para.push(line);
  }
  flushPara(); flushList();
  return out.join("");
}

async function loadDigest() {
  const el = $("digest");
  try {
    const { digest, exists } = await fetchJson("/api/digest");
    if (!exists || !digest.trim()) {
      el.innerHTML = '<p class="empty">No digest yet. executive-assistant writes one on the morning standup.</p>';
      return;
    }
    const body = digest.replace(/^---\n[\s\S]*?\n---\n/, "");

    // Each standup is a "## <date>" section. Everything before the first one
    // is the file's own note about what it is for, which is documentation
    // for whoever opens the vault, not something to read here. Newest first:
    // the file appends chronologically, and the useful end is the latest.
    const sections = [];
    const re = /^##\s+(.+)$/gm;
    let match, last = null;
    while ((match = re.exec(body)) !== null) {
      if (last) last.end = match.index;
      last = { title: match[1].trim(), start: re.lastIndex };
      sections.push(last);
    }
    if (last) last.end = body.length;

    if (sections.length === 0) {
      el.innerHTML = `<div class="en">${renderMarkdown(body)}</div>`;
      return;
    }
    el.innerHTML = sections
      .reverse()
      .map(
        (sec) => `<div class="en"><div class="eh"><time>${escapeHtml(sec.title)}</time></div>${renderMarkdown(
          body.slice(sec.start, sec.end)
        )}</div>`
      )
      .join("");
  } catch (err) {
    el.innerHTML = `<p class="empty">Failed to load: ${escapeHtml(err.message)}</p>`;
  }
}

// --- Activity ------------------------------------------------------------

function activityRow(e) {
  return `<div class="ev">
    <time>${escapeHtml(e.date)}</time>
    ${icon(e.agent)}
    <div class="tx"><b>${escapeHtml(e.agent)}</b> ${escapeHtml(e.summary)}</div>
  </div>`;
}

async function loadActivity() {
  try {
    const { entries } = await fetchJson("/api/activity");
    if (entries.length === 0) {
      $("activity").innerHTML = '<p class="empty">No activity logged yet.</p>';
      $("home-feed").innerHTML = '<p class="empty">No activity logged yet.</p>';
      $("recent-sum").textContent = "nothing logged";
      return;
    }
    $("activity").innerHTML = entries.map(activityRow).join("");
    $("home-feed").innerHTML = entries.slice(0, 6).map(activityRow).join("");
    $("recent-sum").textContent = `${entries.length} entries`;
  } catch (err) {
    $("activity").innerHTML = `<p class="empty">Failed to load: ${escapeHtml(err.message)}</p>`;
    $("home-feed").innerHTML = "";
  }
}

// --- Boot ----------------------------------------------------------------

async function init() {
  try {
    const { agents } = await fetchJson("/api/agents");
    AGENTS = agents;
  } catch {
    AGENTS = [];
  }
  paintChatHeader();
  renderPending([]);
  wireChat("chat-form", "chat-input", "chat-log", () => current);
  wireChat("home-chat-form", "home-chat-input", "home-chat-log", () => "executive-assistant");
  initAutoApprove();
  paintRanges();
  loadBoard();
  loadCosts();
  loadTodayKpi();
  loadDigest();
  loadActivity();
  startPolling();
}

init();
