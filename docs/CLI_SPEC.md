# CLI Contract Specification

This document defines the CLI commands and expected outputs for SAFA OS.
Specification only — no new CLI commands are implemented here.

## Commands

### `safa skills`
Output:
- JSON array of available skills and metadata.

### `safa plan "<task>"`
Output:
- JSON plan object containing steps, stress tests, and assumptions.

### `safa exec "<task>"`
Requirements:
- Approval is required (strict approval mode).
Output:
- JSON object containing the plan and execution results.

### `safa audit tail [--n 50]`
Output:
- The most recent N audit log entries (default 50).

### `safa config show`
Output:
- The current resolved configuration.

## Phase 1/2 Constraints
`exec` never performs network actions in Phase 1/2 unless **2A** is explicitly
implemented and approved under governance rules.
