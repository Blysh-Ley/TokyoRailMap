package com.blysh.tokyorailmap;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.activity.result.ActivityResult;
import androidx.core.content.FileProvider;
import com.google.android.play.core.appupdate.AppUpdateInfo;
import com.google.android.play.core.appupdate.AppUpdateManager;
import com.google.android.play.core.appupdate.AppUpdateManagerFactory;
import com.google.android.play.core.appupdate.AppUpdateOptions;
import com.google.android.play.core.install.model.AppUpdateType;
import com.google.android.play.core.install.model.InstallStatus;
import com.google.android.play.core.install.model.UpdateAvailability;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.ActivityCallback;
import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

@CapacitorPlugin(name = "TokyoRailUpdate")
public class TokyoRailUpdatePlugin extends Plugin {
    private static final String GOOGLE_PLAY_INSTALLER = "com.android.vending";
    private static final String GITHUB_RELEASE_PATH_PREFIX = "/Blysh-Ley/TokyoRailMap/releases/download/";
    private static final long MAX_APK_SIZE_BYTES = 512L * 1024L * 1024L;
    private final ExecutorService downloadExecutor = Executors.newSingleThreadExecutor();
    private final AtomicBoolean downloadInProgress = new AtomicBoolean(false);
    private File pendingInstallFile;

    @PluginMethod
    public void getStoreInfo(PluginCall call) {
        String packageName = getContext().getPackageName();
        JSObject result = new JSObject();
        result.put("packageName", packageName);
        result.put("installerPackageName", getInstallerPackageName(packageName));

        try {
            PackageInfo packageInfo = getContext().getPackageManager().getPackageInfo(packageName, 0);
            result.put("versionName", packageInfo.versionName);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                result.put("versionCode", packageInfo.getLongVersionCode());
            } else {
                result.put("versionCode", packageInfo.versionCode);
            }
        } catch (PackageManager.NameNotFoundException ignored) {
            result.put("versionName", "");
            result.put("versionCode", 0);
        }

        call.resolve(result);
    }

    @PluginMethod
    public void checkStoreUpdate(PluginCall call) {
        String packageName = getContext().getPackageName();
        String installerPackageName = getInstallerPackageName(packageName);
        if (!GOOGLE_PLAY_INSTALLER.equals(installerPackageName)) {
            JSObject result = buildBaseStoreUpdateResult(packageName, installerPackageName);
            result.put("available", false);
            result.put("mechanism", "market_uri");
            result.put("reason", "non-google-play-installer");
            call.resolve(result);
            return;
        }

        AppUpdateManager appUpdateManager = AppUpdateManagerFactory.create(getContext());
        appUpdateManager.getAppUpdateInfo()
            .addOnSuccessListener(appUpdateInfo -> {
                JSObject result = buildBaseStoreUpdateResult(packageName, installerPackageName);
                boolean updateAvailable = appUpdateInfo.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE;
                boolean developerTriggeredInProgress = appUpdateInfo.updateAvailability() == UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS;
                boolean flexibleAllowed = appUpdateInfo.isUpdateTypeAllowed(AppUpdateType.FLEXIBLE);
                boolean immediateAllowed = appUpdateInfo.isUpdateTypeAllowed(AppUpdateType.IMMEDIATE);

                result.put("available", updateAvailable || developerTriggeredInProgress);
                result.put("mechanism", "google_play_in_app");
                result.put("updateAvailability", appUpdateInfo.updateAvailability());
                result.put("installStatus", appUpdateInfo.installStatus());
                result.put("availableVersionCode", appUpdateInfo.availableVersionCode());
                result.put("clientVersionStalenessDays", appUpdateInfo.clientVersionStalenessDays());
                result.put("updatePriority", appUpdateInfo.updatePriority());
                result.put("flexibleAllowed", flexibleAllowed);
                result.put("immediateAllowed", immediateAllowed);
                result.put("downloaded", appUpdateInfo.installStatus() == InstallStatus.DOWNLOADED);
                result.put("developerTriggeredInProgress", developerTriggeredInProgress);
                call.resolve(result);
            })
            .addOnFailureListener(error -> call.reject("Unable to check Google Play in-app update", error));
    }

    @PluginMethod
    public void startStoreUpdate(PluginCall call) {
        String packageName = getContext().getPackageName();
        String installerPackageName = getInstallerPackageName(packageName);
        if (!GOOGLE_PLAY_INSTALLER.equals(installerPackageName)) {
            openStorePage(call);
            return;
        }

        String requestedType = call.getString("updateType", "flexible");
        AppUpdateManager appUpdateManager = AppUpdateManagerFactory.create(getContext());
        appUpdateManager.getAppUpdateInfo()
            .addOnSuccessListener(appUpdateInfo -> {
                int updateType = resolveAllowedUpdateType(appUpdateInfo, requestedType);
                if (updateType < 0) {
                    call.reject("Requested Google Play update type is not allowed");
                    return;
                }

                appUpdateManager.startUpdateFlow(
                    appUpdateInfo,
                    getActivity(),
                    AppUpdateOptions.newBuilder(updateType).build()
                )
                    .addOnSuccessListener(resultCode -> {
                        JSObject result = buildBaseStoreUpdateResult(packageName, installerPackageName);
                        result.put("started", true);
                        result.put("mechanism", "google_play_in_app");
                        result.put("updateType", updateType == AppUpdateType.IMMEDIATE ? "immediate" : "flexible");
                        result.put("resultCode", resultCode);
                        call.resolve(result);
                    })
                    .addOnFailureListener(error -> call.reject("Unable to start Google Play in-app update", error));
            })
            .addOnFailureListener(error -> call.reject("Unable to load Google Play in-app update state", error));
    }

    @PluginMethod
    public void completeFlexibleUpdate(PluginCall call) {
        AppUpdateManager appUpdateManager = AppUpdateManagerFactory.create(getContext());
        appUpdateManager.completeUpdate()
            .addOnSuccessListener(unused -> {
                JSObject result = new JSObject();
                result.put("completed", true);
                result.put("mechanism", "google_play_in_app");
                call.resolve(result);
            })
            .addOnFailureListener(error -> call.reject("Unable to complete Google Play flexible update", error));
    }

    @PluginMethod
    public void openStorePage(PluginCall call) {
        String uri = call.getString("uri", "");
        String fallbackUrl = call.getString("fallbackUrl", "");
        boolean opened = openUri(uri) || openUri(fallbackUrl);
        if (!opened) {
            call.reject("No app store URL could be opened");
            return;
        }

        JSObject result = new JSObject();
        result.put("opened", true);
        call.resolve(result);
    }

    @PluginMethod
    public void downloadAndInstallApk(PluginCall call) {
        String rawUrl = call.getString("url", "");
        Long expectedSizeValue = call.getLong("expectedSize", 0L);
        long expectedSize = expectedSizeValue == null ? 0L : expectedSizeValue;
        String expectedSha256 = normalizeSha256(call.getString("expectedSha256", ""));

        if (!isAllowedInitialDownloadUrl(rawUrl)) {
            call.reject("Only the official TokyoRailMap GitHub release APK can be installed", "INVALID_APK_URL");
            return;
        }
        if (expectedSize < 0 || expectedSize > MAX_APK_SIZE_BYTES) {
            call.reject("Invalid APK size", "INVALID_APK_SIZE");
            return;
        }
        if (!downloadInProgress.compareAndSet(false, true)) {
            call.reject("An update download is already in progress", "UPDATE_DOWNLOAD_IN_PROGRESS");
            return;
        }

        downloadExecutor.execute(() -> {
            try {
                File apkFile = downloadApk(rawUrl, expectedSize, expectedSha256);
                getBridge().executeOnMainThread(() -> beginPackageInstallation(call, apkFile, false));
            } catch (Exception error) {
                downloadInProgress.set(false);
                call.reject("Unable to download the GitHub update", "APK_DOWNLOAD_FAILED", error);
            }
        });
    }

    @ActivityCallback
    private void unknownSourcesResult(PluginCall call, ActivityResult result) {
        File apkFile = pendingInstallFile;
        pendingInstallFile = null;
        if (call == null || apkFile == null || !apkFile.isFile()) {
            downloadInProgress.set(false);
            if (call != null) call.reject("Downloaded APK is no longer available", "APK_NOT_FOUND");
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            && !getContext().getPackageManager().canRequestPackageInstalls()) {
            downloadInProgress.set(false);
            call.reject("Permission to install updates was not granted", "APK_INSTALL_PERMISSION_DENIED");
            return;
        }
        beginPackageInstallation(call, apkFile, true);
    }

    private File downloadApk(String rawUrl, long expectedSize, String expectedSha256) throws Exception {
        File updateDirectory = new File(getContext().getCacheDir(), "tokyorail-updates");
        if (!updateDirectory.exists() && !updateDirectory.mkdirs()) {
            throw new IOException("Unable to create the update cache directory");
        }

        clearStaleUpdateFiles(updateDirectory);
        File partialFile = new File(updateDirectory, "TokyoRailMap-update.apk.part");
        File apkFile = new File(updateDirectory, "TokyoRailMap-update.apk");
        HttpURLConnection connection = openDownloadConnection(rawUrl);
        long totalBytes = 0;

        try (
            BufferedInputStream input = new BufferedInputStream(connection.getInputStream());
            FileOutputStream output = new FileOutputStream(partialFile)
        ) {
            byte[] buffer = new byte[64 * 1024];
            int count;
            while ((count = input.read(buffer)) != -1) {
                totalBytes += count;
                if (totalBytes > MAX_APK_SIZE_BYTES) {
                    throw new IOException("APK exceeds the maximum allowed size");
                }
                output.write(buffer, 0, count);
            }
        } finally {
            connection.disconnect();
        }

        if (totalBytes <= 0 || (expectedSize > 0 && totalBytes != expectedSize)) {
            partialFile.delete();
            throw new IOException("Downloaded APK size does not match the GitHub release asset");
        }
        if (!expectedSha256.isEmpty() && !expectedSha256.equals(calculateSha256(partialFile))) {
            partialFile.delete();
            throw new IOException("Downloaded APK SHA-256 does not match the GitHub release asset");
        }
        if (apkFile.exists() && !apkFile.delete()) {
            partialFile.delete();
            throw new IOException("Unable to replace the previous update APK");
        }
        if (!partialFile.renameTo(apkFile)) {
            partialFile.delete();
            throw new IOException("Unable to finalize the downloaded APK");
        }
        return apkFile;
    }

    private HttpURLConnection openDownloadConnection(String rawUrl) throws Exception {
        URL nextUrl = new URI(rawUrl).toURL();
        for (int redirectCount = 0; redirectCount <= 8; redirectCount += 1) {
            if (!isAllowedDownloadHost(nextUrl)) {
                throw new IOException("GitHub redirected the APK to an untrusted host");
            }

            HttpURLConnection connection = (HttpURLConnection) nextUrl.openConnection();
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(20_000);
            connection.setReadTimeout(30_000);
            connection.setRequestProperty("Accept", "application/octet-stream");
            connection.setRequestProperty("User-Agent", "TokyoRailMap-Android-Updater");
            int statusCode = connection.getResponseCode();
            if (statusCode == HttpURLConnection.HTTP_OK) return connection;

            if (statusCode == 301 || statusCode == 302 || statusCode == 303 || statusCode == 307 || statusCode == 308) {
                String location = connection.getHeaderField("Location");
                connection.disconnect();
                if (location == null || location.trim().isEmpty()) {
                    throw new IOException("GitHub returned an empty APK redirect");
                }
                nextUrl = new URL(nextUrl, location);
                continue;
            }

            connection.disconnect();
            throw new IOException("GitHub APK download returned HTTP " + statusCode);
        }
        throw new IOException("Too many GitHub APK download redirects");
    }

    private void beginPackageInstallation(PluginCall call, File apkFile, boolean permissionRequested) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            && !getContext().getPackageManager().canRequestPackageInstalls()) {
            pendingInstallFile = apkFile;
            Intent permissionIntent = new Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:" + getContext().getPackageName())
            );
            try {
                startActivityForResult(call, permissionIntent, "unknownSourcesResult");
            } catch (Exception error) {
                pendingInstallFile = null;
                downloadInProgress.set(false);
                call.reject("Unable to open the install permission settings", "APK_INSTALL_PERMISSION_FAILED", error);
            }
            return;
        }

        try {
            Uri apkUri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                apkFile
            );
            Intent installIntent = new Intent(Intent.ACTION_INSTALL_PACKAGE);
            installIntent.setData(apkUri);
            installIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().startActivity(installIntent);

            JSObject result = new JSObject();
            result.put("started", true);
            result.put("downloaded", true);
            result.put("permissionRequested", permissionRequested);
            result.put("fileName", apkFile.getName());
            downloadInProgress.set(false);
            call.resolve(result);
        } catch (Exception error) {
            downloadInProgress.set(false);
            call.reject("Unable to open the Android package installer", "APK_INSTALLER_FAILED", error);
        }
    }

    private boolean isAllowedInitialDownloadUrl(String rawUrl) {
        try {
            URL url = new URI(rawUrl).toURL();
            return "https".equalsIgnoreCase(url.getProtocol())
                && "github.com".equalsIgnoreCase(url.getHost())
                && url.getPath().startsWith(GITHUB_RELEASE_PATH_PREFIX)
                && url.getPath().toLowerCase(Locale.ROOT).endsWith(".apk");
        } catch (Exception ignored) {
            return false;
        }
    }

    private boolean isAllowedDownloadHost(URL url) {
        if (!"https".equalsIgnoreCase(url.getProtocol())) return false;
        String host = url.getHost().toLowerCase(Locale.ROOT);
        return "github.com".equals(host) || host.endsWith(".githubusercontent.com");
    }

    private String normalizeSha256(String value) {
        String digest = value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
        return digest.matches("[0-9a-f]{64}") ? digest : "";
    }

    private String calculateSha256(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (FileInputStream input = new FileInputStream(file)) {
            byte[] buffer = new byte[64 * 1024];
            int count;
            while ((count = input.read(buffer)) != -1) digest.update(buffer, 0, count);
        }
        StringBuilder hex = new StringBuilder();
        for (byte value : digest.digest()) hex.append(String.format(Locale.ROOT, "%02x", value));
        return hex.toString();
    }

    private void clearStaleUpdateFiles(File updateDirectory) {
        File[] files = updateDirectory.listFiles();
        if (files == null) return;
        for (File file : files) file.delete();
    }

    @Override
    protected void handleOnDestroy() {
        downloadExecutor.shutdownNow();
        super.handleOnDestroy();
    }

    private JSObject buildBaseStoreUpdateResult(String packageName, String installerPackageName) {
        JSObject result = new JSObject();
        result.put("packageName", packageName);
        result.put("installerPackageName", installerPackageName);
        return result;
    }

    private int resolveAllowedUpdateType(AppUpdateInfo appUpdateInfo, String requestedType) {
        boolean wantsImmediate = "immediate".equalsIgnoreCase(requestedType);
        int preferredType = wantsImmediate ? AppUpdateType.IMMEDIATE : AppUpdateType.FLEXIBLE;
        int fallbackType = wantsImmediate ? AppUpdateType.FLEXIBLE : AppUpdateType.IMMEDIATE;

        if (isUpdateTypeAllowed(appUpdateInfo, preferredType)) return preferredType;
        if (isUpdateTypeAllowed(appUpdateInfo, fallbackType)) return fallbackType;
        return -1;
    }

    private boolean isUpdateTypeAllowed(AppUpdateInfo appUpdateInfo, int updateType) {
        boolean updateAvailable = appUpdateInfo.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE
            || appUpdateInfo.updateAvailability() == UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS;
        return updateAvailable && appUpdateInfo.isUpdateTypeAllowed(updateType);
    }

    private String getInstallerPackageName(String packageName) {
        PackageManager packageManager = getContext().getPackageManager();
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                return packageManager.getInstallSourceInfo(packageName).getInstallingPackageName();
            }
            return packageManager.getInstallerPackageName(packageName);
        } catch (Exception ignored) {
            return "";
        }
    }

    private boolean openUri(String rawUri) {
        if (rawUri == null || rawUri.trim().isEmpty()) {
            return false;
        }

        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(rawUri.trim()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            return true;
        } catch (Exception ignored) {
            return false;
        }
    }
}
