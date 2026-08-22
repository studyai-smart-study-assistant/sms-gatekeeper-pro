# Native Android SMS layer

The `android/` Capacitor platform is generated on demand (locally or in CI) with
`npx cap add android`, so it is not committed. Everything hand-written for the
gateway lives in this folder and is copied into the generated project by
`scripts/apply-android-native.sh` (also run by the GitHub workflow).

## Files

| File | Copied to | Purpose |
| --- | --- | --- |
| `SmsGatewayPlugin.java` | `android/app/src/main/java/app/gatekeeper/smsgateway/` | Capacitor plugin: permissions, device info, `sendSms`, service control |
| `GatewayService.java` | same | Foreground service: heartbeat, claim jobs, send, acknowledge |
| `MainActivity.java` | same | Registers the plugin |
| `AndroidManifest.xml` | `android/app/src/main/` | SMS + foreground-service permissions, service + boot receiver |
| `BootReceiver.java` | same package | Restarts the gateway service after reboot |

## Delivery semantics

`sendSms` uses `SmsManager.sendTextMessage` with a `SENT` PendingIntent. The
broadcast result decides the acknowledgement:

- `RESULT_OK` → `status: "sent"`
- `RESULT_ERROR_NO_SERVICE` / `RESULT_ERROR_RADIO_OFF` → `status: "failed"` with a
  transient error code, so the server retries
- anything else → `status: "failed"` permanently

Long messages are split with `divideMessage` and sent as a multipart message;
the job is acknowledged once for the whole message.

## Local build

```bash
bun run build
npx cap add android         # first time only
bash scripts/apply-android-native.sh
npx cap sync android
cd android && ./gradlew assembleDebug
```
