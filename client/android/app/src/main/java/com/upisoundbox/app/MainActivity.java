package com.upisoundbox.app;

import android.Manifest;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.util.Log;
import android.webkit.JavascriptInterface;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import java.util.Locale;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "MainActivity";
    private static final int SMS_PERMISSION_CODE = 101;
    private static MainActivity instance;
    private static TextToSpeech tts;
    private static boolean ttsReady = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        instance = this;

        // Initialize Android Native Text To Speech Engine
        tts = new TextToSpeech(this, new TextToSpeech.OnInitListener() {
            @Override
            public void onInit(int status) {
                if (status == TextToSpeech.SUCCESS) {
                    Log.d(TAG, "Native TTS initialized successfully.");
                    ttsReady = true;
                    // Default to Telugu
                    tts.setLanguage(new Locale("te", "IN"));
                } else {
                    Log.e(TAG, "Failed to initialize native TTS engine.");
                }
            }
        });

        // Request SMS permissions at startup
        requestSmsPermission();

        // Register JavaScript interface to allow web page to save settings to native preferences
        getBridge().getWebView().addJavascriptInterface(new WebAppInterface(), "NativeSoundbox");
    }

    private void requestSmsPermission() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECEIVE_SMS) != PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.READ_SMS) != PackageManager.PERMISSION_GRANTED) {
            
            ActivityCompat.requestPermissions(this, 
                new String[]{Manifest.permission.RECEIVE_SMS, Manifest.permission.READ_SMS}, 
                SMS_PERMISSION_CODE);
        }
    }

    // JavaScript Bridge exposed to the React web app
    public class WebAppInterface {
        @JavascriptInterface
        public void updateSettings(String language, String appStyle) {
            Log.d(TAG, "Received settings from JS. Lang: " + language + ", App: " + appStyle);
            SharedPreferences pref = getSharedPreferences("SoundboxPrefs", MODE_PRIVATE);
            pref.edit()
                .putString("language", language)
                .putString("appStyle", appStyle)
                .apply();
        }

        @JavascriptInterface
        public void speakNative(String text, String lang) {
            Log.d(TAG, "JS requested native speak: " + text + " (" + lang + ")");
            speakNatively(text, lang);
        }
    }

    public static void speakNatively(final String text, final String lang) {
        if (instance == null || tts == null || !ttsReady) {
            Log.e(TAG, "Native TTS not ready to speak.");
            return;
        }

        instance.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    Locale locale;
                    if ("hi".equalsIgnoreCase(lang)) {
                        locale = new Locale("hi", "IN");
                    } else if ("te".equalsIgnoreCase(lang)) {
                        locale = new Locale("te", "IN");
                    } else {
                        locale = Locale.US;
                    }

                    int langResult = tts.setLanguage(locale);
                    if (langResult == TextToSpeech.LANG_MISSING_DATA || langResult == TextToSpeech.LANG_NOT_SUPPORTED) {
                        Log.e(TAG, "Language " + lang + " is not supported on this device's native TTS.");
                        // Fallback to default locale
                        tts.setLanguage(Locale.US);
                    }

                    tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "SoundboxUtterance");
                    Log.d(TAG, "Speaking native: " + text);
                } catch (Exception e) {
                    Log.e(TAG, "Error in native speak: " + e.getMessage());
                }
            }
        });
    }

    public static void handleIncomingSms(final String body, final String sender) {
        if (instance == null) {
            Log.e(TAG, "MainActivity instance is null, cannot forward SMS.");
            return;
        }

        // Forward raw SMS to WebView for ledger logs
        instance.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    String escapedBody = body.replace("\\", "\\\\")
                                             .replace("'", "\\'")
                                             .replace("\n", "\\n")
                                             .replace("\r", "\\r");
                    String escapedSender = sender.replace("\\", "\\\\")
                                                 .replace("'", "\\'");

                    String jsCommand = "if (window.onNativeSmsReceived) { " +
                            "window.onNativeSmsReceived('" + escapedBody + "', '" + escapedSender + "'); " +
                            "}";
                    instance.getBridge().getWebView().evaluateJavascript(jsCommand, null);
                } catch (Exception e) {
                    Log.e(TAG, "Error executing JS in WebView: " + e.getMessage());
                }
            }
        });
    }

    @Override
    protected void onDestroy() {
        if (tts != null) {
            tts.stop();
            tts.shutdown();
        }
        super.onDestroy();
    }
}
