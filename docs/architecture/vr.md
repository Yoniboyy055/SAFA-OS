# VR Module (Enabled, Hardware Gated)

Status:
- VR module enabled
- Hardware disarmed by default

## Arming rules
VR hardware access requires:
- `SAFA_VR_ARMED="1"` environment variable
- Owner token
- `authority: OWNER`
- `approve: true`
- Governor approval
- If kill switch is ON: explicit override in the request payload

## Endpoints
- `GET /vr/status`
- `POST /vr/arm`
- `POST /vr/disarm`

No device calls occur unless armed.

## Example arming request
```
POST /vr/arm
{
  "mode": "SCRIPT",
  "authority": "OWNER",
  "approve": true,
  "overrideKillSwitch": true
}
```
