const intents = [
  {
    id: "INT-001",
    title: "Summarize audit policies",
    mode: "CLARIFY",
    status: "Waiting for approval"
  },
  {
    id: "INT-002",
    title: "List files in docs/",
    mode: "BUILD",
    status: "Queued"
  }
];

const approvals = [
  {
    id: "APR-021",
    action: "read_file",
    target: "docs/PHASE2A2.md",
    risk: "LOW",
    status: "Pending"
  },
  {
    id: "APR-022",
    action: "write_file",
    target: "data/notes.txt",
    risk: "MEDIUM",
    status: "Pending"
  }
];

const receipts = `receiptId: RCP-0931
actor: owner
action: write_file
target: data/notes.txt
approved: true
result: success
timestamp: 2026-02-04T12:34:56Z`;

const auditEntries = [
  {
    id: "AUD-110",
    action: "plan.created",
    result: "2 steps",
    time: "12:30:10"
  },
  {
    id: "AUD-111",
    action: "request.preview",
    result: "hash: 9f3e...",
    time: "12:31:02"
  },
  {
    id: "AUD-112",
    action: "request.denied",
    result: "Approval required",
    time: "12:31:55"
  }
];

// Sample scheduled tasks data
const scheduledTasks = [
  {
    id: "daily-standup",
    type: "time",
    schedule: "0 9 * * 1-5",
    action: "Send daily standup reminder to Discord #general",
    nextRun: new Date(Date.now() + 3600000), // 1 hour from now
    autoApprove: true,
    status: "Active"
  }
];

// Sample trigger execution log
const triggerExecutions = [
  {
    id: "daily-standup",
    action: "Send daily standup reminder",
    result: "SUCCESS",
    time: "09:00:00",
    approved: true
  }
];

const intentList = document.getElementById("intent-list");
const approvalList = document.getElementById("approval-list");
const receiptView = document.getElementById("receipt-view");
const auditList = document.getElementById("audit-list");
const scheduledTasksList = document.getElementById("scheduled-tasks-list");
const triggerLogList = document.getElementById("trigger-log-list");

intents.forEach((intent) => {
  const li = document.createElement("li");
  li.textContent = `${intent.id} • ${intent.mode} • ${intent.title} — ${intent.status}`;
  intentList.appendChild(li);
});

approvals.forEach((approval) => {
  const li = document.createElement("li");
  li.textContent = `${approval.id} • ${approval.action} → ${approval.target} • ${approval.risk}`;
  approvalList.appendChild(li);
});

receiptView.textContent = receipts;

auditEntries.forEach((entry) => {
  const li = document.createElement("li");
  li.textContent = `${entry.time} • ${entry.action} • ${entry.result}`;
  auditList.appendChild(li);
});

// Render scheduled tasks
function renderScheduledTasks() {
  scheduledTasksList.innerHTML = "";
  if (scheduledTasks.length === 0) {
    const li = document.createElement("li");
    li.className = "muted";
    li.textContent = "No scheduled tasks configured";
    scheduledTasksList.appendChild(li);
  } else {
    scheduledTasks.forEach((task) => {
      const li = document.createElement("li");
      const nextRunStr = task.nextRun ? new Date(task.nextRun).toLocaleString() : "N/A";
      const approvalBadge = task.autoApprove ? "✓ Auto" : "Manual";
      li.innerHTML = `
        <div style="margin-bottom: 4px;"><strong>${task.id}</strong> • ${task.type}</div>
        <div style="font-size: 12px; color: var(--muted);">
          ${task.action}<br/>
          Schedule: ${task.schedule || "N/A"} • Next: ${nextRunStr}<br/>
          Approval: ${approvalBadge} • Status: ${task.status}
        </div>
      `;
      scheduledTasksList.appendChild(li);
    });
  }
}

// Render trigger execution log
function renderTriggerLog() {
  triggerLogList.innerHTML = "";
  if (triggerExecutions.length === 0) {
    const li = document.createElement("li");
    li.className = "muted";
    li.textContent = "No trigger executions yet";
    triggerLogList.appendChild(li);
  } else {
    triggerExecutions.forEach((exec) => {
      const li = document.createElement("li");
      const statusIcon = exec.result === "SUCCESS" ? "✓" : "✗";
      const approvedIcon = exec.approved ? "✓" : "✗";
      li.textContent = `${exec.time} • ${exec.id} • ${exec.action} • ${statusIcon} ${exec.result} • Approved: ${approvedIcon}`;
      triggerLogList.appendChild(li);
    });
  }
}

// Toggle trigger form
function showAddTriggerForm() {
  document.getElementById("trigger-form").style.display = "block";
  document.getElementById("scheduled-tasks").style.display = "none";
}

function hideAddTriggerForm() {
  document.getElementById("trigger-form").style.display = "none";
  document.getElementById("scheduled-tasks").style.display = "block";
}

// Initialize
renderScheduledTasks();
renderTriggerLog();
