package com.blysh.tokyorailmap;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
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

@CapacitorPlugin(name = "TokyoRailUpdate")
public class TokyoRailUpdatePlugin extends Plugin {
    private static final String GOOGLE_PLAY_INSTALLER = "com.android.vending";

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
