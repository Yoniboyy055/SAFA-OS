# Phone Access (Prep Only)

This is documentation only. No auto‑enable.

## Tailscale Access
1. Install Tailscale on the host and phone.
2. Use ACLs to restrict access to the host from your phone only.
3. Keep the dashboard bound to `127.0.0.1`. Use Tailscale SSH port forwarding:
   ```
   tailscale ssh user@host -- -L 3777:127.0.0.1:3777
   ```

## PIN + Cookie Auth
- Set `SAFA_OWNER_TOKEN` on the host.
- Set `SAFA_PIN` (defaults to `1234` if unset).
- Call `POST /auth/unlock` with the PIN to receive an httpOnly session cookie.
- Use the cookie for `POST /command` and `POST /chat`.

## Phone Capabilities (Local Only)
- View status (`GET /status`)
- View skills (`GET /skills`)
- Send governed commands (`POST /command`)

Execution parity matches desktop (local-only, governed). External actions remain
disabled. Dry-run is recommended by default.
