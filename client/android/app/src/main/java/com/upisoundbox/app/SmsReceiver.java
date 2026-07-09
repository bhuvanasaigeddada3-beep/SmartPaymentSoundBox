package com.upisoundbox.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.telephony.SmsMessage;
import android.util.Log;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class SmsReceiver extends BroadcastReceiver {
    private static final String TAG = "SmsReceiver";

    private static class ParsedTxn {
        double amount;
        String app;

        ParsedTxn(double amount, String app) {
            this.amount = amount;
            this.app = app;
        }
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!"android.provider.Telephony.SMS_RECEIVED".equals(intent.getAction())) {
            return;
        }

        Bundle data = intent.getExtras();
        if (data == null) return;

        try {
            Object[] pdus = (Object[]) data.get("pdus");
            if (pdus == null) return;

            for (Object pdu : pdus) {
                String format = data.getString("format");
                SmsMessage smsMessage;
                
                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
                    smsMessage = SmsMessage.createFromPdu((byte[]) pdu, format);
                } else {
                    smsMessage = SmsMessage.createFromPdu((byte[]) pdu);
                }

                String sender = smsMessage.getDisplayOriginatingAddress();
                String messageBody = smsMessage.getMessageBody();

                Log.d(TAG, "SMS intercepted: from " + sender + ", content: " + messageBody);

                // Parse transaction amount and app name natively in Java
                ParsedTxn parsed = parseSMS(messageBody);
                
                if (parsed != null) {
                    Log.d(TAG, "Successfully parsed transaction: ₹" + parsed.amount + " via " + parsed.app);
                    
                    // Read saved merchant soundbox settings from SharedPreferences
                    SharedPreferences pref = context.getSharedPreferences("SoundboxPrefs", Context.MODE_PRIVATE);
                    String language = pref.getString("language", "hi"); // default to Hindi
                    
                    // Generate announcement text natively matching language
                    String speakText = "";
                    if ("hi".equalsIgnoreCase(language)) {
                        String formattedApp = parsed.app.equals("GPay") ? "गूगल पे" : parsed.app.equals("PhonePe") ? "फ़ोन पे" : parsed.app.equals("Paytm") ? "पेटीएम" : "यू पी आई";
                        speakText = formattedApp + " पर " + (int)parsed.amount + " रुपये प्राप्त हुए। धन्यवाद बॉस!";
                    } else if ("te".equalsIgnoreCase(language)) {
                        String formattedApp = parsed.app.equals("GPay") ? "గూగుల్ పే" : parsed.app.equals("PhonePe") ? "ఫోన్ పే" : parsed.app.equals("Paytm") ? "పేటియం" : "యూ పి ఐ";
                        speakText = formattedApp + " ద్వారా " + (int)parsed.amount + " రూపాయలు లభించాయి. ధన్యవాదాలు బాస్!";
                    } else {
                        String formattedApp = parsed.app.equals("GPay") ? "Google Pay" : parsed.app.equals("PhonePe") ? "Phone Pe" : parsed.app.equals("Paytm") ? "Paytm" : "UPI";
                        speakText = "Received " + (int)parsed.amount + " rupees on " + formattedApp + ". Thank you boss!";
                    }

                    // Directly trigger Android Native TTS to announce payment
                    MainActivity.speakNatively(speakText, language);
                }

                // Also forward to WebView to log transaction in HTML UI
                MainActivity.handleIncomingSms(messageBody, sender);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error processing incoming SMS: " + e.getMessage());
        }
    }

    private ParsedTxn parseSMS(String text) {
        // Regex pattern to extract UPI credit amounts: e.g. Rs 250, INR 150, ₹100
        Pattern pattern = Pattern.compile("(?:Rs\\.?|INR|₹|INR\\.)\\s*([0-9,]+(?:\\.[0-9]+)?)", Pattern.CASE_INSENSITIVE);
        Matcher matcher = pattern.matcher(text);
        if (!matcher.find()) return null;

        String amountStr = matcher.group(1).replace(",", "");
        double amount;
        try {
            amount = Double.parseDouble(amountStr);
        } catch (NumberFormatException e) {
            return null;
        }

        // Match payment brand
        String app = "UPI";
        String lowerText = text.toLowerCase();
        if (lowerText.contains("paytm")) app = "Paytm";
        else if (lowerText.contains("phonepe") || lowerText.contains("ybl") || lowerText.contains("axl")) app = "PhonePe";
        else if (lowerText.contains("gpay") || lowerText.contains("google pay") || lowerText.contains("okaxis")) app = "GPay";

        return new ParsedTxn(amount, app);
    }
}
