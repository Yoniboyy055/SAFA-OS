# Phase 5 — Execution Expansion (Prep Only, Governed)

Phase 5 prepares controlled expansion while keeping runtime network OFF and
all outbound actions in preview/dry-run mode.

## What is added (prep only)
- **Memory vault (data/memory):**
  - `canon/` owner-approved facts
  - `notes/` session notes
  - `artifacts/` plans/packets
- **Request-only planning skills:**
  - `request_web_build`, `request_doc_pack`, `request_video_edit`, `request_image_edit`
  - Output deterministic plans + risks + estimated_cost (0)
  - No commands executed
- **Execution runner scaffold (disabled by default):**
  - Config `execution.enabled=false` by default
  - `run_packet` denies when disabled
- **LLM recommendations (advisory only):**
  - `recommend_llm` returns ranked options without spending or switching
- **Security analysis:**
  - `analyze_input_risk` classifies prompt injection / scam indicators

## Still disabled
- Network remains OFF by default
- Provider integrations remain preview-only
- Execution runner does not execute unless explicitly enabled later

## Governance gates (unchanged)
- `--mode` + `--authority OWNER` required for governed execution
- `--approve` required for risky actions
- Kill switch overrides all outbound/exec categories

