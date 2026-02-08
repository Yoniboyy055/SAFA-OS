# Phase 12 — Multi-LLM Router (Live)

## Scope
- Cloud adapters
- Cost/quality/privacy scoring
- Manual model selection
- Auto-route (approved)
- No silent switching

## Status
ACTIVE. Live adapters can call configured providers when:
- `OPENAI_API_KEY` is set (provider configured)
- Network allowlists include the provider domain
- Network window is open
- `SAFA_NETWORK_LIVE=1` is set to permit live I/O

Core entry points:
- `connectLiveModel`
- `startAutoRoute`
