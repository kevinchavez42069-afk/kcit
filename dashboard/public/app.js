async function fetchJson(url) {
  const res = await fetch(url);
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
      el.innerHTML = '<p class="empty">No digest yet &mdash; executive-assistant hasn\'t produced one.</p>';
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

function appendChatMessage(role, text) {
  const log = document.getElementById("chat-log");
  const el = document.createElement("div");
  el.className = `chat-msg ${role}`;
  el.textContent = text;
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
  return el;
}

async function loadAgentSelector() {
  const select = document.getElementById("agent-select");
  try {
    const { agents } = await fetchJson("/api/agents");
    for (const a of agents) {
      if (a.name === "executive-assistant") continue; // already the default option
      const opt = document.createElement("option");
      opt.value = a.name;
      opt.textContent = `${a.name} (${a.tools.includes("Bash") ? "full tools, Bash confirmed" : "full tools"})`;
      select.appendChild(opt);
    }
  } catch {
    // agent list is a nice-to-have; executive-assistant still works without it
  }
}

// --- Confirm-step: polls while a phase-4 run is in flight -----------
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
    <div class="confirm-title">Confirm before this runs: ${escapeHtml(entry.toolName)}</div>
    <code>${escapeHtml(JSON.stringify(entry.input, null, 2))}</code>
    <div class="confirm-actions">
      <button class="approve" type="button">Approve</button>
      <button class="deny" type="button">Deny</button>
    </div>
  `;
  banner.querySelector(".approve").onclick = () => respondToPending(entry.id, true);
  banner.querySelector(".deny").onclick = () => respondToPending(entry.id, false);
}

async function respondToPending(id, approve) {
  try {
    await fetch("/api/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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

function initChat() {
  const form = document.getElementById("chat-form");
  const input = document.getElementById("chat-input");
  const select = document.getElementById("agent-select");
  const button = form.querySelector("button");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const message = input.value.trim();
    if (!message) return;

    const agent = select.value;
    const readOnly = agent === "executive-assistant";

    appendChatMessage("user", `[${agent}] ${message}`);
    input.value = "";
    input.disabled = true;
    button.disabled = true;
    const pendingMsg = appendChatMessage("agent", "Thinking…");

    if (!readOnly) startPendingPoll();

    try {
      const res = await fetch(readOnly ? "/api/chat" : "/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(readOnly ? { message } : { agent, message }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      pendingMsg.textContent = data.reply;
      loadAgentCosts(); // this run just logged a cost - refresh the panel
    } catch (err) {
      pendingMsg.className = "chat-msg error";
      pendingMsg.textContent = `Couldn't reach ${agent}: ${err.message}`;
    } finally {
      stopPendingPoll();
      input.disabled = false;
      button.disabled = false;
      input.focus();
    }
  });
}

loadDigest();
loadCosts();
loadAgentCosts();
loadActivity();
loadAgentSelector();
initChat();
