# LLM Router (Cloud MVP)

## Overview

The router supports two modes:

- **Manual**: pass an explicit model ID and it will be used.
- **Auto**: policy selects a model based on task type and preferences.

## Model Registry

Registry entries live in `src/core/llm/model_registry.ts` and define:

- `provider`
- `model`
- `tags` (core, vision, code, reason)
- `est_cost_tier`
- `max_tokens_hint`

## Policy Rules (Auto)

Routing inputs:

- `task_type`: chat | code | vision | admin
- `sensitivity`: low | med | high
- `latency_pref`: fast | balanced | deep
- `budget_pref`: cheap | balanced | premium

Decision flow:

1. Manual + explicit model always wins.
2. Vision tasks route to the vision model.
3. Code tasks route to the code model.
4. Fast/cheap preferences route to the core model.
5. High sensitivity or deep latency routes to the reason model if configured; otherwise falls back to core.
6. Default is core.

Each decision returns `selected_model`, a short `reason`, and a `policy_trace` object.

## Environment Variables

- `OPENAI_API_KEY`: required for provider calls.
- `ROUTER_DEFAULT_MODE`: auto | manual
- `ROUTER_DEFAULT_MODEL`: default model id (e.g. openai:gpt-4o-mini)
- `ROUTER_REASON_MODEL`: optional model id to enable reason routing (e.g. openai:gpt-5)

## Usage

The router entry point is `src/core/llm/router.ts`:

```ts
const result = await routeAndRun({
  mode: "auto",
  task_type: "chat",
  sensitivity: "med",
  latency_pref: "balanced",
  budget_pref: "balanced",
  messages: [{ role: "user", content: "Hello" }]
});
```
