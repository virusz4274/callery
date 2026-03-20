package com.coarde.callery;

import android.net.Uri;

import androidx.documentfile.provider.DocumentFile;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

@CapacitorPlugin(name = "FolderScan")
public class FolderScanPlugin extends Plugin {
    @PluginMethod
    public void getCachedScan(PluginCall call) {
        String folderId = call.getString("folderId");
        if (folderId == null || folderId.isEmpty()) {
            call.reject("Missing folder ID");
            return;
        }

        JSONObject cachedScan = FolderScanStore.getCachedScan(getContext(), folderId);
        JSObject response = new JSObject();
        response.put("scan", cachedScan != null ? cachedScan : JSONObject.NULL);
        call.resolve(response);
    }

    @PluginMethod
    public void refreshScan(PluginCall call) {
        String folderId = call.getString("folderId");
        if (folderId == null || folderId.isEmpty()) {
            call.reject("Missing folder ID");
            return;
        }

        new Thread(() -> {
            try {
                JSONObject refreshed = scanFolder(folderId);
                JSObject response = new JSObject();
                response.put("scan", refreshed);
                call.resolve(response);
            } catch (Exception error) {
                call.reject("Failed to scan folder", error);
            }
        }).start();
    }

    private JSONObject scanFolder(String folderId) throws Exception {
        Uri treeUri = Uri.parse(folderId);
        DocumentFile root = DocumentFile.fromTreeUri(getContext(), treeUri);
        if (root == null) {
            throw new Exception("Unable to access selected folder");
        }

        List<JSONObject> files = new ArrayList<>();
        collectAudioFiles(root, "", files);
        files.sort((left, right) -> Long.compare(optLong(right, "mtime"), optLong(left, "mtime")));

        JSONArray fileArray = new JSONArray();
        for (JSONObject file : files) {
            fileArray.put(file);
        }

        long scannedAt = System.currentTimeMillis();
        FolderScanStore.replaceScan(getContext(), folderId, fileArray, scannedAt);

        JSONObject result = new JSONObject();
        result.put("scannedAt", scannedAt);
        result.put("fileCount", files.size());
        result.put("files", fileArray);
        return result;
    }

    private void collectAudioFiles(DocumentFile directory, String prefix, List<JSONObject> files) throws JSONException {
        DocumentFile[] entries = directory.listFiles();
        for (DocumentFile entry : entries) {
            String name = entry.getName();
            if (name == null || name.isEmpty()) {
                continue;
            }

            String path = prefix.isEmpty() ? name : prefix + "/" + name;
            if (entry.isDirectory()) {
                collectAudioFiles(entry, path, files);
                continue;
            }

            if (!isSupportedAudioFile(name)) {
                continue;
            }

            JSONObject file = new JSONObject();
            file.put("path", path);
            file.put("name", name);
            file.put("size", entry.length());
            file.put("mtime", entry.lastModified());
            file.put("mimeType", getAudioMimeType(name));
            files.add(file);
        }
    }

    private boolean isSupportedAudioFile(String fileName) {
        String lowerName = fileName.toLowerCase(Locale.US);
        return lowerName.endsWith(".mp3")
            || lowerName.endsWith(".wav")
            || lowerName.endsWith(".m4a")
            || lowerName.endsWith(".mp4")
            || lowerName.endsWith(".webm");
    }

    private String getAudioMimeType(String fileName) {
        String lowerName = fileName.toLowerCase(Locale.US);
        if (lowerName.endsWith(".wav")) {
            return "audio/wav";
        }
        if (lowerName.endsWith(".m4a") || lowerName.endsWith(".mp4")) {
            return "audio/mp4";
        }
        if (lowerName.endsWith(".webm")) {
            return "audio/webm";
        }
        return "audio/mpeg";
    }

    private long optLong(JSONObject value, String key) {
        return value.optLong(key, 0L);
    }
}
