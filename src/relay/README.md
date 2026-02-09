# Relay Poller

This module polls the SAFA Relay v1 API, claims approved jobs, creates local jobs, and posts results.

## Environment
- SAFA_RELAY_BASE_URL
- SAFA_WORKER_HMAC_KEY

## Usage

```ts
import { startRelayPoller } from "./relay_poller";

startRelayPoller({
  baseUrl: process.env.SAFA_RELAY_BASE_URL || "",
  workerKey: process.env.SAFA_WORKER_HMAC_KEY || "",
  actor: "owner"
});
```
