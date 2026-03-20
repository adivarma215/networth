"use strict";

// ── Constants ─────────────────────────────────────────────
const CLASS_COLORS = {
  "Cash & bank":          "#378ADD",
  "Stocks & ETFs":        "#34c78a",
  "Retirement Market accounts": "#420909",
  "Real estate":          "#8b7cf8",
  "Gold & commodities":   "#fbbf24",
  "Crypto":               "#f97316",
  "Depreciating assets":  "#94a3b8",
  "Other":                "#ec4899",
};

// ── State ─────────────────────────────────────────────────
let state = { assets: [], liabilities: [], snapshots: [], summary: {} };
let pieChart, trendChart, classTrendChart;

// ── Init ──────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  document.getElementById("today-date").textContent = new Date().toLocaleDateString("en-US", { weekday:"long", year:"numeric", month:"long", day:"numeric" });
  const now = new Date();
  document.getElementById("snap-month").value = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;

  document.querySelectorAll(".nav-item").forEach(el => {
    el.addEventListener("click", () => setView(el.dataset.view));
  });

  // Close modals on overlay click
  document.querySelectorAll(".modal-overlay").forEach(el => {
    el.addEventListener("click", e => { if (e.target === el) el.classList.remove("open"); });
  });

  await loadAll();
  renderOverview();
});

// ── Data loading ──────────────────────────────────────────
async function loadAll() {
  const [assets, liabilities, snapshots, summary] = await Promise.all([
    api("/api/assets"),
    api("/api/liabilities"),
    api("/api/snapshots"),
    api("/api/summary"),
  ]);
  state.assets = assets;
  state.liabilities = liabilities;
  state.snapshots = snapshots;
  state.summary = summary;
  updateSidebarNW();
}

function updateSidebarNW() {
  document.getElementById("sidebar-nw").textContent = fmt(state.summary.net_worth || 0);
}

// ── View routing ──────────────────────────────────────────
function setView(name) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
  document.getElementById(`view-${name}`).classList.add("active");
  document.querySelector(`[data-view="${name}"]`).classList.add("active");

  if (name === "overview")    renderOverview();
  if (name === "trend")       renderTrend();
  if (name === "assets")      renderAssetsTable();
  if (name === "liabilities") renderLiabTable();
  if (name === "snapshots")   renderSnapTable();
}

// ── Overview ──────────────────────────────────────────────
function renderOverview() {
  const s = state.summary;

  // Metrics
  const prev = state.snapshots.length >= 2 ? state.snapshots[state.snapshots.length - 2] : null;
  const prevNW = prev ? prev.net_worth : s.net_worth;
  const change = s.net_worth - prevNW;
  const depr = state.assets.filter(a => a.class === "Depreciating assets").reduce((t,a) => t+a.value, 0);

  document.getElementById("metrics-row").innerHTML = `
    <div class="metric">
      <div class="lbl">Net worth</div>
      <div class="val">${fmtShort(s.net_worth)}</div>
      <div class="sub">${change >= 0 ? "+" : ""}${fmtShort(change)} vs last snapshot</div>
    </div>
    <div class="metric">
      <div class="lbl">Total assets</div>
      <div class="val pos">${fmtShort(s.total_assets)}</div>
      <div class="sub">${s.asset_count} holdings</div>
    </div>
    <div class="metric">
      <div class="lbl">Liabilities</div>
      <div class="val neg">${fmtShort(s.total_liabilities)}</div>
      <div class="sub">${s.liability_count} items</div>
    </div>
    <div class="metric">
      <div class="lbl">Depreciating</div>
      <div class="val">${fmtShort(depr)}</div>
      <div class="sub">${s.total_assets ? ((depr/s.total_assets)*100).toFixed(1) : 0}% of assets</div>
    </div>
  `;

  // Pie chart
  const byClass = s.by_class || {};
  const labels = Object.keys(byClass).filter(k => byClass[k] > 0);
  const vals   = labels.map(k => byClass[k]);
  const colors = labels.map(k => CLASS_COLORS[k] || "#888");

  document.getElementById("pie-legend").innerHTML = labels.map((l, i) =>
    `<span class="legend-item"><span class="legend-sq" style="background:${colors[i]}"></span>${l}</span>`
  ).join("");

  if (pieChart) pieChart.destroy();
  pieChart = new Chart(document.getElementById("pieChart"), {
    type: "doughnut",
    data: { labels, datasets: [{ data: vals, backgroundColor: colors, borderWidth: 0, hoverOffset: 6 }] },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: "62%",
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` ${fmt(ctx.parsed)}` } }
      }
    }
  });

  // Class breakdown
  const total = s.total_assets || 1;
  document.getElementById("class-breakdown").innerHTML = labels.map((k, i) =>
    `<div class="class-row">
      <span class="class-dot" style="background:${colors[i]}"></span>
      <span class="class-name">${k}</span>
      <span class="class-val">${fmt(byClass[k])}</span>
      <span class="class-pct">${((byClass[k]/total)*100).toFixed(1)}%</span>
    </div>`
  ).join("");

  // Holdings table
  const tbody = document.querySelector("#holdings-table tbody");
  tbody.innerHTML = state.assets.map(a =>
    `<tr>
      <td>${esc(a.name)}</td>
      <td style="color:var(--text-secondary)">${esc(a.institution)}</td>
      <td><span class="class-pill">${esc(a.class)}</span></td>
      <td class="num">${fmt(a.value)}</td>
    </tr>`
  ).join("");
}

// ── Trend ─────────────────────────────────────────────────
function renderTrend() {
  const snaps = [...state.snapshots].sort((a,b) => a.month.localeCompare(b.month));
  if (!snaps.length) {
    document.getElementById("trendChart").closest(".card").querySelector(".chart-wrap").innerHTML =
      '<p class="muted-text" style="text-align:center;padding:40px 0">No snapshots yet. Save your first snapshot to see the trend.</p>';
    return;
  }

  const labels = snaps.map(s => {
    const [y,m] = s.month.split("-");
    return ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][+m-1] + " '" + y.slice(2);
  });

  // Net worth trend
  if (trendChart) trendChart.destroy();
  trendChart = new Chart(document.getElementById("trendChart"), {
    type: "line",
    data: {
      labels,
      datasets: [
        { label:"Net worth",   data: snaps.map(s=>s.net_worth),           borderColor:"#8b7cf8", backgroundColor:"rgba(139,124,248,0.1)", fill:true,  tension:0.35, pointRadius:4, pointHoverRadius:6, borderWidth:2 },
        { label:"Assets",      data: snaps.map(s=>s.total_assets),        borderColor:"#34c78a", fill:false, tension:0.35, pointRadius:3, borderWidth:1.5, borderDash: [] },
        { label:"Liabilities", data: snaps.map(s=>s.total_liabilities),   borderColor:"#f87171", fill:false, tension:0.35, pointRadius:3, borderWidth:1.5, borderDash: [4,3] },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${fmt(ctx.parsed.y)}` } } },
      scales: {
        x: { ticks: { color:"#525b72", font:{size:11}, maxRotation:45, autoSkip:false }, grid: { color:"rgba(255,255,255,0.04)" } },
        y: { ticks: { color:"#525b72", font:{size:11}, callback: v => fmtShort(v) }, grid: { color:"rgba(255,255,255,0.04)" } }
      }
    }
  });

  // Class trend
  const classKeys = Object.keys(CLASS_COLORS);
  document.getElementById("class-trend-legend").innerHTML = classKeys.map(k =>
    `<span class="legend-item"><span class="legend-sq" style="background:${CLASS_COLORS[k]}"></span>${k}</span>`
  ).join("");

  const classDatasets = classKeys.map(k => ({
    label: k,
    data: snaps.map(s => (s.breakdown && s.breakdown[k]) ? s.breakdown[k] : 0),
    borderColor: CLASS_COLORS[k],
    fill: false, tension: 0.35, pointRadius: 2, borderWidth: 1.5
  })).filter(ds => ds.data.some(v => v > 0));

  if (classTrendChart) classTrendChart.destroy();
  classTrendChart = new Chart(document.getElementById("classTrendChart"), {
    type: "line",
    data: { labels, datasets: classDatasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${fmt(ctx.parsed.y)}` } } },
      scales: {
        x: { ticks: { color:"#525b72", font:{size:11}, maxRotation:45, autoSkip:false }, grid: { color:"rgba(255,255,255,0.04)" } },
        y: { ticks: { color:"#525b72", font:{size:11}, callback: v => fmtShort(v) }, grid: { color:"rgba(255,255,255,0.04)" } }
      }
    }
  });
}

// ── Assets table ──────────────────────────────────────────
function renderAssetsTable() {
  const tbody = document.querySelector("#assets-table tbody");
  tbody.innerHTML = state.assets.map(a => `
    <tr>
      <td>${esc(a.name)}</td>
      <td style="color:var(--text-secondary)">${esc(a.institution)}</td>
      <td><span class="class-pill">${esc(a.class)}</span></td>
      <td class="num">${fmt(a.value)}</td>
      <td style="color:var(--text-muted);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(a.notes||"")}</td>
      <td style="white-space:nowrap">
        <button class="btn-icon" onclick="editAsset(${a.id})">Edit</button>
        <button class="btn-icon del" onclick="confirmDelete('asset',${a.id},'${esc(a.name)}')">Delete</button>
      </td>
    </tr>
  `).join("");
}

// ── Liabilities table ─────────────────────────────────────
function renderLiabTable() {
  const tbody = document.querySelector("#liab-table tbody");
  tbody.innerHTML = state.liabilities.map(l => `
    <tr>
      <td>${esc(l.name)}</td>
      <td style="color:var(--text-secondary)">${esc(l.institution)}</td>
      <td class="num neg-val">${fmt(l.amount)}</td>
      <td style="color:var(--text-muted)">${esc(l.notes||"")}</td>
      <td style="white-space:nowrap">
        <button class="btn-icon" onclick="editLiab(${l.id})">Edit</button>
        <button class="btn-icon del" onclick="confirmDelete('liab',${l.id},'${esc(l.name)}')">Delete</button>
      </td>
    </tr>
  `).join("");
}

// ── Snapshots table ───────────────────────────────────────
function renderSnapTable() {
  const tbody = document.querySelector("#snap-table tbody");
  const sorted = [...state.snapshots].sort((a,b) => b.month.localeCompare(a.month));
  tbody.innerHTML = sorted.map(s => {
    const [y,m] = s.month.split("-");
    const label = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][+m-1] + " " + y;
    return `<tr>
      <td class="mono">${label}</td>
      <td class="num pos-val">${fmt(s.total_assets)}</td>
      <td class="num neg-val">${fmt(s.total_liabilities)}</td>
      <td class="num" style="color:var(--accent)">${fmt(s.net_worth)}</td>
      <td><button class="btn-icon del" onclick="deleteSnapshot('${s.month}')">Delete</button></td>
    </tr>`;
  }).join("") || `<tr><td colspan="5" class="muted-text" style="text-align:center;padding:20px">No snapshots yet</td></tr>`;
}

// ── Asset modal ───────────────────────────────────────────
function openAssetModal(asset = null) {
  document.getElementById("asset-modal-title").textContent = asset ? "Edit asset" : "Add asset";
  document.getElementById("asset-id").value = asset ? asset.id : "";
  document.getElementById("asset-name").value = asset ? asset.name : "";
  document.getElementById("asset-institution").value = asset ? asset.institution : "";
  document.getElementById("asset-class").value = asset ? asset.class : "Cash & bank";
  document.getElementById("asset-value").value = asset ? asset.value : "";
  document.getElementById("asset-notes").value = asset ? (asset.notes || "") : "";
  document.getElementById("asset-modal").classList.add("open");
  setTimeout(() => document.getElementById("asset-name").focus(), 80);
}

function editAsset(id) {
  const a = state.assets.find(x => x.id === id);
  if (a) openAssetModal(a);
}

async function saveAsset() {
  const id = document.getElementById("asset-id").value;
  const data = {
    name:        document.getElementById("asset-name").value.trim(),
    institution: document.getElementById("asset-institution").value.trim(),
    class:       document.getElementById("asset-class").value,
    value:       parseFloat(document.getElementById("asset-value").value) || 0,
    notes:       document.getElementById("asset-notes").value.trim(),
  };
  if (!data.name) { showToast("Name is required"); return; }

  if (id) {
    const updated = await api(`/api/assets/${id}`, "PUT", data);
    state.assets = state.assets.map(a => a.id === updated.id ? updated : a);
  } else {
    const created = await api("/api/assets", "POST", data);
    state.assets.push(created);
  }
  state.summary = await api("/api/summary");
  closeModal("asset-modal");
  showToast(id ? "Asset updated" : "Asset added");
  updateSidebarNW();
  renderAssetsTable();
}

// ── Liability modal ───────────────────────────────────────
function openLiabModal(liab = null) {
  document.getElementById("liab-modal-title").textContent = liab ? "Edit liability" : "Add liability";
  document.getElementById("liab-id").value = liab ? liab.id : "";
  document.getElementById("liab-name").value = liab ? liab.name : "";
  document.getElementById("liab-institution").value = liab ? liab.institution : "";
  document.getElementById("liab-amount").value = liab ? liab.amount : "";
  document.getElementById("liab-notes").value = liab ? (liab.notes || "") : "";
  document.getElementById("liab-modal").classList.add("open");
  setTimeout(() => document.getElementById("liab-name").focus(), 80);
}

function editLiab(id) {
  const l = state.liabilities.find(x => x.id === id);
  if (l) openLiabModal(l);
}

async function saveLiability() {
  const id = document.getElementById("liab-id").value;
  const data = {
    name:        document.getElementById("liab-name").value.trim(),
    institution: document.getElementById("liab-institution").value.trim(),
    amount:      parseFloat(document.getElementById("liab-amount").value) || 0,
    notes:       document.getElementById("liab-notes").value.trim(),
  };
  if (!data.name) { showToast("Name is required"); return; }

  if (id) {
    const updated = await api(`/api/liabilities/${id}`, "PUT", data);
    state.liabilities = state.liabilities.map(l => l.id === updated.id ? updated : l);
  } else {
    const created = await api("/api/liabilities", "POST", data);
    state.liabilities.push(created);
  }
  state.summary = await api("/api/summary");
  closeModal("liab-modal");
  showToast(id ? "Liability updated" : "Liability added");
  updateSidebarNW();
  renderLiabTable();
}

// ── Delete confirm ────────────────────────────────────────
function confirmDelete(type, id, name) {
  document.getElementById("confirm-msg").textContent = `Delete "${name}"? This cannot be undone.`;
  document.getElementById("confirm-ok").onclick = async () => {
    if (type === "asset") {
      await api(`/api/assets/${id}`, "DELETE");
      state.assets = state.assets.filter(a => a.id !== id);
    } else {
      await api(`/api/liabilities/${id}`, "DELETE");
      state.liabilities = state.liabilities.filter(l => l.id !== id);
    }
    state.summary = await api("/api/summary");
    closeModal("confirm-modal");
    showToast("Deleted");
    updateSidebarNW();
    if (type === "asset") renderAssetsTable();
    else renderLiabTable();
  };
  document.getElementById("confirm-modal").classList.add("open");
}

// ── Snapshots ─────────────────────────────────────────────
async function saveSnapshot() {
  const month = document.getElementById("snap-month").value;
  if (!month) { showToast("Select a month"); return; }
  const snap = await api("/api/snapshots", "POST", { month });
  const idx = state.snapshots.findIndex(s => s.month === month);
  if (idx >= 0) state.snapshots[idx] = snap;
  else state.snapshots.push(snap);
  showToast(`Snapshot saved for ${month}`);
  renderSnapTable();
}

async function deleteSnapshot(month) {
  await api(`/api/snapshots/${month}`, "DELETE");
  state.snapshots = state.snapshots.filter(s => s.month !== month);
  showToast("Snapshot deleted");
  renderSnapTable();
}

// ── Helpers ───────────────────────────────────────────────
function closeModal(id) { document.getElementById(id).classList.remove("open"); }

function fmt(n) {
  if (n === null || n === undefined) return "—";
  return "$" + Math.round(n).toLocaleString("en-US");
}

function fmtShort(n) {
  if (n === null || n === undefined) return "—";
  const abs = Math.abs(n), sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return sign + "$" + (abs/1_000_000).toFixed(2) + "M";
  if (abs >= 1_000)     return sign + "$" + Math.round(abs/1_000) + "K";
  return sign + "$" + Math.round(abs).toLocaleString();
}

function esc(str) {
  return String(str||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

async function api(url, method = "GET", body = null) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  if (method === "DELETE") return res.json().catch(() => ({}));
  return res.json();
}

let toastTimer;
function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
}
