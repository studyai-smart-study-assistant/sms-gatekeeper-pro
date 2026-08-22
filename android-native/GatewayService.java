package app.gatekeeper.smsgateway;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;

import androidx.core.content.ContextCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * Foreground service that keeps the gateway alive: heartbeat, claim jobs, send
 * them through the native SMS layer, acknowledge the real result.
 */
public class GatewayService extends Service {

    private static final String TAG = "GatewayService";
    private static final String CHANNEL_ID = "gatekeeper_gateway";
    private static boolean running = false;

    private ScheduledExecutorService scheduler;

    public static boolean isRunning() {
        return running;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        createChannel();
        startForeground(1, buildNotification("Gateway active", "Waiting for SMS jobs"));
        running = true;
        scheduler = Executors.newSingleThreadScheduledExecutor();
        scheduler.scheduleWithFixedDelay(this::tick, 0, 15, TimeUnit.SECONDS);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        running = false;
        if (scheduler != null) scheduler.shutdownNow();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID, "SMS Gateway", NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("Keeps the SMS gateway connected");
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) manager.createNotificationChannel(channel);
    }

    private Notification buildNotification(String title, String text) {
        Intent intent = new Intent(this, MainActivity.class);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT
            | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);
        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Notification.Builder(this, CHANNEL_ID)
            : new Notification.Builder(this);
        return builder
            .setContentTitle(title)
            .setContentText(text)
            .setSmallIcon(android.R.drawable.stat_notify_chat)
            .setOngoing(true)
            .setContentIntent(PendingIntent.getActivity(this, 0, intent, flags))
            .build();
    }

    private void updateNotification(String text) {
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) manager.notify(1, buildNotification("Gateway active", text));
    }

    private void tick() {
        SharedPreferences prefs = getSharedPreferences(SmsGatewayPlugin.PREFS, Context.MODE_PRIVATE);
        if (!prefs.getBoolean("enabled", false)) {
            stopSelf();
            return;
        }
        String baseUrl = prefs.getString("baseUrl", null);
        String token = prefs.getString("deviceToken", null);
        if (baseUrl == null || token == null) return;

        try {
            JSONObject heartbeat = new JSONObject();
            heartbeat.put("sms_permission", smsPermissionState());
            heartbeat.put("app_version", appVersion());
            heartbeat.put("android_version", Build.VERSION.RELEASE);
            post(baseUrl + "/api/public/v1/gateway/heartbeat", token, heartbeat);

            JSONObject claimBody = new JSONObject();
            claimBody.put("max", 5);
            JSONObject claimed = post(baseUrl + "/api/public/v1/gateway/jobs/claim", token, claimBody);
            JSONArray jobs = claimed != null ? claimed.optJSONArray("jobs") : null;
            int sent = 0;

            if (jobs != null) {
                for (int i = 0; i < jobs.length(); i++) {
                    JSONObject job = jobs.getJSONObject(i);
                    String messageId = job.getString("message_id");
                    SmsResult result = SmsSender.sendBlocking(this, job.getString("recipient"), job.getString("body"));

                    JSONObject ack = new JSONObject();
                    ack.put("message_id", messageId);
                    ack.put("status", result.ok ? "sent" : "failed");
                    if (!result.ok) {
                        ack.put("error_code", result.code);
                        ack.put("error_message", result.message);
                    }
                    post(baseUrl + "/api/public/v1/gateway/jobs/ack", token, ack);
                    if (result.ok) sent++;
                }
            }

            prefs.edit().putString("lastSyncAt", isoNow()).apply();
            updateNotification(sent > 0 ? "Sent " + sent + " SMS at " + isoNow() : "Connected · " + isoNow());
        } catch (Exception error) {
            Log.w(TAG, "Gateway tick failed: " + error.getMessage());
            updateNotification("Reconnecting…");
        }
    }

    private String appVersion() {
        try {
            return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
        } catch (Exception error) {
            return "unknown";
        }
    }

    private String isoNow() {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US);
        format.setTimeZone(TimeZone.getTimeZone("UTC"));
        return format.format(new Date());
    }

    private JSONObject post(String url, String token, JSONObject body) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setRequestMethod("POST");
        connection.setRequestProperty("Content-Type", "application/json");
        connection.setRequestProperty("Authorization", "Bearer " + token);
        connection.setConnectTimeout(15000);
        connection.setReadTimeout(30000);
        connection.setDoOutput(true);
        try (OutputStream stream = connection.getOutputStream()) {
            stream.write(body.toString().getBytes(StandardCharsets.UTF_8));
        }
        int status = connection.getResponseCode();
        java.io.InputStream input = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
        if (input == null) return null;
        java.io.ByteArrayOutputStream buffer = new java.io.ByteArrayOutputStream();
        byte[] chunk = new byte[4096];
        int read;
        while ((read = input.read(chunk)) != -1) buffer.write(chunk, 0, read);
        String payload = buffer.toString("UTF-8");
        connection.disconnect();
        if (status >= 400) {
            Log.w(TAG, "POST " + url + " -> " + status + " " + payload);
            return null;
        }
        return payload.isEmpty() ? null : new JSONObject(payload);
    }
}
