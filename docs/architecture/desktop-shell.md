# Desktop Shell (Electron)

Goal: wrap the local dashboard UI in a desktop window without system‑level privileges.

Status: **Prep complete**. The Electron shell only loads `http://127.0.0.1:3777`
in a fullscreen window (no browser chrome). 3D/VR pipeline is a placeholder only.

## Run locally
1. Start dashboard server (kill switch must be ON):
   ```
   export SAFA_OWNER_TOKEN="LONG_RANDOM_TOKEN"
   node dist/dashboard/server.js
   ```
2. Launch desktop shell:
   ```
   npm run desktop
   ```

No network access is enabled by this shell. It is a local window only.
