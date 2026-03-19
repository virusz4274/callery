package com.coarde.vosift;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

public final class BackgroundSyncStore {
    public static final String STATE_QUEUED = "queued";
    public static final String STATE_RETRYING = "retrying";
    public static final String STATE_UPLOADING = "uploading";
    public static final String STATE_FINALIZING = "finalizing";
    public static final String STATE_SYNCED = "synced";
    public static final String STATE_FAILED = "failed";

    private BackgroundSyncStore() {}

    private static BackgroundSyncDbHelper helper(Context context) {
        return new BackgroundSyncDbHelper(context.getApplicationContext());
    }

    public static synchronized void saveJob(Context context, String jobId, JSONObject job) throws JSONException {
        BackgroundSyncDbHelper dbHelper = helper(context);
        SQLiteDatabase db = dbHelper.getWritableDatabase();
        long now = System.currentTimeMillis();
        JSONArray files = job.getJSONArray("files");

        db.beginTransaction();
        try {
            db.delete(BackgroundSyncDbHelper.TABLE_JOBS, "job_id = ?", new String[] { jobId });
            db.delete(BackgroundSyncDbHelper.TABLE_JOB_ITEMS, "job_id = ?", new String[] { jobId });

            ContentValues jobValues = new ContentValues();
            jobValues.put("job_id", jobId);
            jobValues.put("server_url", job.getString("serverUrl"));
            jobValues.put("auth_token", job.getString("authToken"));
            jobValues.put("folder_id", job.getString("folderId"));
            jobValues.put("total_count", files.length());
            jobValues.put("cancelled", 0);
            jobValues.put("created_at", now);
            db.insertOrThrow(BackgroundSyncDbHelper.TABLE_JOBS, null, jobValues);

            for (int i = 0; i < files.length(); i++) {
                JSONObject file = files.getJSONObject(i);
                ContentValues itemValues = new ContentValues();
                itemValues.put("job_id", jobId);
                itemValues.put("folder_id", job.getString("folderId"));
                itemValues.put("path", file.getString("path"));
                itemValues.put("name", file.getString("name"));
                itemValues.put("size", file.getLong("size"));
                itemValues.put("mtime", file.getLong("mtime"));
                itemValues.put("mime_type", file.optString("mimeType", "audio/mpeg"));
                itemValues.put("state", STATE_QUEUED);
                itemValues.put("drained", 0);
                itemValues.put("updated_at", now);
                db.insertOrThrow(BackgroundSyncDbHelper.TABLE_JOB_ITEMS, null, itemValues);
            }

            db.setTransactionSuccessful();
        } finally {
            db.endTransaction();
            db.close();
        }
    }

    public static synchronized JSONObject getJob(Context context, String jobId) {
        BackgroundSyncDbHelper dbHelper = helper(context);
        SQLiteDatabase db = dbHelper.getReadableDatabase();
        Cursor cursor = db.query(
            BackgroundSyncDbHelper.TABLE_JOBS,
            new String[] { "job_id", "server_url", "auth_token", "folder_id", "total_count", "cancelled", "created_at" },
            "job_id = ?",
            new String[] { jobId },
            null,
            null,
            null
        );

        try {
            if (!cursor.moveToFirst()) {
                return null;
            }

            JSONObject job = new JSONObject();
            job.put("jobId", cursor.getString(0));
            job.put("serverUrl", cursor.getString(1));
            job.put("authToken", cursor.getString(2));
            job.put("folderId", cursor.getString(3));
            job.put("totalCount", cursor.getInt(4));
            job.put("cancelled", cursor.getInt(5) == 1);
            job.put("createdAt", cursor.getLong(6));
            return job;
        } catch (JSONException ignored) {
            return null;
        } finally {
            cursor.close();
            db.close();
        }
    }

    public static synchronized void clearJob(Context context, String jobId) {
        BackgroundSyncDbHelper dbHelper = helper(context);
        SQLiteDatabase db = dbHelper.getWritableDatabase();
        try {
            db.delete(BackgroundSyncDbHelper.TABLE_JOBS, "job_id = ?", new String[] { jobId });
            db.delete(
                BackgroundSyncDbHelper.TABLE_JOB_ITEMS,
                "job_id = ? AND drained = 1",
                new String[] { jobId }
            );
        } finally {
            db.close();
        }
    }

    public static synchronized void cancelJob(Context context, String jobId) {
        BackgroundSyncDbHelper dbHelper = helper(context);
        SQLiteDatabase db = dbHelper.getWritableDatabase();
        try {
            ContentValues values = new ContentValues();
            values.put("cancelled", 1);
            db.update(BackgroundSyncDbHelper.TABLE_JOBS, values, "job_id = ?", new String[] { jobId });
        } finally {
            db.close();
        }
    }

    public static synchronized boolean isJobCancelled(Context context, String jobId) {
        BackgroundSyncDbHelper dbHelper = helper(context);
        SQLiteDatabase db = dbHelper.getReadableDatabase();
        Cursor cursor = db.query(
            BackgroundSyncDbHelper.TABLE_JOBS,
            new String[] { "cancelled" },
            "job_id = ?",
            new String[] { jobId },
            null,
            null,
            null
        );

        try {
            return cursor.moveToFirst() && cursor.getInt(0) == 1;
        } finally {
            cursor.close();
            db.close();
        }
    }

    public static synchronized JSONArray getPendingItems(Context context, String jobId) {
        BackgroundSyncDbHelper dbHelper = helper(context);
        SQLiteDatabase db = dbHelper.getReadableDatabase();
        Cursor cursor = db.query(
            BackgroundSyncDbHelper.TABLE_JOB_ITEMS,
            new String[] { "path", "name", "size", "mtime", "mime_type", "state", "upload_token" },
            "job_id = ? AND state IN (?, ?, ?, ?)",
            new String[] { jobId, STATE_QUEUED, STATE_RETRYING, STATE_UPLOADING, STATE_FINALIZING },
            null,
            null,
            "updated_at ASC"
        );

        JSONArray items = new JSONArray();

        try {
            while (cursor.moveToNext()) {
                JSONObject item = new JSONObject();
                item.put("path", cursor.getString(0));
                item.put("name", cursor.getString(1));
                item.put("size", cursor.getLong(2));
                item.put("mtime", cursor.getLong(3));
                item.put("mimeType", cursor.getString(4));
                item.put("state", cursor.getString(5));
                item.put("uploadToken", cursor.getString(6));
                items.put(item);
            }
        } catch (JSONException ignored) {
            return new JSONArray();
        } finally {
            cursor.close();
            db.close();
        }

        return items;
    }

    public static synchronized void markInFlightItemsForRetry(Context context, String jobId) {
        BackgroundSyncDbHelper dbHelper = helper(context);
        SQLiteDatabase db = dbHelper.getWritableDatabase();
        try {
            ContentValues values = new ContentValues();
            values.put("state", STATE_RETRYING);
            values.put("error", "Resuming interrupted background sync");
            values.putNull("upload_token");
            values.put("updated_at", System.currentTimeMillis());
            db.update(
                BackgroundSyncDbHelper.TABLE_JOB_ITEMS,
                values,
                "job_id = ? AND state IN (?, ?)",
                new String[] { jobId, STATE_UPLOADING, STATE_FINALIZING }
            );
        } finally {
            db.close();
        }
    }

    public static synchronized void setItemUploading(Context context, String jobId, String path) {
        updateItem(context, jobId, path, STATE_UPLOADING, null, null, null);
    }

    public static synchronized void setItemFinalizing(Context context, String jobId, String path, String uploadToken) {
        updateItem(context, jobId, path, STATE_FINALIZING, null, null, uploadToken);
    }

    public static synchronized void setItemRetrying(Context context, String jobId, String path, String error) {
        updateItem(context, jobId, path, STATE_RETRYING, error, null, null);
    }

    public static synchronized void markItemSynced(
        Context context,
        String jobId,
        String path,
        String recordingId
    ) {
        updateItem(context, jobId, path, STATE_SYNCED, null, recordingId, null);
    }

    public static synchronized void markItemFailed(
        Context context,
        String jobId,
        String path,
        String error
    ) {
        updateItem(context, jobId, path, STATE_FAILED, error, null, null);
    }

    public static synchronized void markRemainingItemsCancelled(Context context, String jobId) {
        BackgroundSyncDbHelper dbHelper = helper(context);
        SQLiteDatabase db = dbHelper.getWritableDatabase();
        try {
            ContentValues values = new ContentValues();
            values.put("state", STATE_FAILED);
            values.put("error", "Background sync cancelled");
            values.put("updated_at", System.currentTimeMillis());
            db.update(
                BackgroundSyncDbHelper.TABLE_JOB_ITEMS,
                values,
                "job_id = ? AND state IN (?, ?, ?, ?)",
                new String[] { jobId, STATE_QUEUED, STATE_RETRYING, STATE_UPLOADING, STATE_FINALIZING }
            );
        } finally {
            db.close();
        }
    }

    private static void updateItem(
        Context context,
        String jobId,
        String path,
        String state,
        String error,
        String recordingId,
        String uploadToken
    ) {
        BackgroundSyncDbHelper dbHelper = helper(context);
        SQLiteDatabase db = dbHelper.getWritableDatabase();
        try {
            ContentValues values = new ContentValues();
            values.put("state", state);
            values.put("updated_at", System.currentTimeMillis());

            if (error == null) {
                values.putNull("error");
            } else {
                values.put("error", error);
            }

            if (recordingId == null) {
                values.putNull("recording_id");
            } else {
                values.put("recording_id", recordingId);
                values.put("synced_at", System.currentTimeMillis());
            }

            if (uploadToken == null) {
                values.putNull("upload_token");
            } else {
                values.put("upload_token", uploadToken);
            }

            db.update(
                BackgroundSyncDbHelper.TABLE_JOB_ITEMS,
                values,
                "job_id = ? AND path = ?",
                new String[] { jobId, path }
            );
        } finally {
            db.close();
        }
    }

    public static synchronized void setStatus(Context context, JSONObject status) {
        BackgroundSyncDbHelper dbHelper = helper(context);
        SQLiteDatabase db = dbHelper.getWritableDatabase();

        try {
            ContentValues values = new ContentValues();
            values.put("id", 1);
            values.put("job_id", status.isNull("jobId") ? null : status.optString("jobId", null));
            values.put("state", status.optString("state", "idle"));
            values.put("is_running", status.optBoolean("isRunning", false) ? 1 : 0);
            values.put("current_count", status.optInt("current", 0));
            values.put("total_count", status.optInt("total", 0));
            values.put("current_file_name", status.optString("currentFileName", ""));
            values.put("success_count", status.optInt("successCount", 0));
            values.put("fail_count", status.optInt("failCount", 0));
            values.put("updated_at", status.optLong("updatedAt", System.currentTimeMillis()));
            db.insertWithOnConflict(BackgroundSyncDbHelper.TABLE_STATUS, null, values, SQLiteDatabase.CONFLICT_REPLACE);
        } finally {
            db.close();
        }
    }

    public static synchronized JSONObject getStatus(Context context) {
        BackgroundSyncDbHelper dbHelper = helper(context);
        SQLiteDatabase db = dbHelper.getReadableDatabase();
        Cursor cursor = db.query(
            BackgroundSyncDbHelper.TABLE_STATUS,
            new String[] { "job_id", "state", "is_running", "current_count", "total_count", "current_file_name", "success_count", "fail_count", "updated_at" },
            "id = 1",
            null,
            null,
            null,
            null
        );

        try {
            if (!cursor.moveToFirst()) {
                return defaultStatus();
            }

            JSONObject status = new JSONObject();
            status.put("jobId", cursor.isNull(0) ? JSONObject.NULL : cursor.getString(0));
            status.put("state", cursor.getString(1));
            status.put("isRunning", cursor.getInt(2) == 1);
            status.put("current", cursor.getInt(3));
            status.put("total", cursor.getInt(4));
            status.put("currentFileName", cursor.getString(5));
            status.put("successCount", cursor.getInt(6));
            status.put("failCount", cursor.getInt(7));
            status.put("updatedAt", cursor.getLong(8));
            return status;
        } catch (JSONException ignored) {
            return defaultStatus();
        } finally {
            cursor.close();
            db.close();
        }
    }

    public static synchronized JSONArray drainCompletedResults(Context context) {
        BackgroundSyncDbHelper dbHelper = helper(context);
        SQLiteDatabase db = dbHelper.getWritableDatabase();
        Cursor cursor = db.query(
            BackgroundSyncDbHelper.TABLE_JOB_ITEMS,
            new String[] { "job_id", "folder_id", "path", "name", "size", "mtime", "state", "recording_id", "error", "synced_at" },
            "state IN (?, ?) AND drained = 0",
            new String[] { STATE_SYNCED, STATE_FAILED },
            null,
            null,
            "updated_at ASC"
        );

        JSONArray items = new JSONArray();
        db.beginTransaction();
        try {
            while (cursor.moveToNext()) {
                String jobId = cursor.getString(0);
                String folderId = cursor.getString(1);
                String path = cursor.getString(2);

                JSONObject item = new JSONObject();
                item.put("jobId", jobId);
                item.put("folderId", folderId);
                item.put("path", path);
                item.put("name", cursor.getString(3));
                item.put("size", cursor.getLong(4));
                item.put("mtime", cursor.getLong(5));
                item.put("status", STATE_SYNCED.equals(cursor.getString(6)) ? "synced" : "error");
                item.put("recordingId", cursor.isNull(7) ? JSONObject.NULL : cursor.getString(7));
                item.put("error", cursor.isNull(8) ? JSONObject.NULL : cursor.getString(8));
                item.put("syncedAt", cursor.isNull(9) ? System.currentTimeMillis() : cursor.getLong(9));
                items.put(item);

                ContentValues values = new ContentValues();
                values.put("drained", 1);
                db.update(
                    BackgroundSyncDbHelper.TABLE_JOB_ITEMS,
                    values,
                    "job_id = ? AND path = ?",
                    new String[] { jobId, path }
                );
            }
            db.setTransactionSuccessful();
        } catch (JSONException ignored) {
            return new JSONArray();
        } finally {
            db.endTransaction();
            cursor.close();
            db.close();
        }

        return items;
    }

    public static JSONObject defaultStatus() {
        JSONObject status = new JSONObject();

        try {
            status.put("state", "idle");
            status.put("isRunning", false);
            status.put("jobId", JSONObject.NULL);
            status.put("current", 0);
            status.put("total", 0);
            status.put("currentFileName", "");
            status.put("successCount", 0);
            status.put("failCount", 0);
            status.put("updatedAt", System.currentTimeMillis());
        } catch (JSONException ignored) {
        }

        return status;
    }
}
