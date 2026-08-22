/**
 * Bridge to the native Android SMS layer.
 *
 * On the web (dashboard, desktop browser) the plugin is unavailable, so every
 * call resolves to an explicit "unavailable" result instead of throwing.
 */
import { Capacitor, registerPlugin } from "@capacitor/core";

export type SmsPermissionState = "granted" | "denied" | "permanently_denied" | "unknown";

export interface DeviceInfoResult {
  installId: string;
  androidVersion: string;
  appVersion: string;
  model: string;
  batteryLevel: number;
  charging: boolean;
  simReady: boolean;
  network: string;
}

export interface SmsGatewayPlugin {
  checkPermissions(): Promise<{ sms: SmsPermissionState; notifications?: SmsPermissionState }>;
  requestPermissions(): Promise<{ sms: SmsPermissionState; notifications?: SmsPermissionState }>;
  getDeviceInfo(): Promise<DeviceInfoResult>;
  sendSms(options: { messageId: string; recipient: string; body: string }): Promise<{
    messageId: string;
    status: "sent" | "failed";
    errorCode?: string;
    errorMessage?: string;
  }>;
  startGateway(options: { baseUrl: string; deviceId: string; deviceToken: string }): Promise<{ running: boolean }>;
  stopGateway(): Promise<{ running: boolean }>;
  getGatewayState(): Promise<{ running: boolean; lastSyncAt?: string }>;
  openBatterySettings(): Promise<void>;
}

const SmsGateway = registerPlugin<SmsGatewayPlugin>("SmsGateway");

export const isNativeGateway = () => Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("SmsGateway");

export { SmsGateway };
