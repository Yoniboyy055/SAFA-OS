# Network Bypass Scan Evidence
Date: 2026-02-08
Scope: Outbound network usage and gate coverage

## Scan Summary
Focus was to confirm all outbound network paths are gated by the deny-by-default network gate.

## Scan Method
Searched the codebase for outbound network usage and URL literals.
- Search terms: fetch, http://, https://
- Scope: src/**/*.ts

## Findings
1) Outbound network client
- File: src/core/network/client.ts
- Notes: All requests call assertNetworkGate before governor evaluation and fetch.

2) LLM provider network usage
- File: src/core/llm/providers/openai.ts
- Notes: Provider performs fetch to https://api.openai.com/v1/chat/completions.
- Gate coverage: callers now enforce assertNetworkGate before provider.call.
  - src/core/phase12/locked.ts (connectLiveModel)
  - src/dashboard/server.ts (generateChatModelReply)

3) Dashboard UI fetch calls
- File: src/dashboard/server.ts (embedded client-side fetch calls)
- Notes: These are browser requests to local dashboard endpoints, not outbound network.

## Result
No ungated outbound network paths found. All outbound requests are either routed through
requestNetwork or are gated before provider calls.

## Follow-up
None.
