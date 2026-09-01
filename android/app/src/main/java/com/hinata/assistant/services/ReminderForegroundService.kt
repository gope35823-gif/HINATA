package com.hinata.assistant.services

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.util.Log
import androidx.core.app.NotificationCompat
import com.hinata.assistant.receivers.AlarmReceiver
import java.util.Locale

/**
 * ReminderForegroundService — Speaks the reminder using Android TTS.
 * Independent of any web/Gemini session.
 */
class ReminderForegroundService : Service(), TextToSpeech.OnInitListener {

    private var tts: TextToSpeech? = null
    private var pendingTitle: String = ""
    private var pendingMessage: String = ""
    private var ready = false

    companion object {
        private const val TAG = "HinataReminderService"
        private const val NOTIF_ID = 9001
    }

    override fun onCreate() {
        super.onCreate()
        createChannel()
        startForeground(NOTIF_ID, buildNotification("Hinata reminder…", ""))
        tts = TextToSpeech(this, this)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        pendingTitle = intent?.getStringExtra(AlarmReceiver.EXTRA_TITLE) ?: "Reminder"
        pendingMessage = intent?.getStringExtra(AlarmReceiver.EXTRA_MESSAGE) ?: ""

        if (ready) {
            speakReminder()
        }
        return START_NOT_STICKY
    }

    override fun onInit(status: Int) {
        if (status == TextToSpeech.SUCCESS) {
            tts?.language = Locale("hi", "IN")
            // Fallback to English if Hindi not available
            val result = tts?.setLanguage(Locale("hi", "IN"))
            if (result == TextToSpeech.LANG_MISSING_DATA || result == TextToSpeech.LANG_NOT_SUPPORTED) {
                tts?.language = Locale.US
            }
            ready = true
            tts?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                override fun onStart(utteranceId: String?) {}
                override fun onDone(utteranceId: String?) {
                    stopSelf()
                }
                override fun onError(utteranceId: String?) {
                    stopSelf()
                }
            })
            if (pendingMessage.isNotEmpty()) {
                speakReminder()
            }
        } else {
            Log.e(TAG, "TTS init failed")
            stopSelf()
        }
    }

    private fun speakReminder() {
        val intro = "Boss, aapne jo reminder set kiya tha, uska time ho gaya hai."
        val full = "$intro $pendingMessage"
        tts?.speak(full, TextToSpeech.QUEUE_FLUSH, null, "hinata_reminder")
        // Update notification
        val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(NOTIF_ID, buildNotification(pendingTitle, pendingMessage))
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                AlarmReceiver.CHANNEL_ID,
                "Hinata Reminders",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Hinata alarm and reminder notifications"
                setSound(null, null) // TTS handles audio
            }
            val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
            nm.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(title: String, message: String): Notification {
        return NotificationCompat.Builder(this, AlarmReceiver.CHANNEL_ID)
            .setContentTitle("Hinata: $title")
            .setContentText(message.ifEmpty { "Speaking reminder…" })
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setOngoing(true)
            .build()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        tts?.stop()
        tts?.shutdown()
        super.onDestroy()
    }
}
