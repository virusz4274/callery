package com.coarde.callery;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.pm.ServiceInfo;
import android.net.Uri;
import android.os.Build;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.documentfile.provider.DocumentFile;
import androidx.work.Data;
import androidx.work.ForegroundInfo;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.SocketTimeoutException;
import java.net.URL;
import java.net.UnknownHostException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

import javax.net.ssl.SSLException;

public class BackgroundSyncWorker extends Worker {
    private static final String JOB_ID_KEY = "jobId";
    private static final String CHANNEL_ID = "background-sync";
    private static final int NOTIFICATION_ID = 4201;
    private static final int CONNECT_TIMEOUT_MS = 30_000;
    private static final int READ_TIMEOUT_MS = 15 * 60_000;
    private static final int BUFFER_SIZE = 64 * 1024;
    private static final int MAX_CONCURRENT_UPLOADS = 4;

    public BackgroundSyncWorker(@NonNull Context context, @NonNull WorkerParameters workerParams) {
        super(context, workerParams);
    }

    @NonNull
    @Override
    public Result doWork() {
        String jobId = getInputData().getString(JOB_ID_KEY);
        if (jobId == null || jobId.isEmpty()) {
            return Result.failure();
        }

        JSONObject job = BackgroundSyncStore.getJob(getApplicationContext(), jobId);
        if (job == null) {
            return Result.failure();
        }

        try {
            String folderId = job.getString("folderId");
            String serverUrl = job.getString("serverUrl");
            String authToken = job.getString("authToken");
            int totalCount = job.getInt("totalCount");
            JSONObject previousStatus = BackgroundSyncStore.getStatus(getApplicationContext());

            int successCount = previousStatus.optString("jobId", "").equals(jobId) ? previousStatus.optInt("successCount", 0) : 0;
            int failCount = previousStatus.optString("jobId", "").equals(jobId) ? previousStatus.optInt("failCount", 0) : 0;
            int completedCount = successCount + failCount;

            BackgroundSyncStore.markInFlightItemsForRetry(getApplicationContext(), jobId);
            awaitForegroundInfo(createForegroundInfo("Preparing sync", completedCount, totalCount, successCount, failCount));
            updateStatus(jobId, "running", true, completedCount, totalCount, "", successCount, failCount);

            List<JSONObject> items = toItemList(BackgroundSyncStore.getPendingItems(getApplicationContext(), jobId));
            AtomicInteger successCountRef = new AtomicInteger(successCount);
            AtomicInteger failCountRef = new AtomicInteger(failCount);
            AtomicInteger completedCountRef = new AtomicInteger(completedCount);
            AtomicInteger nextIndexRef = new AtomicInteger(0);
            AtomicBoolean shouldRetryRef = new AtomicBoolean(false);
            AtomicBoolean wasCancelledRef = new AtomicBoolean(false);

            int workerCount = Math.min(MAX_CONCURRENT_UPLOADS, items.size());
            if (workerCount > 0) {
                ExecutorService executor = Executors.newFixedThreadPool(workerCount);
                List<Future<?>> futures = new ArrayList<>();

                try {
                    for (int workerIndex = 0; workerIndex < workerCount; workerIndex++) {
                        futures.add(executor.submit(() -> {
                            try {
                                while (!shouldRetryRef.get() && !wasCancelledRef.get() && !isStopped()) {
                                    int itemIndex = nextIndexRef.getAndIncrement();
                                    if (itemIndex >= items.size()) {
                                        return;
                                    }

                                    if (BackgroundSyncStore.isJobCancelled(getApplicationContext(), jobId)) {
                                        wasCancelledRef.set(true);
                                        return;
                                    }

                                    JSONObject file = items.get(itemIndex);
                                    String fileName = file.optString("name", "");
                                    String filePath = file.getString("path");

                                    publishProgress(jobId, "running", true, completedCountRef.get(), totalCount, fileName, successCountRef.get(), failCountRef.get());

                                    try {
                                        BackgroundSyncStore.setItemUploading(getApplicationContext(), jobId, filePath);
                                        String uploadToken = initializeUpload(serverUrl, authToken, file);
                                        BackgroundSyncStore.setItemFinalizing(getApplicationContext(), jobId, filePath, uploadToken);
                                        uploadFile(folderId, file);
                                        String recordingId = completeUpload(serverUrl, authToken, uploadToken);

                                        BackgroundSyncStore.markItemSynced(getApplicationContext(), jobId, filePath, recordingId);
                                        successCountRef.incrementAndGet();
                                        completedCountRef.incrementAndGet();
                                    } catch (Exception error) {
                                        String errorMessage = error.getMessage() == null ? "Upload failed" : error.getMessage();

                                        if (isRetryableError(error)) {
                                            BackgroundSyncStore.setItemRetrying(getApplicationContext(), jobId, filePath, errorMessage);
                                            shouldRetryRef.set(true);
                                            continue;
                                        }

                                        BackgroundSyncStore.markItemFailed(getApplicationContext(), jobId, filePath, errorMessage);
                                        failCountRef.incrementAndGet();
                                        completedCountRef.incrementAndGet();
                                    }

                                    publishProgress(jobId, "running", true, completedCountRef.get(), totalCount, fileName, successCountRef.get(), failCountRef.get());
                                }
                            } catch (InterruptedException interruptedException) {
                                Thread.currentThread().interrupt();
                            } catch (Exception workerError) {
                                throw new RuntimeException(workerError);
                            }
                        }));
                    }

                    for (Future<?> future : futures) {
                        future.get();
                    }
                } finally {
                    executor.shutdownNow();
                }
            }

            successCount = successCountRef.get();
            failCount = failCountRef.get();
            completedCount = completedCountRef.get();

            if (isStopped() || wasCancelledRef.get() || BackgroundSyncStore.isJobCancelled(getApplicationContext(), jobId)) {
                BackgroundSyncStore.markRemainingItemsCancelled(getApplicationContext(), jobId);
                failCount = totalCount - successCount;
                updateStatus(jobId, "cancelled", false, totalCount, totalCount, "", successCount, failCount);
                awaitForegroundInfo(createForegroundInfo("Sync cancelled", totalCount, totalCount, successCount, failCount));
                BackgroundSyncStore.clearJob(getApplicationContext(), jobId);
                return Result.success();
            }

            if (shouldRetryRef.get()) {
                updateStatus(jobId, "retrying", false, completedCount, totalCount, "", successCount, failCount);
                awaitForegroundInfo(createForegroundInfo("Waiting to retry", completedCount, totalCount, successCount, failCount));
                return Result.retry();
            }

            String finalState = failCount > 0 ? "completed_with_errors" : "completed";
            updateStatus(jobId, finalState, false, completedCount, totalCount, "", successCount, failCount);
            awaitForegroundInfo(createForegroundInfo("Sync finished", completedCount, totalCount, successCount, failCount));
            BackgroundSyncStore.clearJob(getApplicationContext(), jobId);
            return Result.success();
        } catch (Exception error) {
            if (isRetryableError(error)) {
                updateStatus(jobId, "retrying", false, 0, 0, "", 0, 0);
                return Result.retry();
            }

            updateStatus(jobId, "failed", false, 0, 0, "", 0, 1);
            BackgroundSyncStore.clearJob(getApplicationContext(), jobId);
            return Result.failure();
        }
    }

    private List<JSONObject> toItemList(JSONArray items) throws JSONException {
        List<JSONObject> itemList = new ArrayList<>();
        for (int i = 0; i < items.length(); i++) {
            itemList.add(items.getJSONObject(i));
        }
        return itemList;
    }

    private void publishProgress(
        String jobId,
        String state,
        boolean isRunning,
        int current,
        int total,
        String currentFileName,
        int successCount,
        int failCount
    ) throws ExecutionException, InterruptedException {
        updateStatus(jobId, state, isRunning, current, total, currentFileName, successCount, failCount);
        awaitForegroundInfo(createForegroundInfo(currentFileName, current, total, successCount, failCount));
    }

    private void uploadFile(String folderId, JSONObject file) throws Exception {
        String uploadUrl = file.optString("_uploadUrl", "");
        if (uploadUrl.isEmpty()) {
            throw new Exception("Missing upload URL");
        }

        JSONObject headers = file.optJSONObject("_uploadHeaders");
        Uri fileUri = resolveFileUri(folderId, file.getString("path"));
        streamFileToSignedUrl(uploadUrl, headers, fileUri, file.getLong("size"));
    }

    private String initializeUpload(String serverUrl, String authToken, JSONObject file) throws Exception {
        JSONObject response = postJson(
            trimTrailingSlash(serverUrl) + "/api/mobile/direct-upload/init",
            authToken,
            new JSONObject()
                .put("fileName", file.getString("name"))
                .put("fileSize", file.getLong("size"))
                .put("mimeType", file.optString("mimeType", "audio/mpeg"))
        );

        if (!response.optBoolean("success", false)) {
            throw new Exception(response.optString("error", "Failed to initialize upload"));
        }

        String uploadToken = response.optString("uploadToken", "");
        if (uploadToken.isEmpty()) {
            throw new Exception("Missing upload token");
        }

        file.put("_uploadUrl", response.optString("uploadUrl", ""));
        file.put("_uploadHeaders", response.optJSONObject("headers"));
        return uploadToken;
    }

    private String completeUpload(String serverUrl, String authToken, String uploadToken) throws Exception {
        JSONObject response = postJson(
            trimTrailingSlash(serverUrl) + "/api/mobile/direct-upload/complete",
            authToken,
            new JSONObject().put("uploadToken", uploadToken)
        );

        if (!response.optBoolean("success", false)) {
            throw new Exception(response.optString("error", "Failed to finalize upload"));
        }

        String recordingId = response.optString("recordingId", "");
        if (recordingId.isEmpty()) {
            throw new Exception("Missing recording ID");
        }

        return recordingId;
    }

    private void streamFileToSignedUrl(String uploadUrl, JSONObject headers, Uri fileUri, long fileSize) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(uploadUrl).openConnection();
        try {
            connection.setRequestMethod("PUT");
            connection.setDoOutput(true);
            connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
            connection.setReadTimeout(READ_TIMEOUT_MS);
            connection.setUseCaches(false);
            connection.setFixedLengthStreamingMode(fileSize);

            if (headers != null) {
                Iterator<String> keys = headers.keys();
                while (keys.hasNext()) {
                    String key = keys.next();
                    connection.setRequestProperty(key, headers.optString(key, ""));
                }
            }

            InputStream rawInputStream = getApplicationContext().getContentResolver().openInputStream(fileUri);
            if (rawInputStream == null) {
                throw new Exception("Unable to open input stream");
            }

            try (InputStream inputStream = new BufferedInputStream(rawInputStream);
                 OutputStream outputStream = new BufferedOutputStream(connection.getOutputStream())) {
                byte[] buffer = new byte[BUFFER_SIZE];
                int bytesRead;
                while ((bytesRead = inputStream.read(buffer)) != -1) {
                    outputStream.write(buffer, 0, bytesRead);
                }
                outputStream.flush();
            }

            int statusCode = connection.getResponseCode();
            if (statusCode < 200 || statusCode >= 300) {
                String body = readResponseBody(connection);
                throw new Exception(body.isEmpty() ? "Upload failed (" + statusCode + ")" : body);
            }
        } finally {
            connection.disconnect();
        }
    }

    private JSONObject postJson(String url, String authToken, JSONObject body) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        try {
            connection.setRequestMethod("POST");
            connection.setDoOutput(true);
            connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
            connection.setReadTimeout(READ_TIMEOUT_MS);
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setRequestProperty("Authorization", "Bearer " + authToken);

            try (OutputStream outputStream = connection.getOutputStream()) {
                outputStream.write(body.toString().getBytes(StandardCharsets.UTF_8));
                outputStream.flush();
            }

            int statusCode = connection.getResponseCode();
            String responseBody = readResponseBody(connection);

            if (responseBody.isEmpty()) {
                throw new Exception("Empty server response");
            }

            JSONObject json = new JSONObject(responseBody);
            if (statusCode < 200 || statusCode >= 300) {
                throw new Exception(json.optString("error", "Request failed (" + statusCode + ")"));
            }

            return json;
        } finally {
            connection.disconnect();
        }
    }

    private String readResponseBody(HttpURLConnection connection) throws Exception {
        InputStream stream = connection.getErrorStream() != null ? connection.getErrorStream() : connection.getInputStream();
        if (stream == null) {
            return "";
        }

        StringBuilder builder = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                builder.append(line);
            }
        }

        return builder.toString();
    }

    private Uri resolveFileUri(String folderId, String relativePath) throws Exception {
        Uri treeUri = Uri.parse(folderId);
        DocumentFile current = DocumentFile.fromTreeUri(getApplicationContext(), treeUri);
        if (current == null) {
            throw new Exception("Unable to access selected folder");
        }

        String[] segments = relativePath.split("/");
        for (String segment : segments) {
            if (segment.isEmpty()) {
                continue;
            }

            current = current.findFile(segment);
            if (current == null) {
                throw new Exception("File not found: " + relativePath);
            }
        }

        return current.getUri();
    }

    private void updateStatus(
        String jobId,
        String state,
        boolean isRunning,
        int current,
        int total,
        String currentFileName,
        int successCount,
        int failCount
    ) {
        JSONObject status = new JSONObject();
        try {
            status.put("jobId", jobId);
            status.put("state", state);
            status.put("isRunning", isRunning);
            status.put("current", current);
            status.put("total", total);
            status.put("currentFileName", currentFileName);
            status.put("successCount", successCount);
            status.put("failCount", failCount);
            status.put("updatedAt", System.currentTimeMillis());
        } catch (JSONException ignored) {
        }

        BackgroundSyncStore.setStatus(getApplicationContext(), status);
    }

    private void awaitForegroundInfo(ForegroundInfo foregroundInfo) throws ExecutionException, InterruptedException {
        setForegroundAsync(foregroundInfo).get();
    }

    private boolean isRetryableError(Exception error) {
        if (error instanceof SocketTimeoutException || error instanceof UnknownHostException || error instanceof SSLException) {
            return true;
        }

        String message = error.getMessage();
        if (message == null) {
            return false;
        }

        return message.contains("429")
            || message.contains("502")
            || message.contains("503")
            || message.contains("504")
            || message.toLowerCase().contains("timeout")
            || message.toLowerCase().contains("network");
    }

    private ForegroundInfo createForegroundInfo(String currentFileName, int current, int total, int successCount, int failCount) {
        NotificationManager notificationManager = (NotificationManager) getApplicationContext().getSystemService(Context.NOTIFICATION_SERVICE);
        if (notificationManager != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Background sync",
                NotificationManager.IMPORTANCE_LOW
            );
            notificationManager.createNotificationChannel(channel);
        }

        String contentText = total > 0
            ? current + " / " + total + " files"
            : "Preparing files";

        Notification notification = new NotificationCompat.Builder(getApplicationContext(), CHANNEL_ID)
            .setContentTitle("Syncing recordings")
            .setContentText(currentFileName == null || currentFileName.isEmpty() ? contentText : currentFileName)
            .setSmallIcon(android.R.drawable.stat_sys_upload)
            .setOnlyAlertOnce(true)
            .setOngoing(true)
            .setProgress(Math.max(total, 1), current, total <= 0)
            .setSubText("Done: " + successCount + "  Failed: " + failCount)
            .build();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            return new ForegroundInfo(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        }

        return new ForegroundInfo(NOTIFICATION_ID, notification);
    }

    private String trimTrailingSlash(String serverUrl) {
        if (serverUrl.endsWith("/")) {
            return serverUrl.substring(0, serverUrl.length() - 1);
        }
        return serverUrl;
    }

    public static Data buildInputData(String jobId) {
        return new Data.Builder().putString(JOB_ID_KEY, jobId).build();
    }
}
