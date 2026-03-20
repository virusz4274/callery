package com.coarde.callery;

import android.Manifest;
import android.os.Build;

import androidx.work.Constraints;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.UUID;

@CapacitorPlugin(
    name = "BackgroundSync",
    permissions = {
        @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "notifications")
    }
)
public class BackgroundSyncPlugin extends Plugin {
    private static final String UNIQUE_WORK_NAME = "callery-background-sync";

    @PluginMethod
    public void startSync(PluginCall call) {
        String serverUrl = call.getString("serverUrl");
        String authToken = call.getString("authToken");
        String folderId = call.getString("folderId");
        JSArray files = call.getArray("files");

        if (serverUrl == null || serverUrl.isEmpty()) {
            call.reject("Missing server URL");
            return;
        }
        if (authToken == null || authToken.isEmpty()) {
            call.reject("Missing auth token");
            return;
        }
        if (folderId == null || folderId.isEmpty()) {
            call.reject("Missing folder ID");
            return;
        }
        if (files == null || files.length() == 0) {
            call.reject("No files selected");
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && getPermissionState("notifications") != PermissionState.GRANTED) {
            call.reject("Notification permission is required for reliable background sync");
            return;
        }

        JSONObject currentStatus = BackgroundSyncStore.getStatus(getContext());
        String currentState = currentStatus.optString("state", "");
        if (
            currentStatus.optBoolean("isRunning", false)
                || "queued".equals(currentState)
                || "retrying".equals(currentState)
        ) {
            call.reject("A background sync is already running");
            return;
        }

        String jobId = UUID.randomUUID().toString();
        JSONObject job = new JSONObject();

        try {
            job.put("jobId", jobId);
            job.put("serverUrl", serverUrl);
            job.put("authToken", authToken);
            job.put("folderId", folderId);
            job.put("files", new JSONArray(files.toString()));
        } catch (JSONException error) {
            call.reject("Failed to prepare sync job", error);
            return;
        }

        try {
            BackgroundSyncStore.saveJob(getContext(), jobId, job);
        } catch (JSONException error) {
            call.reject("Failed to persist sync job", error);
            return;
        }

        JSONObject queuedStatus = new JSONObject();
        try {
            queuedStatus.put("jobId", jobId);
            queuedStatus.put("state", "queued");
            queuedStatus.put("isRunning", true);
            queuedStatus.put("current", 0);
            queuedStatus.put("total", files.length());
            queuedStatus.put("currentFileName", "");
            queuedStatus.put("successCount", 0);
            queuedStatus.put("failCount", 0);
            queuedStatus.put("updatedAt", System.currentTimeMillis());
        } catch (JSONException ignored) {
        }
        BackgroundSyncStore.setStatus(getContext(), queuedStatus);

        OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(BackgroundSyncWorker.class)
            .setInputData(BackgroundSyncWorker.buildInputData(jobId))
            .setConstraints(
                new Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.CONNECTED)
                    .build()
            )
            .addTag(UNIQUE_WORK_NAME)
            .build();

        WorkManager.getInstance(getContext())
            .enqueueUniqueWork(UNIQUE_WORK_NAME, ExistingWorkPolicy.REPLACE, request);

        JSObject response = new JSObject();
        response.put("jobId", jobId);
        call.resolve(response);
    }

    @PluginMethod
    public void getNotificationPermissionStatus(PluginCall call) {
        JSObject response = new JSObject();
        response.put("granted", Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || getPermissionState("notifications") == PermissionState.GRANTED);
        call.resolve(response);
    }

    @PluginMethod
    public void requestNotificationPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || getPermissionState("notifications") == PermissionState.GRANTED) {
            JSObject response = new JSObject();
            response.put("granted", true);
            call.resolve(response);
            return;
        }

        requestPermissionForAlias("notifications", call, "notificationPermissionCallback");
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        JSObject response = new JSObject();
        response.put("status", BackgroundSyncStore.getStatus(getContext()));
        call.resolve(response);
    }

    @PluginMethod
    public void cancelSync(PluginCall call) {
        JSONObject currentStatus = BackgroundSyncStore.getStatus(getContext());
        String jobId = currentStatus.optString("jobId", null);
        if (jobId != null && !jobId.isEmpty()) {
            BackgroundSyncStore.cancelJob(getContext(), jobId);
            WorkManager.getInstance(getContext()).cancelUniqueWork(UNIQUE_WORK_NAME);
            try {
                JSONObject cancelledStatus = new JSONObject();
                cancelledStatus.put("jobId", jobId);
                cancelledStatus.put("state", "cancelled");
                cancelledStatus.put("isRunning", false);
                cancelledStatus.put("current", currentStatus.optInt("current", 0));
                cancelledStatus.put("total", currentStatus.optInt("total", 0));
                cancelledStatus.put("currentFileName", "");
                cancelledStatus.put("successCount", currentStatus.optInt("successCount", 0));
                cancelledStatus.put("failCount", currentStatus.optInt("failCount", 0));
                cancelledStatus.put("updatedAt", System.currentTimeMillis());
                BackgroundSyncStore.setStatus(getContext(), cancelledStatus);
            } catch (JSONException ignored) {
            }
        }

        JSObject response = new JSObject();
        response.put("cancelled", true);
        call.resolve(response);
    }

    @PluginMethod
    public void drainCompletedResults(PluginCall call) {
        JSObject response = new JSObject();
        response.put("items", BackgroundSyncStore.drainCompletedResults(getContext()));
        call.resolve(response);
    }

    @PermissionCallback
    private void notificationPermissionCallback(PluginCall call) {
        JSObject response = new JSObject();
        response.put("granted", getPermissionState("notifications") == PermissionState.GRANTED);
        call.resolve(response);
    }
}
