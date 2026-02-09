import * as crypto from "node:crypto";

export interface RelayClientOptions {
  baseUrl: string;
  workerKey: string;
}

export interface RelayJobPayload {
  id: string;
  status: string;
  createdAt: string;
  payload: Record<string, unknown>;
}

export class RelayClient {
  private readonly baseUrl: string;
  private readonly workerKey: string;

  constructor(options: RelayClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.workerKey = options.workerKey;
  }

  async fetchQueue(): Promise<RelayJobPayload[]> {
    const response = await this.request("GET", "/api/worker/queue");
    return (response.jobs || []) as RelayJobPayload[];
  }

  async claim(jobId: string): Promise<void> {
    await this.request("POST", "/api/worker/claim", { jobId });
  }

  async postResults(jobId: string, logs: string, output: unknown, status: string): Promise<void> {
    await this.request("POST", "/api/worker/results", { jobId, logs, output, status });
  }

  async postApproval(jobId: string, approvalPayload: Record<string, unknown>): Promise<void> {
    await this.request("POST", "/api/worker/approvals", { jobId, approvalPayload });
  }

  private async request(method: string, path: string, body?: Record<string, unknown>) {
    const bodyString = body ? JSON.stringify(body) : "";
    const headers = this.signHeaders(method, path, bodyString);
    if (bodyString) {
      headers["Content-Type"] = "application/json";
    }
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: bodyString || undefined
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message = json?.error || `Relay error ${res.status}`;
      throw new Error(message);
    }
    return json;
  }

  signHeadersForTest(
    method: string,
    path: string,
    body: string,
    timestamp: string
  ): Record<string, string> {
    return this.buildHeaders(method, path, body, timestamp);
  }

  private signHeaders(method: string, path: string, body: string): Record<string, string> {
    return this.buildHeaders(method, path, body, Date.now().toString());
  }

  private buildHeaders(
    method: string,
    path: string,
    body: string,
    timestamp: string
  ): Record<string, string> {
    const bodyHash = crypto.createHash("sha256").update(body).digest("hex");
    const payload = `${timestamp}.${method}.${path}.${bodyHash}`;
    const signature = crypto
      .createHmac("sha256", this.workerKey)
      .update(payload)
      .digest("base64url");
    return {
      "x-safa-timestamp": timestamp,
      "x-safa-signature": signature
    };
  }
}
