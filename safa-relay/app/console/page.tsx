"use client";

import { useEffect, useMemo, useState } from "react";

type JobRecord = {
  id: string;
  status: string;
  createdAt: string;
  payload?: any;
  approvalId?: string;
};

type ApprovalRecord = {
  id: string;
  jobId: string;
  status: string;
  createdAt: string;
  reason?: string;
  risk?: string;
};

type ResultRecord = {
  jobId: string;
  createdAt: string;
  logs?: string;
  output?: any;
};

export default function ConsolePage() {
  const [message, setMessage] = useState("");
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRecord[]>([]);
  const [results, setResults] = useState<Record<string, ResultRecord>>({});
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  const approvalsByJob = useMemo(() => {
    const map: Record<string, ApprovalRecord> = {};
    approvals.forEach((approval) => {
      map[approval.jobId] = approval;
    });
    return map;
  }, [approvals]);

  async function refresh() {
    setLoading(true);
    setStatus("");
    try {
      const [jobsRes, approvalsRes] = await Promise.all([
        fetch("/api/jobs"),
        fetch("/api/approvals")
      ]);
      const jobsData = await jobsRes.json();
      const approvalsData = await approvalsRes.json();
      if (!jobsRes.ok) {
        throw new Error(jobsData?.error || "Failed to load jobs.");
      }
      if (!approvalsRes.ok) {
        throw new Error(approvalsData?.error || "Failed to load approvals.");
      }
      setJobs(jobsData.jobs || []);
      setApprovals(approvalsData.approvals || []);
    } catch (error) {
      setStatus(String(error));
    } finally {
      setLoading(false);
    }
  }

  async function createJob() {
    setLoading(true);
    setStatus("");
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Failed to create job.");
      }
      setMessage("");
      await refresh();
    } catch (error) {
      setStatus(String(error));
    } finally {
      setLoading(false);
    }
  }

  async function decideApproval(id: string, decision: "APPROVE" | "DENY") {
    setLoading(true);
    setStatus("");
    try {
      const res = await fetch(`/api/approvals/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Failed to update approval.");
      }
      await refresh();
    } catch (error) {
      setStatus(String(error));
    } finally {
      setLoading(false);
    }
  }

  async function loadResult(jobId: string) {
    setStatus("");
    try {
      const res = await fetch(`/api/results?jobId=${encodeURIComponent(jobId)}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Failed to load result.");
      }
      if (data.result) {
        setResults((prev) => ({ ...prev, [jobId]: data.result }));
      }
    } catch (error) {
      setStatus(String(error));
    }
  }

  useEffect(() => {
    refresh();
    const timer = setInterval(() => {
      refresh();
    }, 6000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="grid-two">
      <section className="card">
        <h2>Chat Request</h2>
        <textarea
          className="textarea"
          placeholder="Describe the task for the laptop worker..."
          value={message}
          onChange={(event) => setMessage(event.target.value)}
        />
        <div className="row">
          <button
            className="button"
            onClick={createJob}
            disabled={loading || !message.trim()}
          >
            Create Job
          </button>
          <button className="button secondary" onClick={refresh} disabled={loading}>
            Refresh
          </button>
        </div>
        {status && <div className="muted">{status}</div>}
      </section>

      <section className="card">
        <h2>Pending Approvals</h2>
        <div className="list">
          {approvals.length === 0 && <div className="muted">No approvals pending.</div>}
          {approvals.map((approval) => (
            <div key={approval.id} className="list-item">
              <div><strong>{approval.jobId}</strong></div>
              <div className="muted">{approval.reason || "Approval required"}</div>
              <div className="muted">Risk: {approval.risk || "unknown"}</div>
              <div className="row">
                <button
                  className="button"
                  onClick={() => decideApproval(approval.id, "APPROVE")}
                  disabled={loading}
                >
                  Approve
                </button>
                <button
                  className="button danger"
                  onClick={() => decideApproval(approval.id, "DENY")}
                  disabled={loading}
                >
                  Deny
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card" style={{ gridColumn: "1 / -1" }}>
        <h2>Jobs</h2>
        <div className="list">
          {jobs.length === 0 && <div className="muted">No jobs yet.</div>}
          {jobs.map((job) => {
            const approval = approvalsByJob[job.id];
            const result = results[job.id];
            return (
              <div key={job.id} className="list-item">
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <div><strong>{job.id}</strong></div>
                  <div className="muted">{job.status}</div>
                </div>
                {approval && (
                  <div className="muted">Approval: {approval.status}</div>
                )}
                {job.payload?.message && (
                  <div className="muted">Message: {job.payload.message}</div>
                )}
                <div className="row">
                  <button
                    className="button secondary"
                    onClick={() => loadResult(job.id)}
                    disabled={loading}
                  >
                    Load Result
                  </button>
                </div>
                {result && (
                  <div className="muted">
                    <div>Result @ {result.createdAt}</div>
                    {result.logs && <pre>{result.logs}</pre>}
                    {result.output && (
                      <pre>{JSON.stringify(result.output, null, 2)}</pre>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
