import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Android Gateway app shell.
 *
 * The app loads the hosted Gatekeeper gateway UI (/gateway) so the pairing
 * screen and the web dashboard never drift apart. All SMS work happens in the
 * native SmsGateway plugin + foreground service, not in the WebView.
 *
 * Set GATEWAY_SERVER_URL in CI to point the shell at your deployment.
 */
const serverUrl = process.env["GATEWAY_SERVER_URL"];

const config: CapacitorConfig = {
  appId: "app.gatekeeper.smsgateway",
  appName: "SMS Gatekeeper Gateway",
  webDir: "dist/client",
  android: {
    allowMixedContent: false,
  },
  ...(serverUrl
    ? { server: { url: `${serverUrl.replace(/\/$/, "")}/gateway`, cleartext: false, androidScheme: "https" } }
    : {}),
};

export default config;
