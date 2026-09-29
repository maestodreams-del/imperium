package pl.imperium.app;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

public class ImperiumPushService extends FirebaseMessagingService {
    private static final String CHANNEL = "imperium_background_push_v1";

    @Override public void onNewToken(String token) {
        getSharedPreferences("imperium_push", MODE_PRIVATE).edit().putString("token", token).apply();
    }

    @Override public void onMessageReceived(RemoteMessage message) {
        if (MainActivity.isForeground) return; // The open WebView already plays its own alert.
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) return;
        Map<String, String> data = message.getData();
        String title = data.getOrDefault("title", "IMPERIUM");
        String body = data.getOrDefault("body", "Nowe zdarzenie");
        NotificationManager manager = getSystemService(NotificationManager.class);
        NotificationChannel channel = new NotificationChannel(CHANNEL, "IMPERIUM — w tle",
                NotificationManager.IMPORTANCE_DEFAULT);
        channel.setSound(Uri.parse("android.resource://" + getPackageName() + "/raw/imperium_notification"),
                new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
        channel.enableVibration(true);
        manager.createNotificationChannel(channel);

        Intent open = new Intent(this, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent intent = PendingIntent.getActivity(this, 0, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification notification = new Notification.Builder(this, CHANNEL)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(title).setContentText(body).setContentIntent(intent)
                .setAutoCancel(true).build();
        int id = data.getOrDefault("event_id", "").hashCode();
        manager.notify(id == 0 ? (int) System.currentTimeMillis() : id, notification);
    }
}
