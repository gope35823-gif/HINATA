package com.hinata.assistant.plugins

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Log
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.hinata.assistant.db.ReminderDatabase
import com.hinata.assistant.db.ReminderEntity
import com.hinata.assistant.receivers.AlarmReceiver

/**
 * AlarmManagerPlugin — Real Android system alarms via AlarmManager.
 * No setTimeout / browser timers. Survives app kill, screen lock, reboot.
 */
@CapacitorPlugin(name = "AlarmManager")
class AlarmManagerPlugin : Plugin() {

    companion object {
        private const val TAG = "HinataAlarmPlugin"

        /**
         * Called from BootReceiver. Static so it works without plugin instance.
         */
        fun rescheduleAllFromDb(context: Context) {
            val db = ReminderDatabase.getInstance(context)
            val enabled = db.getAllEnabled()
            val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            var count = 0
            for (entity in enabled) {
                if (entity.triggerTime > System.currentTimeMillis()) {
                    scheduleExact(context, am, entity)
                    count++
                } else {
                    // Past one-shot — disable
                    if (entity.repeatRule == "none") {
                        db.update(entity.copy(enabled = false, updatedAt = System.currentTimeMillis()))
                    }
                }
            }
            Log.i(TAG, "Rescheduled $count alarms after boot")
        }

        private fun scheduleExact(context: Context, am: AlarmManager, entity: ReminderEntity) {
            val intent = Intent(context, AlarmReceiver::class.java).apply {
                action = AlarmReceiver.ACTION_REMINDER
                putExtra(AlarmReceiver.EXTRA_REMINDER_ID, entity.id)
                putExtra(AlarmReceiver.EXTRA_TITLE, entity.title)
                putExtra(AlarmReceiver.EXTRA_MESSAGE, entity.message)
            }
            val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            val pi = PendingIntent.getBroadcast(context, entity.alarmId, intent, flags)

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, entity.triggerTime, pi)
            } else {
                am.setExact(AlarmManager.RTC_WAKEUP, entity.triggerTime, pi)
            }
        }
    }

    private fun db(): ReminderDatabase = ReminderDatabase.getInstance(context)

    @PluginMethod
    fun createReminder(call: PluginCall) {
        val title = call.getString("title") ?: "Reminder"
        val message = call.getString("message") ?: title
        val triggerTime = call.getLong("triggerTime")
        val timezone = call.getString("timezone") ?: "Asia/Kolkata"
        val repeatRule = call.getString("repeatRule") ?: "none"

        if (triggerTime == null || triggerTime <= System.currentTimeMillis()) {
            call.reject("triggerTime must be a future timestamp")
            return
        }

        // Exact alarm permission check (Android 12+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            if (!am.canScheduleExactAlarms()) {
                val result = JSObject()
                result.put("success", false)
                result.put("needsExactAlarmPermission", true)
                result.put("error", "EXACT_ALARM_PERMISSION")
                result.put("message", "Boss, exact alarm permission off hai. Main ise enable karne ke liye settings khol sakti hoon.")
                call.resolve(result)
                return
            }
        }

        try {
            val entity = db().createNew(title, message, triggerTime, timezone, repeatRule)
            val saved = db().insert(entity)
            if (!saved) {
                val result = JSObject()
                result.put("success", false)
                result.put("error", "DB_INSERT_FAILED")
                result.put("message", "Boss, alarm database mein save nahi hua.")
                call.resolve(result)
                return
            }

            val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            scheduleExact(context, am, entity)

            // Verify by checking PendingIntent exists (best-effort)
            val result = JSObject()
            result.put("success", true)
            result.put("reminder", entityToJS(entity))
            result.put("message", "Alarm registered successfully")
            call.resolve(result)
        } catch (e: Exception) {
            Log.e(TAG, "createReminder failed", e)
            val result = JSObject()
            result.put("success", false)
            result.put("error", "CREATE_FAILED")
            result.put("message", "Boss, alarm register nahi hua: ${e.message}")
            call.resolve(result)
        }
    }

    @PluginMethod
    fun cancelReminder(call: PluginCall) {
        val id = call.getString("id")
        if (id.isNullOrEmpty()) {
            call.reject("id is required")
            return
        }

        try {
            val entity = db().getById(id)
            if (entity == null) {
                val result = JSObject()
                result.put("success", false)
                result.put("message", "Reminder nahi mila")
                call.resolve(result)
                return
            }

            val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            val intent = Intent(context, AlarmReceiver::class.java).apply {
                action = AlarmReceiver.ACTION_REMINDER
            }
            val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            val pi = PendingIntent.getBroadcast(context, entity.alarmId, intent, flags)
            am.cancel(pi)
            pi.cancel()

            db().update(entity.copy(enabled = false, updatedAt = System.currentTimeMillis()))

            val result = JSObject()
            result.put("success", true)
            result.put("message", "Reminder cancelled")
            call.resolve(result)
        } catch (e: Exception) {
            val result = JSObject()
            result.put("success", false)
            result.put("message", e.message ?: "Cancel failed")
            call.resolve(result)
        }
    }

    @PluginMethod
    fun listReminders(call: PluginCall) {
        try {
            val list = db().getAll()
            val arr = JSArray()
            list.forEach { arr.put(entityToJS(it)) }
            val result = JSObject()
            result.put("reminders", arr)
            call.resolve(result)
        } catch (e: Exception) {
            call.reject("listReminders failed: ${e.message}", e)
        }
    }

    @PluginMethod
    fun getReminder(call: PluginCall) {
        val id = call.getString("id") ?: run {
            call.reject("id required")
            return
        }
        val entity = db().getById(id)
        val result = JSObject()
        result.put("reminder", if (entity != null) entityToJS(entity) else null)
        call.resolve(result)
    }

    @PluginMethod
    fun checkExactAlarmPermission(call: PluginCall) {
        val result = JSObject()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            result.put("granted", am.canScheduleExactAlarms())
            result.put("canRequest", true)
        } else {
            result.put("granted", true)
            result.put("canRequest", false)
        }
        call.resolve(result)
    }

    @PluginMethod
    fun openExactAlarmSettings(call: PluginCall) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val intent = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).apply {
                    data = Uri.parse("package:${context.packageName}")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(intent)
            } else {
                val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                    data = Uri.parse("package:${context.packageName}")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(intent)
            }
            val result = JSObject()
            result.put("opened", true)
            call.resolve(result)
        } catch (e: Exception) {
            val result = JSObject()
            result.put("opened", false)
            call.resolve(result)
        }
    }

    @PluginMethod
    fun rescheduleAll(call: PluginCall) {
        try {
            rescheduleAllFromDb(context)
            val count = db().getAllEnabled().size
            val result = JSObject()
            result.put("success", true)
            result.put("count", count)
            call.resolve(result)
        } catch (e: Exception) {
            call.reject("rescheduleAll failed: ${e.message}", e)
        }
    }

    private fun entityToJS(e: ReminderEntity): JSObject {
        return JSObject().apply {
            put("id", e.id)
            put("userId", e.userId)
            put("title", e.title)
            put("message", e.message)
            put("triggerTime", e.triggerTime)
            put("timezone", e.timezone)
            put("repeatRule", e.repeatRule)
            put("enabled", e.enabled)
            put("alarmId", e.alarmId)
            put("createdAt", e.createdAt)
            put("updatedAt", e.updatedAt)
        }
    }
}
