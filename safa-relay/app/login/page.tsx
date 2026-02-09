"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"request" | "verify">("request");
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState(false);

  async function requestOtp() {
    setLoading(true);
    setStatus("");
    try {
      const res = await fetch("/api/auth/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Request failed.");
      }
      setStage("verify");
      setStatus("OTP sent. Check your email.");
    } catch (error) {
      setStatus(String(error));
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp() {
    setLoading(true);
    setStatus("");
    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Verification failed.");
      }
      router.push("/console");
    } catch (error) {
      setStatus(String(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card" style={{ maxWidth: 520 }}>
      <h2>Login</h2>
      <p className="muted">Email OTP login for the phone console.</p>
      <div className="list">
        <input
          className="input"
          type="email"
          placeholder="Email address"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        {stage === "verify" && (
          <input
            className="input"
            type="text"
            placeholder="6-digit code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
        )}
        <div className="row">
          {stage === "request" ? (
            <button
              className="button"
              onClick={requestOtp}
              disabled={loading || !email}
            >
              Send OTP
            </button>
          ) : (
            <button
              className="button"
              onClick={verifyOtp}
              disabled={loading || !code}
            >
              Verify OTP
            </button>
          )}
          <button
            className="button secondary"
            onClick={() => {
              setStage("request");
              setCode("");
              setStatus("");
            }}
            disabled={loading}
          >
            Start over
          </button>
        </div>
        {status && <div className="muted">{status}</div>}
      </div>
    </div>
  );
}
