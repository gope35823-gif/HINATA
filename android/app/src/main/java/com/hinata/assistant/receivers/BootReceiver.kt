package com.hinata.assistant.receivers

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.hinata.assistant.plugins.AlarmManagerPlugin

/**
 * BootReceiver — On BOOT_COMPLETED, re-register all enabled alarms
 * from the persistent SQLite database.
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED &&
            intent.action != Intent.ACTION_LOCKED_BOOT_COMPLETED
        ) return

        Log.i("HinataBoot", "Device booted — rescheduling Hinata alarms")
        try {
            AlarmManagerPlugin.rescheduleAllFromDb(context)
        } catch (e: Exception) {
            Log.e("HinataBoot", "Failed to reschedule alarms", e)
        }
    }
}
