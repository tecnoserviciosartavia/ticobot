package com.ticocast.ticobot;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.os.Build;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.app.RemoteInput;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.Executors;

import org.json.JSONObject;

public class TicoBotMessagingService extends FirebaseMessagingService {
    public static final String CHANNEL_ID = "ticobot-chat-messages";
    public static final String REPLY_KEY = "ticobot_quick_reply";

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        Map<String, String> data = remoteMessage.getData();
        String phone = value(data, "phone", "");
        String title = value(data, "title", phone.isEmpty() ? "TicoBot" : phone);
        String body = value(data, "body", "Mensaje de WhatsApp");

        createChannel();
        String type = value(data, "type", "general");
        int notificationId = Math.abs((phone.isEmpty() ? type + body : phone).hashCode());

        Intent openIntent = new Intent(this, MainActivity.class)
            .setAction(Intent.ACTION_VIEW)
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (!phone.isEmpty()) {
            openIntent.putExtra("chat_phone", phone);
        }
        PendingIntent openPendingIntent = PendingIntent.getActivity(
            this,
            notificationId,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        RemoteInput remoteInput = new RemoteInput.Builder(REPLY_KEY)
            .setLabel("Responder mensaje")
            .build();
        Intent replyIntent = new Intent(this, QuickReplyReceiver.class)
            .putExtra("phone", phone)
            .putExtra("notification_id", notificationId);
        PendingIntent replyPendingIntent = PendingIntent.getBroadcast(
            this,
            notificationId,
            replyIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE
        );
        NotificationCompat.Builder notification = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(com.ticocast.ticobot.R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(openPendingIntent);

        if (!phone.isEmpty()) {
            NotificationCompat.Action replyAction = new NotificationCompat.Action.Builder(
                android.R.drawable.ic_menu_send,
                "Responder",
                replyPendingIntent
            ).addRemoteInput(remoteInput).setAllowGeneratedReplies(true).build();
            notification.addAction(replyAction);
        }

        try {
            NotificationManagerCompat.from(this).notify(notificationId, notification.build());
        } catch (SecurityException ignored) {
            // El usuario puede revocar el permiso desde Ajustes en cualquier momento.
        }
    }

    @Override
    public void onNewToken(@NonNull String token) {
        super.onNewToken(token);
        getSharedPreferences("ticobot_mobile", MODE_PRIVATE).edit().putString("pending_push_token", token).apply();
        String apiToken = getSharedPreferences("ticobot_mobile", MODE_PRIVATE).getString("api_token", null);
        if (apiToken == null || apiToken.trim().isEmpty()) return;

        Executors.newSingleThreadExecutor().execute(() -> {
            HttpURLConnection connection = null;
            try {
                connection = (HttpURLConnection) new URL(BuildConfig.API_BASE_URL + "push/device-token").openConnection();
                connection.setRequestMethod("POST");
                connection.setConnectTimeout(10_000);
                connection.setReadTimeout(10_000);
                connection.setDoOutput(true);
                connection.setRequestProperty("Authorization", "Bearer " + apiToken);
                connection.setRequestProperty("Content-Type", "application/json");
                connection.setRequestProperty("Accept", "application/json");
                byte[] payload = new JSONObject().put("token", token).put("platform", "android").toString().getBytes(StandardCharsets.UTF_8);
                try (OutputStream output = connection.getOutputStream()) { output.write(payload); }
                if (connection.getResponseCode() >= 200 && connection.getResponseCode() < 300) {
                    getSharedPreferences("ticobot_mobile", MODE_PRIVATE).edit().remove("pending_push_token").apply();
                }
            } catch (Exception ignored) {
                // El token queda pendiente y se vuelve a registrar al abrir la app.
            } finally {
                if (connection != null) connection.disconnect();
            }
        });
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Avisos de TicoBot",
                NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("Chats transferidos y avisos de pagos de plataformas");
            getSystemService(NotificationManager.class).createNotificationChannel(channel);
        }
    }

    private static String value(Map<String, String> data, String key, String fallback) {
        String value = data.get(key);
        return value == null || value.trim().isEmpty() ? fallback : value;
    }
}
