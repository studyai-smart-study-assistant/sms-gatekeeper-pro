package app.gatekeeper.smsgateway;

import android.Manifest;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.BatteryManager;
import android.os.Build;
import android.provider.Settings;
import android.telephony.SmsManager;
import android.telephony.TelephonyManager;

import androidx.activity.result.ActivityResult;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.ArrayList;
import java.util.UUID;

/**
 * Native SMS layer. The WebView never touches SmsManager: it asks this plugin to
 * send a specific job, and the plugin reports the real telephony result back.
 */
@CapacitorPlugin(
    name = "SmsGateway",
    permissions = {
        @Permission(alias = "sms", strings = { Manifest.permission.SEND_SMS }),
        @Permission(alias = "phone", strings = { Manifest.permission.READ_PHONE_STATE })
    }
)
public class SmsGatewayPlugin extends Plugin {

    public static final String PREFS = "gatekeeper";
    private static final String SENT_ACTION = "app.gatekeeper.smsgateway.SMS_SENT";

    private String permissionState() {
        boolean granted = ContextCompat.checkSelfPermission(getContext(), Manifest.permission.SEND_SMS)
            == PackageManager.PERMISSION_GRANTED;
        if (granted) return "granted";
        if (getActivity() != null && !getActivity().shouldShowRequestPermissionRationale(Manifest.permission.SEND_SMS)) {
            SharedPreferences prefs = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            if (prefs.getBoolean("smsAsked", false)) return "permanently_denied";
        }
        return "denied";
    }

    @PluginMethod
    public void checkPermissions(PluginCall call) {
        JSObject result = new JSObject();
        result.put("sms", permissionState());
        call.resolve(result);
    }

    @PluginMethod
    public void requestPermissions(PluginCall call) {
        getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean("smsAsked", true).apply();
        requestPermissionForAlias("sms", call, "permissionCallback");
    }

    @PermissionCallback
    private void permissionCallback(PluginCall call) {
        JSObject result = new JSObject();
        result.put("sms", permissionState());
        call.resolve(result);
    }

    @PluginMethod
    public void getDeviceInfo(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String installId = prefs.getString("installId", null);
        if (installId == null) {
            installId = "inst_" + UUID.randomUUID().toString().replace("-", "");
            prefs.edit().putString("installId", installId).apply();
        }

        BatteryManager battery = (BatteryManager) getContext().getSystemService(Context.BATTERY_SERVICE);
        int level = battery != null ? battery.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) : -1;
        boolean charging = battery != null && battery.isCharging();

        TelephonyManager telephony = (TelephonyManager) getContext().getSystemService(Context.TELEPHONY_SERVICE);
        boolean simReady = telephony != null && telephony.getSimState() == TelephonyManager.SIM_STATE_READY;

        String appVersion = "unknown";
        try {
            appVersion = getContext().getPackageManager()
                .getPackageInfo(getContext().getPackageName(), 0).versionName;
        } catch (PackageManager.NameNotFoundException ignored) {
        }

        JSObject result = new JSObject();
        result.put("installId", installId);
        result.put("androidVersion", Build.VERSION.RELEASE);
        result.put("appVersion", appVersion);
        result.put("model", Build.MANUFACTURER + " " + Build.MODEL);
        result.put("batteryLevel", level);
        result.put("charging", charging);
        result.put("simReady", simReady);
        result.put("network", networkType());
        call.resolve(result);
    }

    private String networkType() {
        ConnectivityManager cm = (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) return "unknown";
        NetworkCapabilities caps = cm.getNetworkCapabilities(cm.getActiveNetwork());
        if (caps == null) return "offline";
        if (caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) return "wifi";
        if (caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)) return "cellular";
        return "other";
    }

    @PluginMethod
    public void sendSms(final PluginCall call) {
        final String messageId = call.getString("messageId");
        final String recipient = call.getString("recipient");
        final String body = call.getString("body");
        if (messageId == null || recipient == null || body == null) {
            call.reject("messageId, recipient and body are required");
            return;
        }
        if (!"granted".equals(permissionState())) {
            call.resolve(failure(messageId, "PERMISSION_DENIED", "SEND_SMS permission is not granted."));
            return;
        }

        SmsResult result = SmsSender.sendBlocking(getContext(), recipient, body);
        JSObject payload = new JSObject();
        payload.put("messageId", messageId);
        payload.put("status", result.ok ? "sent" : "failed");
        if (!result.ok) {
            payload.put("errorCode", result.code);
            payload.put("errorMessage", result.message);
        }
        call.resolve(payload);
    }

    private JSObject failure(String messageId, String code, String message) {
        JSObject payload = new JSObject();
        payload.put("messageId", messageId);
        payload.put("status", "failed");
        payload.put("errorCode", code);
        payload.put("errorMessage", message);
        return payload;
    }

    @PluginMethod
    public void startGateway(PluginCall call) {
        String baseUrl = call.getString("baseUrl");
        String deviceId = call.getString("deviceId");
        String deviceToken = call.getString("deviceToken");
        if (baseUrl == null || deviceId == null || deviceToken == null) {
            call.reject("baseUrl, deviceId and deviceToken are required");
            return;
        }
        getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString("baseUrl", baseUrl)
            .putString("deviceId", deviceId)
            .putString("deviceToken", deviceToken)
            .putBoolean("enabled", true)
            .apply();

        Intent intent = new Intent(getContext(), GatewayService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getContext().startForegroundService(intent);
        } else {
            getContext().startService(intent);
        }
        JSObject result = new JSObject();
        result.put("running", true);
        call.resolve(result);
    }

    @PluginMethod
    public void stopGateway(PluginCall call) {
        getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean("enabled", false).apply();
        getContext().stopService(new Intent(getContext(), GatewayService.class));
        JSObject result = new JSObject();
        result.put("running", false);
        call.resolve(result);
    }

    @PluginMethod
    public void getGatewayState(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        JSObject result = new JSObject();
        result.put("running", prefs.getBoolean("enabled", false) && GatewayService.isRunning());
        String lastSync = prefs.getString("lastSyncAt", null);
        if (lastSync != null) result.put("lastSyncAt", lastSync);
        call.resolve(result);
    }

    @PluginMethod
    public void openBatterySettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
        intent.setData(Uri.parse("package:" + getContext().getPackageName()));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }
}
