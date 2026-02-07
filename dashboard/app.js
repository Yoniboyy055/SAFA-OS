const state = {
  planHash: null,
  approvalId: null,
  pendingKillApproval: null,
  pendingNetworkApproval: null,
  routerDefaultsApplied: false,
  routerDefaults: null
};

function applyCardAttributes(card) {
  if (!card) {
    return;
  }
  const blur = card.dataset.blur;
  if (blur) {
    card.style.setProperty("--card-blur", `${Number(blur)}px`);
  }
}

function initCards(scope = document) {
  Array.from(scope.querySelectorAll(".card")).forEach(applyCardAttributes);
}

const els = {
  navItems: Array.from(document.querySelectorAll(".nav-item")),
  panels: {
    home: document.getElementById("panel-home"),
    approvals: document.getElementById("panel-approvals"),
    audit: document.getElementById("panel-audit"),
    system: document.getElementById("panel-system")
  },
  commandText: document.getElementById("commandText"),
  actorInput: document.getElementById("actorInput"),
  skillSelect: document.getElementById("skillSelect"),
  approveToggle: document.getElementById("approveToggle"),
  modeSelect: document.getElementById("modeSelect"),
  modelSelect: document.getElementById("modelSelect"),
  planBtn: document.getElementById("planBtn"),
  execBtn: document.getElementById("execBtn"),
  runBtn: document.getElementById("runBtn"),
  viewApprovalsBtn: document.getElementById("viewApprovalsBtn"),
  planOutput: document.getElementById("planOutput"),
  commandOutput: document.getElementById("commandOutput"),
  policyOutput: document.getElementById("policyOutput"),
  approvalsList: document.getElementById("approvalsList"),
  auditOutput: document.getElementById("auditOutput"),
  systemState: document.getElementById("systemState"),
  killToggleBtn: document.getElementById("killToggleBtn"),
  networkToggleBtn: document.getElementById("networkToggleBtn"),
  killStatus: document.getElementById("killStatus"),
  networkStatus: document.getElementById("networkStatus"),
  strictStatus: document.getElementById("strictStatus"),
  skillInput: document.getElementById("skillInput"),
  queueSummary: document.getElementById("queueSummary")
};

function showPanel(name) {
  Object.values(els.panels).forEach((panel) => panel.classList.remove("panel-active"));
  els.panels[name].classList.add("panel-active");
  els.navItems.forEach((item) => item.classList.remove("active"));
  els.navItems.find((item) => item.dataset.panel === name).classList.add("active");
}

els.navItems.forEach((item) => {
  item.addEventListener("click", () => showPanel(item.dataset.panel));
});

async function api(path, options) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  return res.json();
}

async function loadState() {
  const data = await api("/api/state");
  els.systemState.textContent = `Network=${data.networkEnabled} | Kill=${data.killSwitchEnabled} | Strict=${data.strictApprovalMode} | Version=${data.version}`;
  els.killStatus.textContent = `Kill Switch: ${data.killSwitchEnabled ? "ON" : "OFF"}`;
  els.networkStatus.textContent = `Network: ${data.networkEnabled ? "ON" : "OFF"}`;
  els.strictStatus.textContent = `Strict Mode: ${data.strictApprovalMode ? "ON" : "OFF"}`;
  if (!els.actorInput.value) {
    els.actorInput.value = data.actorDefault || "owner";
  }
  if (data.routerDefaults && !state.routerDefaultsApplied) {
    state.routerDefaults = data.routerDefaults;
    if (data.routerDefaults.mode) {
      els.modeSelect.value = data.routerDefaults.mode;
    }
    if (data.routerDefaults.model) {
      els.modelSelect.value = data.routerDefaults.model;
    }
    state.routerDefaultsApplied = true;
  }
  updateRouterControls();
}

async function loadSkills() {
  const data = await api("/api/skills");
  els.skillSelect.innerHTML = "";
  data.skills.forEach((skill) => {
    const option = document.createElement("option");
    option.value = skill.name;
    option.textContent = `${skill.name} (${skill.risk})`;
    els.skillSelect.appendChild(option);
  });
}

async function loadModels() {
  const data = await api("/api/models");
  els.modelSelect.innerHTML = "";
  data.models.forEach((model) => {
    const option = document.createElement("option");
    option.value = model.id;
    option.textContent = `${model.id} (${model.est_cost_tier})`;
    els.modelSelect.appendChild(option);
  });
  if (state.routerDefaults && state.routerDefaults.model) {
    els.modelSelect.value = state.routerDefaults.model;
  }
  updateRouterControls();
}

function updateRouterControls() {
  const isManual = els.modeSelect.value === "manual";
  els.modelSelect.disabled = !isManual;
}

function renderPolicySummary(data) {
  if (!data || !data.policy_trace) {
    els.policyOutput.textContent = JSON.stringify({ note: "No policy data." }, null, 2);
    return;
  }
  const summary = {
    model_used: data.model_used,
    reason: data.policy_reason,
    policy_trace: data.policy_trace
  };
  els.policyOutput.textContent = JSON.stringify(summary, null, 2);
}

async function loadApprovals() {
  const data = await api("/api/approvals");
  els.queueSummary.textContent = `${data.approvals.length} pending`;
  if (data.approvals.length === 0) {
    els.approvalsList.innerHTML = "<div class='note'>No pending approvals.</div>";
    return;
  }
  els.approvalsList.innerHTML = "";
  data.approvals.forEach((approval) => {
    const row = document.createElement("div");
    row.className = "glass card";
    row.dataset.variant = "system";
    row.dataset.depth = "2";
    row.dataset.media = "abstract";
    row.dataset.blur = "10";
    row.innerHTML = `<div><strong>${approval.action}</strong> -> ${approval.target}</div><div class='note'>${approval.summary}</div>`;
    const approveBtn = document.createElement("button");
    approveBtn.textContent = "APPROVE";
    approveBtn.addEventListener("click", async () => {
      await api("/api/approve", {
        method: "POST",
        body: JSON.stringify({ approvalId: approval.id, decision: "APPROVE", actor: els.actorInput.value })
      });
      await loadApprovals();
    });
    const denyBtn = document.createElement("button");
    denyBtn.textContent = "DENY";
    denyBtn.addEventListener("click", async () => {
      await api("/api/approve", {
        method: "POST",
        body: JSON.stringify({ approvalId: approval.id, decision: "DENY", actor: els.actorInput.value })
      });
      await loadApprovals();
    });
    const buttonRow = document.createElement("div");
    buttonRow.className = "row";
    buttonRow.appendChild(approveBtn);
    buttonRow.appendChild(denyBtn);
    row.appendChild(buttonRow);
    els.approvalsList.appendChild(row);
    applyCardAttributes(row);
  });
}

async function loadAudit() {
  const data = await api("/api/audit/tail?limit=20");
  els.auditOutput.textContent = JSON.stringify(data.events, null, 2);
}

function parseSkillInput() {
  try {
    return JSON.parse(els.skillInput.value || "{}");
  } catch {
    return {};
  }
}

els.planBtn.addEventListener("click", async () => {
  const payload = {
    commandText: els.commandText.value,
    actor: els.actorInput.value,
    routerMode: els.modeSelect.value,
    explicitModel: els.modelSelect.value
  };
  const data = await api("/api/plan", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  state.planHash = data.planHash;
  els.planOutput.textContent = JSON.stringify(data, null, 2);
  renderPolicySummary(data);
  els.execBtn.disabled = !data.planHash;
});

els.execBtn.addEventListener("click", async () => {
  if (!state.planHash) {
    return;
  }
  const data = await api("/api/exec", {
    method: "POST",
    body: JSON.stringify({
      planHash: state.planHash,
      approve: els.approveToggle.checked,
      approvalId: state.approvalId,
      actor: els.actorInput.value,
      routerMode: els.modeSelect.value,
      explicitModel: els.modelSelect.value
    })
  });
  if (data.status === "PENDING_APPROVAL") {
    state.approvalId = data.approvalId;
  }
  els.commandOutput.textContent = JSON.stringify(data, null, 2);
  renderPolicySummary(data);
  await loadApprovals();
});

els.runBtn.addEventListener("click", async () => {
  const data = await api("/api/run", {
    method: "POST",
    body: JSON.stringify({
      skill: els.skillSelect.value,
      input: parseSkillInput(),
      approve: els.approveToggle.checked,
      approvalId: state.approvalId,
      actor: els.actorInput.value
    })
  });
  if (data.status === "PENDING_APPROVAL") {
    state.approvalId = data.approvalId;
  }
  els.commandOutput.textContent = JSON.stringify(data, null, 2);
  await loadApprovals();
});

els.viewApprovalsBtn.addEventListener("click", () => showPanel("approvals"));

els.killToggleBtn.addEventListener("click", async () => {
  const data = await api("/api/kill", {
    method: "POST",
    body: JSON.stringify({
      enabled: !els.killStatus.textContent.includes("ON"),
      approve: els.approveToggle.checked,
      approvalId: state.pendingKillApproval,
      actor: els.actorInput.value
    })
  });
  if (data.status === "PENDING_APPROVAL") {
    state.pendingKillApproval = data.approvalId;
  }
  els.commandOutput.textContent = JSON.stringify(data, null, 2);
  await loadState();
  await loadApprovals();
});

els.networkToggleBtn.addEventListener("click", async () => {
  const data = await api("/api/network", {
    method: "POST",
    body: JSON.stringify({
      enabled: !els.networkStatus.textContent.includes("ON"),
      approve: els.approveToggle.checked,
      approvalId: state.pendingNetworkApproval,
      actor: els.actorInput.value
    })
  });
  if (data.status === "PENDING_APPROVAL") {
    state.pendingNetworkApproval = data.approvalId;
  }
  els.commandOutput.textContent = JSON.stringify(data, null, 2);
  await loadState();
  await loadApprovals();
});

async function boot() {
  initCards();
  await loadState();
  await loadSkills();
  await loadModels();
  await loadApprovals();
  await loadAudit();
  setInterval(loadAudit, 4000);
  setInterval(loadState, 6000);
  showPanel("home");
}

boot();

els.modeSelect.addEventListener("change", updateRouterControls);
