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
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
public class MainActivity extends Activity {

    private static final int FILE_CHOOSER_REQ = 9131;
    private static final int NOTIFICATION_REQ = 9132;
    private static final String CHANNEL_ID = "imperium_updates_v2";

    private WebView web;
    private ValueCallback<Uri[]> fileCallback;
private File updatesDir;
private File activeWebDir;
private File stagingWebDir;
private static final String UPDATE_PREFS = "imperium_update_prefs";
private static final String KEY_WEB_VERSION = "web_version";

private int getInstalledWebVersion() {
    return getSharedPreferences(
            UPDATE_PREFS,
            MODE_PRIVATE
    ).getInt(KEY_WEB_VERSION, 0);
}

private void saveInstalledWebVersion(int version) {
    getSharedPreferences(
            UPDATE_PREFS,
            MODE_PRIVATE
    )
    .edit()
    .putInt(KEY_WEB_VERSION, version)
    .apply();
}
private void prepareUpdateStorage() {
    updatesDir = new File(getFilesDir(), "imperium_updates");
    activeWebDir = new File(updatesDir, "active");
stagingWebDir = new File(updatesDir, "staging");
    if (!updatesDir.exists()) {
        updatesDir.mkdirs();
    }
}
private void unzipUpdate(File zipFile, File destination) throws Exception {

    if (destination.exists()) {
        deleteDirectory(destination);
    }

    if (!destination.mkdirs() && !destination.exists()) {
        throw new Exception("Nie udało się utworzyć katalogu aktualizacji.");
    }

    String destinationPath =
            destination.getCanonicalPath() + File.separator;

    try (
            InputStream input = new java.io.FileInputStream(zipFile);
            ZipInputStream zip = new ZipInputStream(input)
    ) {
        ZipEntry entry;

        while ((entry = zip.getNextEntry()) != null) {

            File target = new File(destination, entry.getName());

            // Ochrona przed ZIP Path Traversal
            String targetPath = target.getCanonicalPath();

            if (!targetPath.startsWith(destinationPath)) {
                throw new Exception("Nieprawidłowy plik aktualizacji.");
            }

            if (entry.isDirectory()) {

                if (!target.exists() && !target.mkdirs()) {
                    throw new Exception("Nie udało się utworzyć katalogu.");
                }

            } else {

                File parent = target.getParentFile();

                if (parent != null &&
                        !parent.exists() &&
                        !parent.mkdirs()) {
                    throw new Exception("Nie udało się utworzyć katalogu.");
                }

                try (FileOutputStream output =
                             new FileOutputStream(target)) {

                    byte[] buffer = new byte[8192];
                    int count;

                    while ((count = zip.read(buffer)) != -1) {
                        output.write(buffer, 0, count);
                    }
                }
            }

            zip.closeEntry();
        }
    }

    // Пакет считаем рабочим только при наличии index.html
    File index = new File(destination, "index.html");

    if (!index.exists()) {
        deleteDirectory(destination);
        throw new Exception(
                "Aktualizacja nie zawiera index.html."
        );
    }
}

private void deleteDirectory(File file) {

    if (file == null || !file.exists()) {
        return;
    }

    if (file.isDirectory()) {
        File[] children = file.listFiles();

        if (children != null) {
            for (File child : children) {
                deleteDirectory(child);
            }
        }
    }

    file.delete();
}
   private void downloadAndInstallUpdate(
        int version,
        String versionName,
        String packageUrl,
        String accessToken,
        String apiKey
) {

    new Thread(() -> {

        File zipFile =
                new File(updatesDir, "update.zip");

        try {

            // Чистим старый staging
            if (stagingWebDir.exists()) {
                deleteDirectory(stagingWebDir);
            }

            if (zipFile.exists()) {
                zipFile.delete();
            }

            URL url = new URL(packageUrl);

            HttpURLConnection connection =
                    (HttpURLConnection) url.openConnection();

            connection.setRequestMethod("GET");
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(30000);

            connection.setRequestProperty(
                    "Authorization",
                    "Bearer " + accessToken
            );

            connection.setRequestProperty(
        "apikey",
        apiKey
);

            connection.connect();

            int responseCode =
                    connection.getResponseCode();

            if (responseCode < 200 ||
                    responseCode >= 300) {

                throw new Exception(
                        "HTTP " + responseCode
                );
            }

            try (
                    InputStream input =
                            connection.getInputStream();

                    FileOutputStream output =
                            new FileOutputStream(zipFile)
            ) {

                byte[] buffer = new byte[8192];
                int count;

                while ((count = input.read(buffer)) != -1) {
                    output.write(buffer, 0, count);
                }
            }

            connection.disconnect();

            // ZIP → staging
            unzipUpdate(
                    zipFile,
                    stagingWebDir
            );

            // staging → active
            activateStagingUpdate();

            // Zapamiętujemy wersję dopiero po udanej instalacji
            saveInstalledWebVersion(version);

            zipFile.delete();

            runOnUiThread(() -> {

                Toast.makeText(
                        MainActivity.this,
                        "IMPERIUM "
                                + versionName
                                + " — aktualizacja zakończona",
                        Toast.LENGTH_SHORT
                ).show();

                loadImperium();
            });

        } catch (Exception e) {

            if (zipFile.exists()) {
                zipFile.delete();
            }

            if (stagingWebDir != null &&
                    stagingWebDir.exists()) {
                deleteDirectory(stagingWebDir);
            }

            runOnUiThread(() ->
                    Toast.makeText(
                            MainActivity.this,
                            "Błąd aktualizacji: "
                                    + e.getMessage(),
                            Toast.LENGTH_LONG
                    ).show()
            );
        }

    }).start();
}
    private void activateStagingUpdate() throws Exception {

    File stagingIndex =
            new File(stagingWebDir, "index.html");

    if (!stagingIndex.exists()) {
        throw new Exception(
                "Brak prawidłowej aktualizacji."
        );
    }

    File backupDir =
            new File(updatesDir, "backup");

    if (backupDir.exists()) {
        deleteDirectory(backupDir);
    }

    if (activeWebDir.exists()) {
        if (!activeWebDir.renameTo(backupDir)) {
            throw new Exception(
                    "Nie udało się zabezpieczyć poprzedniej wersji."
            );
        }
    }

    if (!stagingWebDir.renameTo(activeWebDir)) {

        if (backupDir.exists()) {
            backupDir.renameTo(activeWebDir);
        }

        throw new Exception(
                "Nie udało się aktywować aktualizacji."
        );
    }
}
private void loadImperium() {
    File updatedIndex = new File(activeWebDir, "index.html");

    if (updatedIndex.exists()) {
        web.loadUrl(
                "file://" + updatedIndex.getAbsolutePath()
        );
    } else {
        web.loadUrl(
                "file:///android_asset/index.html"
        );
    }
}
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

       prepareUpdateStorage();
loadImperium();

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
public void checkWebUpdate(
        int version,
        String versionName,
        String packageUrl,
        String accessToken
    String apiKey
) {

    if (version <= getInstalledWebVersion()) {
        return;
    }
    downloadAndInstallUpdate(
        version,
        versionName,
        packageUrl,
        accessToken,
        apiKey
);

}
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
