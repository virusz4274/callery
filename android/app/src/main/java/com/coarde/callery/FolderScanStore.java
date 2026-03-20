package com.coarde.callery;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

public final class FolderScanStore {
    private FolderScanStore() {}

    private static BackgroundSyncDbHelper helper(Context context) {
        return new BackgroundSyncDbHelper(context.getApplicationContext());
    }

    public static synchronized JSONObject getCachedScan(Context context, String folderId) {
        BackgroundSyncDbHelper dbHelper = helper(context);
        SQLiteDatabase db = dbHelper.getReadableDatabase();
        Cursor metadataCursor = db.query(
            BackgroundSyncDbHelper.TABLE_FOLDER_SCANS,
            new String[] { "scanned_at", "file_count" },
            "folder_id = ?",
            new String[] { folderId },
            null,
            null,
            null
        );

        Cursor filesCursor = db.query(
            BackgroundSyncDbHelper.TABLE_FOLDER_SCAN_FILES,
            new String[] { "path", "name", "size", "mtime", "mime_type" },
            "folder_id = ?",
            new String[] { folderId },
            null,
            null,
            "mtime DESC"
        );

        try {
            if (!metadataCursor.moveToFirst()) {
                return null;
            }

            JSONObject result = new JSONObject();
            result.put("scannedAt", metadataCursor.getLong(0));
            result.put("fileCount", metadataCursor.getInt(1));

            JSONArray files = new JSONArray();
            while (filesCursor.moveToNext()) {
                JSONObject file = new JSONObject();
                file.put("path", filesCursor.getString(0));
                file.put("name", filesCursor.getString(1));
                file.put("size", filesCursor.getLong(2));
                file.put("mtime", filesCursor.getLong(3));
                file.put("mimeType", filesCursor.getString(4));
                files.put(file);
            }

            result.put("files", files);
            return result;
        } catch (JSONException ignored) {
            return null;
        } finally {
            filesCursor.close();
            metadataCursor.close();
            db.close();
        }
    }

    public static synchronized void replaceScan(Context context, String folderId, JSONArray files, long scannedAt) throws JSONException {
        BackgroundSyncDbHelper dbHelper = helper(context);
        SQLiteDatabase db = dbHelper.getWritableDatabase();

        db.beginTransaction();
        try {
            db.delete(BackgroundSyncDbHelper.TABLE_FOLDER_SCAN_FILES, "folder_id = ?", new String[] { folderId });

            for (int i = 0; i < files.length(); i++) {
                JSONObject file = files.getJSONObject(i);
                ContentValues fileValues = new ContentValues();
                fileValues.put("folder_id", folderId);
                fileValues.put("path", file.getString("path"));
                fileValues.put("name", file.getString("name"));
                fileValues.put("size", file.getLong("size"));
                fileValues.put("mtime", file.getLong("mtime"));
                fileValues.put("mime_type", file.getString("mimeType"));
                db.insertOrThrow(BackgroundSyncDbHelper.TABLE_FOLDER_SCAN_FILES, null, fileValues);
            }

            ContentValues metadataValues = new ContentValues();
            metadataValues.put("folder_id", folderId);
            metadataValues.put("scanned_at", scannedAt);
            metadataValues.put("file_count", files.length());
            db.insertWithOnConflict(
                BackgroundSyncDbHelper.TABLE_FOLDER_SCANS,
                null,
                metadataValues,
                SQLiteDatabase.CONFLICT_REPLACE
            );

            db.setTransactionSuccessful();
        } finally {
            db.endTransaction();
            db.close();
        }
    }
}
