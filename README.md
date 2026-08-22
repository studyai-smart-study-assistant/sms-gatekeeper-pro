# SMS Bridge

SMS Gatekeeper — Complete Product & Engineering Specification

Build a complete, production-ready generic SMS Gatekeeper platform.

This is an independent product. Do not hard-code or assume any specific external application such as Study AI, and do not design the system around a single customer.

The purpose of this product is simple:

Allow a user to register their own Android phone as an SMS Gateway. An authorized external backend application can then call the Gatekeeper API with a recipient phone number and message. The registered Android phone receives the job and sends the SMS through its own SIM/mobile network.

1. Core Architecture

The final architecture should be:

ANY AUTHORIZED MAIN APPLICATION
              |
              | HTTPS API
              | API Key
              | recipient + message
              ▼
       SMS GATEKEEPER API
              |
              | SMS Job
              ▼
       REGISTERED ANDROID
          GATEWAY APP
              |
              | Native Android SMS API
              ▼
        REGISTERED SIM
              |
              ▼
       RECIPIENT'S PHONE


The Gatekeeper must remain completely independent of the external application calling it.

The external application only needs:

Gatekeeper Base URL

API Key

Recipient phone number

Message

2. Product Components

Create these components as one coherent project/repository:

sms-gatekeeper/
│
├── web-dashboard/
│
├── backend/
│
├── android/
│
├── capacitor/
│
├── docs/
│
├── .github/
│   └── workflows/
│       ├── android-build.yml
│       ├── android-release.yml
│       └── ci.yml
│
└── README.md


Use a clean monorepo structure if that is technically better for the selected Lovable stack.

Do not create unnecessary duplicate applications.

3. Web Dashboard

Create a modern responsive dashboard for managing the SMS Gatekeeper.

Pages:

Dashboard

Display:

Gateway status

Registered devices

Active device

SMS sent today

SMS sent this month

Failed SMS

API requests

Recent SMS jobs

Devices

Display registered Android devices.

Each device should have:

Device name

Gateway Device ID

Registration status

Online/offline status

Last heartbeat

Android version

App version

SMS permission status

Default device status

SMS statistics

API Keys

Allow:

Create API key

Name API key

Select associated device

View masked API key

Copy newly generated key

Revoke key

Rotate key

View last-used timestamp

View creation date

SMS Logs

Display:

Message ID

Recipient

Device

Status

Created time

Sent time

Error information where applicable

Avoid unnecessarily exposing sensitive message contents.

4. Android Device Registration

This is one of the most important features.

A user must explicitly register an Android device before it can send SMS.

Registration flow:

Login
  ↓
Add Android Device
  ↓
Generate Pairing Code
  ↓
Open Android Gateway App
  ↓
Login / Enter Pairing Code
  ↓
Create Gateway Device ID
  ↓
Bind Device to User Account
  ↓
Request Android Permissions
  ↓
Verify Device
  ↓
Device becomes ACTIVE


Do NOT use IMEI as the primary device identity.

Instead create a cryptographically random unique:

gateway_device_id


Example:

gwdev_01HXXXXXXXXXXXX


The Android installation should also have a securely generated local installation identity.

The server should associate:

User
  ↓
Gateway Device
  ↓
Device Credential
  ↓
Android Installation


The device credential must be stored securely on Android.

5. Device Pairing

Implement a secure device pairing system.

Example:

Dashboard:

Pair New Device

Pairing Code:
839271

Expires in:
05:00


The Android application enters/scans the pairing code.

After successful pairing:

Gateway Device ID:
gwdev_xxxxxxxxx

Status:
ACTIVE


Pairing codes must:

Expire

Be single-use

Be cryptographically random

Not be reusable

Not expose account credentials

6. Phone / SIM Registration

The user must identify which phone/SIM is being used as the SMS sender.

Do not rely on Android always being able to read the SIM's own phone number.

Different Android versions, carriers and devices may restrict access to the SIM phone number.

Therefore support:

User enters sender phone number
+
Android app reports available SIM information
+
Server verifies/records the registered sender


The important identity is the registered Gateway Device, not a fragile hardware identifier.

The dashboard should clearly show:

Sender Device
My Android Phone

Gateway Device ID
gwdev_xxxxxxxxx

Sender Number
+91XXXXXXXXXX

Status
VERIFIED / ACTIVE


7. Android Permissions

The Android application must properly request and handle the permissions required for SMS sending.

Implement native Android SMS functionality rather than pretending that a normal browser/web page can send SMS programmatically.

Where applicable use:

android.permission.SEND_SMS


Handle:

Permission granted

Permission denied

Permission permanently denied

User needs to open Android settings

Permission revoked later

The dashboard/app must show the actual permission state.

Do not silently fail.

8. Native Android SMS Layer

Use Capacitor for the application shell but implement the actual SMS functionality through a proper native Android bridge/plugin.

Create a clean abstraction such as:

SmsSender


with operations conceptually equivalent to:

sendSms(to, message)
getPermissionStatus()
requestSmsPermission()


The web application should communicate with the native Android implementation through the Capacitor bridge.

Do not attempt to send SMS directly from JavaScript/browser APIs.

9. Background Gateway

The Android Gateway must be capable of processing SMS jobs while the visible UI is not open, using Android-supported background execution mechanisms.

Requirements:

Lightweight background operation

Minimal battery consumption

Device heartbeat

Job synchronization

Local pending-job queue

Retry handling

Safe recovery after temporary network loss

Recovery after app/device restart where Android permits

No aggressive infinite polling loop

No unnecessary wake locks

Do not implement a battery-heavy permanent loop.

Use Android-native best practices for background execution.

If a specific Android version imposes restrictions, handle those restrictions explicitly and show the user the required setup.

10. SMS Job Architecture

Never directly treat an HTTP request as "SMS already sent."

When the API receives:

{
  "to": "+91XXXXXXXXXX",
  "message": "Your verification code is 482731"
}


create a durable SMS job.

Example:

API Request
   ↓
Validate
   ↓
Create Message ID
   ↓
Create SMS Job
   ↓
Queue
   ↓
Assign to Registered Device
   ↓
Android Gateway fetches/receives job
   ↓
Native SMS API sends
   ↓
Android reports result
   ↓
Server updates job status


11. Message ID and Idempotency

Every SMS request must have a unique:

message_id


Support idempotency.

If an external application retries the same request because of a network timeout, the Gatekeeper must not accidentally send the same SMS twice.

Support an idempotency key such as:

Idempotency-Key: <unique-request-id>


12. Generic API

Create:

POST /api/v1/sms/send


Authentication:

Authorization: Bearer <API_KEY>


Request:

{
  "to": "+91XXXXXXXXXX",
  "message": "Your verification code is 482731"
}


Optional:

{
  "to": "+91XXXXXXXXXX",
  "message": "Your verification code is 482731",
  "device_id": "gwdev_xxxxxxxxx",
  "idempotency_key": "req_xxxxxxxxx"
}


Response:

{
  "success": true,
  "message_id": "msg_xxxxxxxxx",
  "status": "queued"
}


The API must NOT expose the Android device's private credentials.

13. API Key Security

API keys must be treated like passwords.

Requirements:

Generate cryptographically secure random keys

Show the full key only once

Store only a secure representation/hash where possible

Support revocation

Support rotation

Support optional expiration

Support scopes

Never expose keys in frontend source code

Never commit keys to GitHub

Never log complete API keys

Example scope:

sms:send


Future scopes can be added without redesigning the system.

14. External Application Integration

The external application should only need:

GATEKEEPER_BASE_URL
GATEKEEPER_API_KEY


Then it can make:

POST https://gateway.example.com/api/v1/sms/send
Authorization: Bearer <API_KEY>
Content-Type: application/json


with:

{
  "to": "+91XXXXXXXXXX",
  "message": "Your verification code is 482731"
}


The Gatekeeper handles everything else.

The external application must never need to know:

Android implementation

Device credentials

SIM credentials

Pairing credentials

Internal queue implementation

15. Device Selection

Support a default device.

Example:

API Key
   ↓
Default Gateway Device
   ↓
Android Phone
   ↓
SIM


If multiple devices are registered, allow an API key to be associated with a specific device.

Support:

Primary Device
Backup Device


If a primary device is offline, the system may optionally route the job to a configured backup device.

Keep this optional and disabled by default.

16. Rate Limiting

Because this system controls a real SIM and can generate real SMS charges/limits, implement strict rate limiting.

Include:

Per API-key rate limit

Per account rate limit

Per device rate limit

Daily SMS limit

Burst protection

Recipient validation

Abuse detection

Example configuration:

Requests per minute
SMS per hour
SMS per day


Make limits configurable from the dashboard.

17. Emergency Controls

Dashboard must have:

PAUSE ALL SMS


and:

DISABLE DEVICE


If a device is disabled, it must immediately stop accepting new SMS jobs.

Allow the user to re-enable it.

18. Database Design

Create proper database models/tables for at least:

users
gateway_devices
device_pairing_codes
device_credentials
api_keys
sms_jobs
sms_delivery_events
api_request_logs
device_heartbeats
rate_limits


Use foreign keys and indexes appropriately.

Never store sensitive credentials unnecessarily.

19. GitHub Integration

The entire project must be GitHub-ready.

Create:

README.md
.env.example
.gitignore
.github/workflows/


Never commit:

.env
API keys
service-role keys
Android signing keys
keystores
private certificates


Document all required GitHub Secrets.

20. GitHub CI

Create:

.github/workflows/ci.yml


It should run automatically on:

pull_request
push


Perform:

Checkout
↓
Node setup
↓
Install dependencies
↓
Type checking
↓
Lint
↓
Unit tests
↓
Build web application


The workflow must fail if the project cannot build.

21. GitHub Actions Android Build

Create:

.github/workflows/android-build.yml


It should build the Capacitor Android application automatically.

Pipeline:

Checkout repository
        ↓
Setup Node.js
        ↓
Install dependencies
        ↓
Build web application
        ↓
Capacitor sync
        ↓
Setup Java/JDK
        ↓
Setup Android SDK
        ↓
Accept required SDK licenses
        ↓
Run Gradle build
        ↓
Generate APK
        ↓
Upload APK as GitHub Actions Artifact


The workflow should support:

workflow_dispatch


so an APK can also be manually generated from GitHub Actions.

22. Android Build Variants

Create at least:

Debug APK
Release APK


For development:

./gradlew assembleDebug


For production:

./gradlew assembleRelease


Do not commit the release keystore.

Production signing must use GitHub Secrets.

Document the required signing configuration.

23. GitHub Release Workflow

Create:

.github/workflows/android-release.yml


When a version tag is pushed, for example:

v1.0.0


the workflow should:

Checkout
↓
Install dependencies
↓
Build web
↓
Capacitor sync
↓
Build signed Android APK
↓
Create GitHub Release
↓
Attach APK


Do not publish automatically to Google Play.

This application is intended to be distributed privately/sideloaded.

24. Version Management

Keep Android version information synchronized.

Example:

versionName = 1.0.0
versionCode = 1


Document how version numbers are updated.

A Git tag should correspond to the Android release version.

25. Capacitor Configuration

Configure the project correctly for Android.

Include:

capacitor.config.ts
android/


The Android project must be generated and maintained in a GitHub-compatible way.

Ensure that:

npm run build
npx cap sync android


works reliably in a clean environment.

26. Environment Variables

Create:

.env.example


Document variables such as:

DATABASE_URL
BACKEND_URL
JWT_SECRET
API_KEY_HASH_SECRET


Never hard-code production secrets.

For GitHub Actions use:

GitHub Secrets


For production backend use the appropriate server-side secret storage.

27. Health Monitoring

Create:

GET /api/v1/health


Return:

{
  "status": "ok"
}


Also create device health information:

Device
  ONLINE
  OFFLINE
  LAST_SEEN


The Android gateway should periodically report a lightweight heartbeat.

Keep the heartbeat battery-efficient.

28. Error Handling

Use clear API errors.

Examples:

401 INVALID_API_KEY
403 DEVICE_DISABLED
404 DEVICE_NOT_FOUND
409 DUPLICATE_REQUEST
422 INVALID_PHONE_NUMBER
429 RATE_LIMITED
503 DEVICE_OFFLINE


Return machine-readable JSON errors.

29. Reliability

The SMS system must be designed around the possibility that:

Internet disappears

Android app gets killed

Device restarts

Permission is revoked

SIM becomes unavailable

Device goes offline

Backend temporarily fails

Request is retried

Never assume that an SMS was sent merely because the API request succeeded.

Use:

queued
sending
sent
failed


as separate states.

30. UI/UX

Design should feel like a professional developer infrastructure product.

Style:

Clean

Modern

Mobile responsive

Simple dashboard

Clear status indicators

Developer-friendly API documentation

No unnecessary animations

Dark/light mode if practical

Main dashboard should immediately answer:

Is my gateway online?
Which phone is registered?
Can it send SMS?
How many SMS have been sent?
Are there failed jobs?


31. Important Security Boundary

The Android application must NOT trust arbitrary commands.

Every SMS job must ultimately originate from:

Authenticated backend
+
Valid API key
+
Valid registered device


Do not allow another random device to impersonate a registered gateway.

Use secure device authentication and server-side authorization.

32. Testing

Create tests for:

Backend

API key authentication

API key revocation

Phone validation

SMS job creation

Idempotency

Rate limiting

Device authorization

Device offline handling

Android

Permission handling

Pairing

Device registration

SMS sending bridge

Job acknowledgement

Retry handling

Network recovery

App restart recovery

CI/CD

Verify that:

npm install
npm run build
npx cap sync android
./gradlew assembleDebug


work in GitHub Actions.

33. Documentation

Create a comprehensive README covering:

What SMS Gatekeeper is

Architecture

Local development

Backend setup

Android setup

Capacitor setup

Device registration

API-key generation

API usage

GitHub Actions

APK generation

Release signing

GitHub Secrets

Troubleshooting

Android background limitations

SMS permission requirements

Also create:

docs/API.md
docs/ANDROID.md
docs/GITHUB-ACTIONS.md
docs/SECURITY.md


34. Critical Instruction to Lovable

Do NOT build a fake SMS simulator.

Do NOT make a web page that merely opens the user's SMS application.

The actual Android application must be architected so that, once the required Android permission is granted, it can use the native Android SMS capability through a Capacitor/native bridge.

If a feature cannot be implemented entirely inside the Lovable web environment, create the required project structure and native Android integration points so the resulting repository is ready to build through GitHub Actions.

Do not hide technical limitations.

35. Final Expected Flow

The finished system should support this exact experience:

Step 1

User creates a Gatekeeper account.

Step 2

User opens the Android Gateway APK.

Step 3

User pairs/registers the phone.

The server creates:

Gateway Device ID


and securely binds that Android installation to the account.

Step 4

User grants the required SMS permission.

Step 5

Device becomes:

ACTIVE


Step 6

User creates an API key.

Example:

Gateway URL:
https://gateway.example.com

API Key:
gk_live_xxxxxxxxxxxxx


Step 7

Any authorized backend can now call:

POST /api/v1/sms/send
Authorization: Bearer gk_live_xxxxxxxxxxxxx


with:

{
  "to": "+91XXXXXXXXXX",
  "message": "Your verification code is 482731"
}


Step 8

Gatekeeper creates an SMS job.

Step 9

Registered Android gateway receives the job.

Step 10

Android native SMS layer sends:

"Your verification code is 482731"


through the registered SIM.

Step 11

Android reports the result.

Step 12

Dashboard shows:

SMS
✓ SENT


Final Engineering Principle

Keep the system modular:

Web Dashboard
       +
Backend API
       +
Device Registration
       +
API Key Management
       +
SMS Queue
       +
Capacitor Android App
       +
Native Android SMS Layer
       +
GitHub CI/CD


The product must be a generic SMS Gatekeeper, not an integration hard-coded for any particular application.

The final repository must be capable of:

Lovable
   ↓
GitHub
   ↓
GitHub Actions
   ↓
Capacitor
   ↓
Android APK
   ↓
Registered Android Phone
   ↓
SIM
   ↓
SMS


Build the foundation properly

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/7f1d9a28-09f1-42a5-8203-e879dc55dbcd).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
