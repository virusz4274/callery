package com.coarde.vosift;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

public final class BackgroundSyncDbHelper extends SQLiteOpenHelper {
    public static final String DB_NAME = "background_sync.db";
    public static final int DB_VERSION = 2;

    public static final String TABLE_JOBS = "jobs";
    public static final String TABLE_JOB_ITEMS = "job_items";
    public static final String TABLE_STATUS = "status";
    public static final String TABLE_FOLDER_SCANS = "folder_scans";
    public static final String TABLE_FOLDER_SCAN_FILES = "folder_scan_files";

    public BackgroundSyncDbHelper(Context context) {
        super(context, DB_NAME, null, DB_VERSION);
    }

    @Override
    public void onCreate(SQLiteDatabase db) {
        createBackgroundSyncTables(db);
        createFolderScanTables(db);
    }

    private void createBackgroundSyncTables(SQLiteDatabase db) {
        db.execSQL(
            "CREATE TABLE " + TABLE_JOBS + " (" +
                "job_id TEXT PRIMARY KEY," +
                "server_url TEXT NOT NULL," +
                "auth_token TEXT NOT NULL," +
                "folder_id TEXT NOT NULL," +
                "total_count INTEGER NOT NULL," +
                "cancelled INTEGER NOT NULL DEFAULT 0," +
                "created_at INTEGER NOT NULL" +
            ")"
        );

        db.execSQL(
            "CREATE TABLE " + TABLE_JOB_ITEMS + " (" +
                "job_id TEXT NOT NULL," +
                "folder_id TEXT NOT NULL," +
                "path TEXT NOT NULL," +
                "name TEXT NOT NULL," +
                "size INTEGER NOT NULL," +
                "mtime INTEGER NOT NULL," +
                "mime_type TEXT," +
                "state TEXT NOT NULL," +
                "recording_id TEXT," +
                "error TEXT," +
                "synced_at INTEGER," +
                "upload_token TEXT," +
                "drained INTEGER NOT NULL DEFAULT 0," +
                "updated_at INTEGER NOT NULL," +
                "PRIMARY KEY(job_id, path)" +
            ")"
        );

        db.execSQL(
            "CREATE INDEX idx_job_items_job_state ON " + TABLE_JOB_ITEMS + " (job_id, state)"
        );

        db.execSQL(
            "CREATE TABLE " + TABLE_STATUS + " (" +
                "id INTEGER PRIMARY KEY CHECK(id = 1)," +
                "job_id TEXT," +
                "state TEXT NOT NULL," +
                "is_running INTEGER NOT NULL," +
                "current_count INTEGER NOT NULL," +
                "total_count INTEGER NOT NULL," +
                "current_file_name TEXT NOT NULL," +
                "success_count INTEGER NOT NULL," +
                "fail_count INTEGER NOT NULL," +
                "updated_at INTEGER NOT NULL" +
            ")"
        );
    }

    private void createFolderScanTables(SQLiteDatabase db) {
        db.execSQL(
            "CREATE TABLE IF NOT EXISTS " + TABLE_FOLDER_SCANS + " (" +
                "folder_id TEXT PRIMARY KEY," +
                "scanned_at INTEGER NOT NULL," +
                "file_count INTEGER NOT NULL" +
            ")"
        );

        db.execSQL(
            "CREATE TABLE IF NOT EXISTS " + TABLE_FOLDER_SCAN_FILES + " (" +
                "folder_id TEXT NOT NULL," +
                "path TEXT NOT NULL," +
                "name TEXT NOT NULL," +
                "size INTEGER NOT NULL," +
                "mtime INTEGER NOT NULL," +
                "mime_type TEXT NOT NULL," +
                "PRIMARY KEY(folder_id, path)" +
            ")"
        );

        db.execSQL(
            "CREATE INDEX IF NOT EXISTS idx_folder_scan_files_folder_mtime ON " + TABLE_FOLDER_SCAN_FILES + " (folder_id, mtime)"
        );
    }

    @Override
    public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        if (oldVersion < 2) {
            createFolderScanTables(db);
        }
    }
}
