# SPEC v1 — SAFA OS (Governed)

## Target Stack
Pick ONE later (Cursor phase):
- Node.js + TypeScript (recommended)
- Python

## Phase 0 — Scaffolding (local-only)
Deliverables:
- CLI entrypoint (safa)
- Config system (yaml/json)
- Audit logger (append-only)
- Skills registry interface (no network skills)
- Governor enforcement layer (hard blocks on restricted actions)

## Skill Contract (mandatory)
Each skill must declare:
- name
- inputs schema
- risk level (LOW/MED/HIGH)
- requires approval? (yes/no)
- allowed when NETWORK=OFF? (yes/no)
- audit event template

## Minimum Phase 0 Skills
- read_file
- write_file (restricted paths)
- list_files
- search_text
- run_tests (local only)

## Hard Constraints
- Must obey governance/GOVERNOR.md
- No hidden background processes
- No external calls unless approved + allowlisted
