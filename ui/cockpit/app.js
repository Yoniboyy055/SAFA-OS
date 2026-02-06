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

const intentList = document.getElementById("intent-list");
const approvalList = document.getElementById("approval-list");
const receiptView = document.getElementById("receipt-view");
const auditList = document.getElementById("audit-list");

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
