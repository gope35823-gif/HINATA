package com.hinata.assistant.receivers

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.speech.tts.TextToSpeech
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.hinata.assistant.db.ReminderDatabase
import com.hinata.assistant.services.ReminderForegroundService
import java.util.Locale

/**
 * AlarmReceiver — Triggered by AlarmManager.
 * Does NOT depend on Gemini Live or any web session.
 * Speaks via Android TTS and shows a high-priority notification.
 */
class AlarmReceiver : BroadcastReceiver() {

    companion object {
        const val ACTION_REMINDER = "com.hinata.assistant.ACTION_REMINDER"
        const val EXTRA_REMINDER_ID = "reminder_id"
        const val EXTRA_TITLE = "title"
        const val EXTRA_MESSAGE = "message"
        const val CHANNEL_ID = "hinata_reminders"
        private const val TAG = "HinataAlarmReceiver"
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != ACTION_REMINDER) return

        val reminderId = intent.getStringExtra(EXTRA_REMINDER_ID) ?: return
        val title = intent.getStringExtra(EXTRA_TITLE) ?: "Reminder"
        val message = intent.getStringExtra(EXTRA_MESSAGE) ?: ""

        Log.i(TAG, "Alarm fired for $reminderId: $message")

        // Start foreground service so TTS + notification work even if app is dead
        val serviceIntent = Intent(context, ReminderForegroundService::class.java).apply {
            putExtra(EXTRA_REMINDER_ID, reminderId)
            putExtra(EXTRA_TITLE, title)
            putExtra(EXTRA_MESSAGE, message)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(serviceIntent)
        } else {
            context.startService(serviceIntent)
        }

        // Also show notification immediately
        showNotification(context, reminderId, title, message)

        // Mark as fired / disable one-shot in DB
        try {
            val db = ReminderDatabase.getInstance(context)
            val entity = db.getById(reminderId)
            if (entity != null && entity.repeatRule == "none") {
                db.update(entity.copy(enabled = false, updatedAt = System.currentTimeMillis()))
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to update reminder state", e)
        }
    }

    private fun showNotification(context: Context, id: String, title: String, message: String) {
        val builder = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle("Hinata: $title")
            .setContentText(message)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setAutoCancel(true)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)

        try {
            NotificationManagerCompat.from(context).notify(id.hashCode(), builder.build())
        } catch (e: SecurityException) {
            Log.e(TAG, "Notification permission missing", e)
        }
    }
}
