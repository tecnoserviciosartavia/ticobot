package com.ticocast.ticobot;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;

import androidx.core.app.NotificationCompat;
import androidx.core.app.RemoteInput;

import com.google.firebase.messaging.FirebaseMessaging;

import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.Executors;

public class QuickReplyReceiver extends BroadcastReceiver {
    private static final String ENDPOINT = "https://ticocast.com/api/push/quick-reply";

    @Override
    public void onReceive(Context context, Intent intent) {
        Bundle input = RemoteInput.getResultsFromIntent(intent);
        if (input == null) return;

        CharSequence rawMessage = input.getCharSequence(TicoBotMessagingService.REPLY_KEY);
        String message = rawMessage == null ? "" : rawMessage.toString().trim();
        String phone = intent.getStringExtra("phone");
        int notificationId = intent.getIntExtra("notification_id", 0);
        if (message.isEmpty() || phone == null || phone.isEmpty()) return;

        PendingResult pendingResult = goAsync();
        FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
            if (!task.isSuccessful() || task.getResult() == null) {
                updateNotification(context, notificationId, "No se pudo autenticar el dispositivo.", true);
                pendingResult.finish();
                return;
            }

            String token = task.getResult();
            updateNotification(context, notificationId, "Enviando respuesta…", false);
            Executors.newSingleThreadExecutor().execute(() -> {
                try {
                    JSONObject payload = new JSONObject();
                    payload.put("device_token", token);
                    payload.put("phone", phone);
                    payload.put("message", message);

                    HttpURLConnection connection = (HttpURLConnection) new URL(ENDPOINT).openConnection();
                    connection.setRequestMethod("POST");
                    connection.setConnectTimeout(10000);
                    connection.setReadTimeout(10000);
                    connection.setDoOutput(true);
                    connection.setRequestProperty("Content-Type", "application/json");
                    connection.setRequestProperty("Accept", "application/json");
                    try (OutputStream output = connection.getOutputStream()) {
                        output.write(payload.toString().getBytes(StandardCharsets.UTF_8));
                    }

                    int status = connection.getResponseCode();
                    updateNotification(
                        context,
                        notificationId,
                        status >= 200 && status < 300 ? "Respuesta enviada: " + message : "No se pudo enviar la respuesta.",
                        status < 200 || status >= 300
                    );
                    connection.disconnect();
                } catch (Exception error) {
                    updateNotification(context, notificationId, "Error de conexión al responder.", true);
                } finally {
                    pendingResult.finish();
                }
            });
        });
    }

    private static void updateNotification(Context context, int id, String text, boolean error) {
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, TicoBotMessagingService.CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(error ? "TicoBOT" : "Respuesta rápida")
            .setContentText(text)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(text))
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH);
        try {
            context.getSystemService(NotificationManager.class).notify(id, builder.build());
        } catch (SecurityException ignored) {
        }
    }
}
