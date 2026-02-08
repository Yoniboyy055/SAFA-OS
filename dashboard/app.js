const state = {
  planHash: null,
  approvalId: null,
  pendingKillApproval: null,
  pendingNetworkApproval: null,
  lastPlan: null
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
    world: document.getElementById("panel-world"),
    home: document.getElementById("panel-home"),
    command: document.getElementById("panel-command"),
    plan: document.getElementById("panel-plan"),
    approvals: document.getElementById("panel-approvals"),
    executions: document.getElementById("panel-executions"),
    audit: document.getElementById("panel-audit"),
    system: document.getElementById("panel-system")
  },
  greetingText: document.getElementById("greetingText"),
  presenceNote: document.getElementById("presenceNote"),
  chatStream: document.getElementById("chatStream"),
  chatInput: document.getElementById("chatInput"),
  chatSend: document.getElementById("chatSend"),
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
  planMeta: document.getElementById("planMeta"),
  planSteps: document.getElementById("planSteps"),
  executionList: document.getElementById("executionList"),
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

const conversationHints = Array.from(document.querySelectorAll(".hint"));

function addMessage(role, text) {
  const message = document.createElement("div");
  message.className = `chat-message chat-${role}`;
  message.textContent = text;
  els.chatStream.appendChild(message);
  els.chatStream.scrollTop = els.chatStream.scrollHeight;
}

function updatePresence() {
  if (!window.IntentResolver) {
    return;
  }
  const lastSeenRaw = window.localStorage.getItem("safa.lastSeen");
  const lastSeen = lastSeenRaw ? Number(lastSeenRaw) : undefined;
  const actor = els.actorInput.value || "there";
  const presence = window.IntentResolver.buildPresence(new Date(), actor, lastSeen);
  els.greetingText.textContent = presence.greeting;
  els.presenceNote.textContent = presence.note;
}

function touchPresence() {
  window.localStorage.setItem("safa.lastSeen", String(Date.now()));
  updatePresence();
}

function showPanel(name) {
  Object.values(els.panels).forEach((panel) => panel.classList.remove("panel-active"));
  els.panels[name].classList.add("panel-active");
  els.navItems.forEach((item) => item.classList.remove("active"));
  els.navItems.find((item) => item.dataset.panel === name).classList.add("active");
}

els.navItems.forEach((item) => {
  item.addEventListener("click", () => showPanel(item.dataset.panel));
});

Array.from(document.querySelectorAll("[data-zone]")).forEach((button) => {
  button.addEventListener("click", () => showPanel(button.dataset.zone));
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
  document.body.dataset.network = data.networkEnabled ? "on" : "off";
  document.body.dataset.kill = data.killSwitchEnabled ? "on" : "off";
  document.body.dataset.strict = data.strictApprovalMode ? "on" : "off";
  els.systemState.textContent = `Network=${data.networkEnabled} | Kill=${data.killSwitchEnabled} | Strict=${data.strictApprovalMode} | Version=${data.version}`;
  els.killStatus.textContent = `Kill Switch: ${data.killSwitchEnabled ? "ON" : "OFF"}`;
  els.networkStatus.textContent = `Network: ${data.networkEnabled ? "ON" : "OFF"}`;
  els.strictStatus.textContent = `Strict Mode: ${data.strictApprovalMode ? "ON" : "OFF"}`;
  if (!els.actorInput.value) {
    els.actorInput.value = data.actorDefault || "owner";
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
    option.value = `${model.provider}:${model.id}`;
    option.textContent = `${model.label} (${model.provider})`;
    els.modelSelect.appendChild(option);
  });
  updateRouterControls();
}

function updateRouterControls() {
  const isManual = els.modeSelect.value === "manual";
  els.modelSelect.disabled = !isManual;
}

function resolveManualSelection() {
  const raw = els.modelSelect.value || "openai:gpt-4o-mini";
  if (!raw.includes(":")) {
    return { manualProvider: "openai", manualModel: raw };
  }
  const [manualProvider, manualModel] = raw.split(":", 2);
  return { manualProvider, manualModel };
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

function renderPlanViewer(planData) {
  if (!planData || !planData.plan) {
    els.planMeta.textContent = "No plan loaded.";
    els.planSteps.textContent = "[]";
    return;
  }
  const meta = {
    planHash: planData.planHash,
    valid: planData.valid,
    requiresApproval: planData.requiresApproval
  };
  els.planMeta.textContent = JSON.stringify(meta, null, 2);
  els.planSteps.textContent = JSON.stringify(planData.plan.steps ?? [], null, 2);
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

async function loadExecutions() {
  const data = await api("/api/executions?limit=20");
  if (!data.executions || data.executions.length === 0) {
    els.executionList.textContent = "No executions yet.";
    return;
  }
  els.executionList.innerHTML = "";
  data.executions
    .slice()
    .reverse()
    .forEach((entry) => {
      const card = document.createElement("div");
      card.className = "timeline-item";
      const statusClass = entry.success ? "ok" : "fail";
      const kind = entry.kind === "plan" ? "PLAN" : "SKILL";
      const target = entry.planHash || entry.skill || "unknown";
      const steps = Array.isArray(entry.steps) ? entry.steps.length : 0;
      card.innerHTML = `
        <div class="timeline-header">
          <div class="timeline-kind">${kind}</div>
          <div class="timeline-status ${statusClass}">${entry.success ? "OK" : "FAILED"}</div>
        </div>
        <div class="timeline-target">${target}</div>
        <div class="timeline-meta">${entry.createdAt} · steps ${steps}</div>
      `;
      els.executionList.appendChild(card);
    });
}

function parseSkillInput() {
  try {
    return JSON.parse(els.skillInput.value || "{}");
  } catch {
    return {};
  }
}

async function runPlan(commandText, routerMode = "auto") {
  const manualSelection = resolveManualSelection();
  const payload = {
    commandText,
    actor: els.actorInput.value,
    routerMode,
    manualProvider: manualSelection.manualProvider,
    manualModel: manualSelection.manualModel
  };
  const data = await api("/api/plan", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  state.planHash = data.planHash;
  state.lastPlan = data;
  els.planOutput.textContent = JSON.stringify(data, null, 2);
  renderPlanViewer(data);
  renderPolicySummary(data);
  els.execBtn.disabled = !data.planHash;
  return data;
}

async function runExec(approve) {
  if (!state.planHash) {
    return { status: "NO_PLAN" };
  }
  const manualSelection = resolveManualSelection();
  const data = await api("/api/exec", {
    method: "POST",
    body: JSON.stringify({
      planHash: state.planHash,
      approve,
      approvalId: state.approvalId,
      actor: els.actorInput.value,
      routerMode: els.modeSelect.value,
      manualProvider: manualSelection.manualProvider,
      manualModel: manualSelection.manualModel
    })
  });
  if (data.status === "PENDING_APPROVAL") {
    state.approvalId = data.approvalId;
  }
  els.commandOutput.textContent = JSON.stringify(data, null, 2);
  renderPolicySummary(data);
  await loadApprovals();
  await loadExecutions();
  return data;
}

async function runSkill(skill, input, approve) {
  const data = await api("/api/run", {
    method: "POST",
    body: JSON.stringify({
      skill,
      input,
      approve,
      approvalId: state.approvalId,
      actor: els.actorInput.value
    })
  });
  if (data.status === "PENDING_APPROVAL") {
    state.approvalId = data.approvalId;
  }
  els.commandOutput.textContent = JSON.stringify(data, null, 2);
  await loadApprovals();
  await loadExecutions();
  return data;
}

els.planBtn.addEventListener("click", async () => {
  await runPlan(els.commandText.value, els.modeSelect.value);
});

els.execBtn.addEventListener("click", async () => {
  await runExec(els.approveToggle.checked);
});

els.runBtn.addEventListener("click", async () => {
  await runSkill(els.skillSelect.value, parseSkillInput(), els.approveToggle.checked);
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
  await loadExecutions();
  updatePresence();
  addMessage("safa", "Say what you want to handle, and I will translate it into a plan.");
  setInterval(loadAudit, 4000);
  setInterval(loadState, 6000);
  setInterval(loadExecutions, 6000);
  showPanel("home");
}

boot();

els.modeSelect.addEventListener("change", updateRouterControls);

els.chatSend.addEventListener("click", async () => {
  const text = els.chatInput.value.trim();
  if (!text) {
    return;
  }
  els.chatInput.value = "";
  addMessage("user", text);
  touchPresence();
  if (!window.IntentResolver) {
    addMessage("safa", "Intent resolver is not available.");
    return;
  }
  const intent = window.IntentResolver.resolveIntent(text);
  if (intent.response) {
    addMessage("safa", intent.response);
  }
  if (intent.type === "panel" && intent.panel) {
    showPanel(intent.panel);
    return;
  }
  if (intent.type === "run_skill") {
    const result = await runSkill(intent.skill, intent.input ?? {}, false);
    if (result.status === "PENDING_APPROVAL") {
      addMessage("safa", "Approval required. Review it in the approvals panel.");
    } else if (result.success === false) {
      addMessage("safa", result.error ?? "The request was blocked.");
    } else {
      addMessage("safa", "Done. Check the timeline for details.");
    }
    return;
  }
  if (intent.type === "exec") {
    if (!state.planHash) {
      addMessage("safa", "I need a plan first. Tell me what to plan.");
      return;
    }
    const result = await runExec(false);
    if (result.status === "PENDING_APPROVAL") {
      addMessage("safa", "Approval required. Review it in the approvals panel.");
    } else if (result.success === false) {
      addMessage("safa", result.error ?? "Execution was blocked.");
    } else {
      addMessage("safa", "Execution complete. Timeline updated.");
    }
    return;
  }
  if (intent.type === "plan") {
    const planResult = await runPlan(text, "auto");
    if (planResult.plan && Array.isArray(planResult.plan.steps)) {
      addMessage("safa", `Plan ready with ${planResult.plan.steps.length} steps.`);
      addMessage("safa", "Review it in Plan Viewer or tell me to execute.");
    } else {
      addMessage("safa", "Plan ready. Review it in Plan Viewer.");
    }
  }
});

els.chatInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    els.chatSend.click();
  }
});

conversationHints.forEach((button) => {
  button.addEventListener("click", () => {
    const hint = button.dataset.hint;
    if (!hint) {
      return;
    }
    els.chatInput.value = hint;
    els.chatSend.click();
  });
});
