package com.hinata.assistant;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.hinata.assistant.plugins.AppManagerPlugin;
import com.hinata.assistant.plugins.AlarmManagerPlugin;
import com.hinata.assistant.plugins.TtsPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AppManagerPlugin.class);
        registerPlugin(AlarmManagerPlugin.class);
        registerPlugin(TtsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
