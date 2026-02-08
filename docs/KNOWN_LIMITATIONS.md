# Known Limitations

- Live network I/O requires allowlist + active window + JARVIS_NETWORK_LIVE=1.
- Operator executes local-only skills; non-local steps are denied.
- Strict approvals can block preview actions unless explicitly approved.
- Dashboard approvals are local-only and tied to the local store.
- Audit log is append-only but stored locally (no remote replication).
