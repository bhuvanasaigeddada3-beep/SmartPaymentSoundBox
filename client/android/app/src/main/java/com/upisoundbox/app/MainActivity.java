package com.upisoundbox.app;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.util.Log;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "MainActivity";
    private static final int SMS_PERMISSION_CODE = 101;
    private static MainActivity instance;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        instance = this;

        // Request SMS permissions at startup
        requestSmsPermission();
    }

    private void requestSmsPermission() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECEIVE_SMS) != PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.READ_SMS) != PackageManager.PERMISSION_GRANTED) {
            
            ActivityCompat.requestPermissions(this, 
                new String[]{Manifest.permission.RECEIVE_SMS, Manifest.permission.READ_SMS}, 
                SMS_PERMISSION_CODE);
        }
    }

    public static void handleIncomingSms(final String body, final String sender) {
        if (instance == null) {
            Log.e(TAG, "MainActivity instance is null, cannot forward SMS.");
            return;
        }

        // Run on UI thread to interface with WebView
        instance.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    // Escape single quotes for safe Javascript execution
                    String escapedBody = body.replace("\\", "\\\\")
                                             .replace("'", "\\'")
                                             .replace("\n", "\\n")
                                             .replace("\r", "\\r");
                    String escapedSender = sender.replace("\\", "\\\\")
                                                 .replace("'", "\\'");

                    String jsCommand = "if (window.onNativeSmsReceived) { " +
                            "window.onNativeSmsReceived('" + escapedBody + "', '" + escapedSender + "'); " +
                            "} else { console.log('window.onNativeSmsReceived not ready yet'); }";
                    
                    Log.d(TAG, "Evaluating JS: " + jsCommand);
                    instance.getBridge().getWebView().evaluateJavascript(jsCommand, null);
                } catch (Exception e) {
                    Log.e(TAG, "Error executing JS in WebView: " + e.getMessage());
                }
            }
        });
    }
}
