package com.upisoundbox.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.telephony.SmsMessage;
import android.util.Log;

public class SmsReceiver extends BroadcastReceiver {
    private static final String TAG = "SmsReceiver";

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

                Log.d(TAG, "SMS Received from: " + sender + ", Content: " + messageBody);

                // Pass to MainActivity to trigger WebView Javascript execution
                MainActivity.handleIncomingSms(messageBody, sender);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error parsing incoming SMS: " + e.getMessage());
        }
    }
}
