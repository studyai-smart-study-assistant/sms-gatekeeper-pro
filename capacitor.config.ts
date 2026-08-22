import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Android Gateway app shell.
 *
 * The shell ships a self-contained offline UI (capacitor-web/) so the app never
 * shows a blank screen when the network or the deployment is unreachable. The
 * UI talks to the Gatekeeper HTTP API and to the native SmsGateway plugin.
 *
 * The default server URL can be overridden inside the app (Server panel).
 */
const config: CapacitorConfig = {
  appId: "app.gatekeeper.smsgateway",
  appName: "SMS Gatekeeper Gateway",
  webDir: "capacitor-web",
  android: {
    allowMixedContent: false,
  },
};

export default config;
