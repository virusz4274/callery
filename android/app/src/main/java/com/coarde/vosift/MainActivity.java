package com.coarde.vosift;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BackgroundSyncPlugin.class);
        registerPlugin(FolderScanPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
