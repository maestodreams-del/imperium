package pl.imperium.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.OutputStream;

public class MainActivity extends Activity {

    private static final int FILE_CHOOSER_REQ = 9131;
    private static final int NOTIFICATION_REQ = 9132;
    private static final String CHANNEL_ID = "imperium_updates";

    private WebView web;
    private ValueCallback<Uri[]> fileCallback;

    @SuppressLint({"SetJavaScriptEnabled", "JavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        createNotificationChannel();

        web = new WebView(this);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setMediaPlaybackRequiresUserGesture(false);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN) {
            s.setAllowFileAccessFromFileURLs(true);
            s.setAllowUniversalAccessFromFileURLs(true);
        }

        web.setWebViewClient(new WebViewClient());

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(
                    WebView webView,
                    ValueCallback<Uri[]> callback,
                    FileChooserParams params
            ) {
                if (fileCallback != null) {
                    fileCallback.onReceiveValue(null);
                }

                fileCallback = callback;

                Intent pick = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                pick.addCategory(Intent.CATEGORY_OPENABLE);
                pick.setType("*/*");
                pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);

                String[] mime = new String[]{
                        "image/*",
                        "video/*",
                        "application/pdf",
                        "text/plain",
                        "application/msword",
                        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                        "application/vnd.ms-excel",
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        "application/zip"
                };

                pick.putExtra(Intent.EXTRA_MIME_TYPES, mime);

                startActivityForResult(
                        Intent.createChooser(
                                pick,
                                "Dodaj zdjęcia, wideo lub dokumenty"
                        ),
                        FILE_CHOOSER_REQ
                );

                return true;
            }
        });

        web.addJavascriptInterface(
                new AndroidBridge(),
                "AndroidBridge"
        );

        web.loadUrl("file:///android_asset/index.html");

        setContentView(web);
    }

    @Override
    protected void onActivityResult(
            int requestCode,
            int resultCode,
            Intent data
    ) {
        super.onActivityResult(
                requestCode,
                resultCode,
                data
        );

        if (requestCode != FILE_CHOOSER_REQ || fileCallback == null) {
            return;
        }

        Uri[] result = null;

        if (resultCode == Activity.RESULT_OK && data != null) {

            if (data.getClipData() != null) {

                int count =
                        data.getClipData().getItemCount();

                result = new Uri[count];

                for (int i = 0; i < count; i++) {
                    result[i] =
                            data.getClipData()
                                    .getItemAt(i)
                                    .getUri();
                }

            } else if (data.getData() != null) {

                result = new Uri[]{
                        data.getData()
                };
            }
        }

        fileCallback.onReceiveValue(result);
        fileCallback = null;
    }

    @Override
    public void onBackPressed() {

        if (web != null && web.canGoBack()) {
            web.goBack();
        } else {
            super.onBackPressed();
        }
    }

    private void createNotificationChannel() {

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {

            NotificationChannel channel =
                    new NotificationChannel(
                            CHANNEL_ID,
                            "IMPERIUM",
                            NotificationManager.IMPORTANCE_DEFAULT
                    );

            channel.setDescription(
                    "Zmiany zadań i raportów"
            );
Uri soundUri = Uri.parse(
    "android.resource://" + getPackageName() + "/" + R.raw.imperium_notification
);

android.media.AudioAttributes audioAttributes =
    new android.media.AudioAttributes.Builder()
        .setUsage(android.media.AudioAttributes.USAGE_NOTIFICATION)
        .setContentType(android.media.AudioAttributes.CONTENT_TYPE_SONIFICATION)
        .build();

channel.setSound(soundUri, audioAttributes);
channel.enableVibration(true);
            getSystemService(
                    NotificationManager.class
            ).createNotificationChannel(channel);
        }
    }

    private void showNotification(
            String title,
            String body
    ) {

        if (
                Build.VERSION.SDK_INT >= 33 &&
                checkSelfPermission(
                        Manifest.permission.POST_NOTIFICATIONS
                ) != PackageManager.PERMISSION_GRANTED
        ) {
            return;
        }

        Intent intent =
                new Intent(
                        this,
                        MainActivity.class
                );

        PendingIntent pi =
                PendingIntent.getActivity(
                        this,
                        0,
                        intent,
                        PendingIntent.FLAG_UPDATE_CURRENT |
                        PendingIntent.FLAG_IMMUTABLE
                );

        Notification.Builder builder;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {

            builder =
                    new Notification.Builder(
                            this,
                            CHANNEL_ID
                    );

        } else {

            builder =
                    new Notification.Builder(this);
        }

        builder
                .setContentTitle(title)
                .setContentText(body)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentIntent(pi)
                .setAutoCancel(true);

        ((NotificationManager)
                getSystemService(
                        NOTIFICATION_SERVICE
                ))
                .notify(
                        (int) (
                                System.currentTimeMillis()
                                % Integer.MAX_VALUE
                        ),
                        builder.build()
                );
    }

    private void saveDownloadedFile(
            String fileName,
            String mimeType,
            String base64Data
    ) {

        try {

            byte[] data =
                    Base64.decode(
                            base64Data,
                            Base64.DEFAULT
                    );

            String safeName =
                    fileName == null ||
                    fileName.trim().isEmpty()
                            ? "imperium_file"
                            : fileName;

            String safeMime =
                    mimeType == null ||
                    mimeType.trim().isEmpty()
                            ? "application/octet-stream"
                            : mimeType;

            ContentValues values =
                    new ContentValues();

            values.put(
                    MediaStore.Downloads.DISPLAY_NAME,
                    safeName
            );

            values.put(
                    MediaStore.Downloads.MIME_TYPE,
                    safeMime
            );

            if (
                    Build.VERSION.SDK_INT >=
                    Build.VERSION_CODES.Q
            ) {

                values.put(
                        MediaStore.Downloads.RELATIVE_PATH,
                        Environment.DIRECTORY_DOWNLOADS
                                + "/IMPERIUM"
                );

                values.put(
                        MediaStore.Downloads.IS_PENDING,
                        1
                );
            }

            Uri collection;

            if (
                    Build.VERSION.SDK_INT >=
                    Build.VERSION_CODES.Q
            ) {

                collection =
                        MediaStore.Downloads
                                .EXTERNAL_CONTENT_URI;

            } else {

                throw new Exception(
                        "Ta wersja Androida nie obsługuje tego sposobu zapisu."
                );
            }

            Uri uri =
                    getContentResolver()
                            .insert(
                                    collection,
                                    values
                            );

            if (uri == null) {
                throw new Exception(
                        "Nie udało się utworzyć pliku."
                );
            }

            OutputStream output =
                    getContentResolver()
                            .openOutputStream(uri);

            if (output == null) {
                throw new Exception(
                        "Nie udało się otworzyć pliku."
                );
            }

            output.write(data);
            output.flush();
            output.close();

            if (
                    Build.VERSION.SDK_INT >=
                    Build.VERSION_CODES.Q
            ) {

                ContentValues ready =
                        new ContentValues();

                ready.put(
                        MediaStore.Downloads.IS_PENDING,
                        0
                );

                getContentResolver()
                        .update(
                                uri,
                                ready,
                                null,
                                null
                        );
            }

            runOnUiThread(() ->
                    Toast.makeText(
                            MainActivity.this,
                            "Pobrano: " + safeName
                                    + "\nDownloads/IMPERIUM",
                            Toast.LENGTH_LONG
                    ).show()
            );

        } catch (Exception e) {

            runOnUiThread(() ->
                    Toast.makeText(
                            MainActivity.this,
                            "Błąd pobierania: "
                                    + e.getMessage(),
                            Toast.LENGTH_LONG
                    ).show()
            );
        }
    }

    public class AndroidBridge {

        @JavascriptInterface
        public void notify(
                String title,
                String body
        ) {

            runOnUiThread(() ->
                    showNotification(
                            title,
                            body
                    )
            );
        }

        @JavascriptInterface
        public void requestNotificationPermission() {

            runOnUiThread(() -> {

                if (
                        Build.VERSION.SDK_INT >= 33 &&
                        checkSelfPermission(
                                Manifest.permission.POST_NOTIFICATIONS
                        ) != PackageManager.PERMISSION_GRANTED
                ) {

                    requestPermissions(
                            new String[]{
                                    Manifest.permission.POST_NOTIFICATIONS
                            },
                            NOTIFICATION_REQ
                    );

                } else {

                    Toast.makeText(
                            MainActivity.this,
                            "Powiadomienia są dostępne",
                            Toast.LENGTH_SHORT
                    ).show();
                }
            });
        }

        @JavascriptInterface
        public void saveFile(
                String fileName,
                String mimeType,
                String base64Data
        ) {

            new Thread(() ->
                    saveDownloadedFile(
                            fileName,
                            mimeType,
                            base64Data
                    )
            ).start();
        }
    }
}
