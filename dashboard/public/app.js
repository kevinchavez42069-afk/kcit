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

loadDigest();
loadCosts();
loadActivity();
