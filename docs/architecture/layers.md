# Layers (Design + State)

This system is structured into four layers. States are enforced by governance.

| Layer | Description | State |
| --- | --- | --- |
| 1 | Core reasoning & planning (parser, planner, governor, audit) | ACTIVE |
| 2 | Automation & workflows (local skills, memory, knowledge, runner) | ACTIVE |
| 3 | External interaction (email/calls/network) | LOCKED |
| 4 | Autonomous expansion / agent spawning | DISABLED |

Layer 4 is implemented in code but hard‑disabled. No runtime execution.
