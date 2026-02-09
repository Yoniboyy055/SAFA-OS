# Production Readiness Checklist

Status legend: [ ] not verified, [x] verified, [!] blocked

## Release Gates
- [ ] Secrets hygiene verified (.env gitignored, .env.example safe, history scanned).
- [ ] Network live gating verified (allowlist + window + SAFA_NETWORK_LIVE=1).
- [ ] Outbound operations verified for live use (email/calls/payments).
- [x] Execution runner implemented and packet execution path wired.
- [x] Kill switch and approval gates verified in production config.
- [ ] Release lock policy reviewed (on/off + blocked categories).
- [x] Audit redaction verified (keys + headers) and UI never returns env vars.
- [ ] LLM and proactivity defaults reviewed and approved for production use.
- [ ] CI reproducibility verified (npm ci, npm run build, npm test).
- [ ] Relay deployment configured correctly (Root Directory, build/output).

## Evidence Links
- Secrets checklist: [docs/SECURITY_CHECKLIST.md](docs/SECURITY_CHECKLIST.md)
- Known limitations: [docs/KNOWN_LIMITATIONS.md](docs/KNOWN_LIMITATIONS.md)
- Not implemented list: [docs/NOT_IMPLEMENTED.md](docs/NOT_IMPLEMENTED.md)
- Release locks: [docs/RELEASE_LOCKS.md](docs/RELEASE_LOCKS.md)
- Runtime config: [safa.config.json](safa.config.json)
- Packet runner implementation: [src/core/packet_runner.ts](src/core/packet_runner.ts)
- Packet skill wiring: [src/skills/runner/run_packet.ts](src/skills/runner/run_packet.ts)
- Network client gating: [src/core/network/client.ts](src/core/network/client.ts)
- Email client gating: [src/core/email/client.ts](src/core/email/client.ts)
- Calls client gating: [src/core/calls/client.ts](src/core/calls/client.ts)
- Relay app: [safa-relay/package.json](safa-relay/package.json)

## Evidence (2026-02-09)
- Approval + kill switch enforcement: [tests/governor.test.ts](tests/governor.test.ts), [tests/phase6_gates.test.ts](tests/phase6_gates.test.ts)
- Audit redaction + dashboard enforcement: [tests/dashboard.test.ts](tests/dashboard.test.ts), [tests/dashboard_auth.test.ts](tests/dashboard_auth.test.ts)
- PIN lock + remote approvals signed: [tests/dashboard_ui.test.ts](tests/dashboard_ui.test.ts), [tests/dashboard_remote.test.ts](tests/dashboard_remote.test.ts)
- Network approval modes: [tests/network_corridor.test.ts](tests/network_corridor.test.ts)
- Packet execution path: [src/core/packet_runner.ts](src/core/packet_runner.ts), [src/skills/runner/run_packet.ts](src/skills/runner/run_packet.ts)
