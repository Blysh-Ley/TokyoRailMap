package com.blysh.tokyorailmap;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(TokyoRailBasemapPlugin.class);
        registerPlugin(TokyoRailUpdatePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
