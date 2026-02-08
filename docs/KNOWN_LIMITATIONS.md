# Known Limitations

- Network corridor returns stub responses only; live I/O is disabled.
- Operator executes local-only skills; non-local steps are denied.
- Strict approvals can block preview actions unless explicitly approved.
- Dashboard approvals are local-only and tied to the local store.
- Audit log is append-only but stored locally (no remote replication).
