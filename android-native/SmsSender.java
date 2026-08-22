package app.gatekeeper.smsgateway;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import android.telephony.SmsManager;

import java.util.ArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/** Result of one telephony send attempt. */
class SmsResult {
    final boolean ok;
    final String code;
    final String message;

    SmsResult(boolean ok, String code, String message) {
        this.ok = ok;
        this.code = code;
        this.message = message;
    }
}

/**
 * Sends one SMS and blocks until Android reports the SENT result, so the server
 * is only told "sent" when the radio actually accepted the message.
 */
final class SmsSender {

    private static final String SENT_ACTION = "app.gatekeeper.smsgateway.SMS_SENT";
    private static final long TIMEOUT_SECONDS = 60;

    private SmsSender() {
    }

    static SmsResult sendBlocking(Context context, String recipient, String body) {
        SmsManager manager = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
            ? context.getSystemService(SmsManager.class)
            : SmsManager.getDefault();
        if (manager == null) return new SmsResult(false, "NO_SMS_MANAGER", "SmsManager unavailable.");

        final CountDownLatch latch = new CountDownLatch(1);
        final int[] resultCode = { Activity.RESULT_CANCELED };
        final String action = SENT_ACTION + "." + System.nanoTime();

        BroadcastReceiver receiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context ctx, Intent intent) {
                resultCode[0] = getResultCode();
                latch.countDown();
            }
        };

        int flags = PendingIntent.FLAG_UPDATE_CURRENT
            | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.registerReceiver(receiver, new IntentFilter(action), Context.RECEIVER_NOT_EXPORTED);
        } else {
            context.registerReceiver(receiver, new IntentFilter(action));
        }

        try {
            PendingIntent sentIntent = PendingIntent.getBroadcast(context, 0, new Intent(action), flags);
            ArrayList<String> parts = manager.divideMessage(body);
            if (parts.size() > 1) {
                ArrayList<PendingIntent> sentIntents = new ArrayList<>();
                for (int i = 0; i < parts.size(); i++) {
                    // Only the last part signals completion.
                    sentIntents.add(i == parts.size() - 1 ? sentIntent : null);
                }
                manager.sendMultipartTextMessage(recipient, null, parts, sentIntents, null);
            } else {
                manager.sendTextMessage(recipient, null, body, sentIntent, null);
            }

            if (!latch.await(TIMEOUT_SECONDS, TimeUnit.SECONDS)) {
                return new SmsResult(false, "SEND_TIMEOUT", "No SENT result within " + TIMEOUT_SECONDS + "s.");
            }
        } catch (SecurityException error) {
            return new SmsResult(false, "PERMISSION_DENIED", "SEND_SMS permission was revoked.");
        } catch (Exception error) {
            return new SmsResult(false, "SEND_EXCEPTION", String.valueOf(error.getMessage()));
        } finally {
            try {
                context.unregisterReceiver(receiver);
            } catch (IllegalArgumentException ignored) {
            }
        }

        switch (resultCode[0]) {
            case Activity.RESULT_OK:
                return new SmsResult(true, null, null);
            case SmsManager.RESULT_ERROR_NO_SERVICE:
                return new SmsResult(false, "NO_SERVICE", "No cellular service.");
            case SmsManager.RESULT_ERROR_RADIO_OFF:
                return new SmsResult(false, "RADIO_OFF", "Radio is off (airplane mode).");
            case SmsManager.RESULT_ERROR_NULL_PDU:
                return new SmsResult(false, "NULL_PDU", "Malformed message.");
            default:
                return new SmsResult(false, "GENERIC_FAILURE", "Telephony reported code " + resultCode[0] + ".");
        }
    }
}
