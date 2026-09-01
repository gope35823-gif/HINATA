package com.hinata.assistant.db

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import android.content.ContentValues
import android.database.Cursor
import java.util.UUID

data class ReminderEntity(
    val id: String,
    val userId: String,
    val title: String,
    val message: String,
    val triggerTime: Long,
    val timezone: String,
    val repeatRule: String,
    val enabled: Boolean,
    val alarmId: Int,
    val createdAt: Long,
    val updatedAt: Long
)

class ReminderDatabase(context: Context) :
    SQLiteOpenHelper(context, DATABASE_NAME, null, DATABASE_VERSION) {

    companion object {
        private const val DATABASE_NAME = "hinata_reminders.db"
        private const val DATABASE_VERSION = 1
        private const val TABLE = "reminders"

        @Volatile
        private var instance: ReminderDatabase? = null

        fun getInstance(context: Context): ReminderDatabase {
            return instance ?: synchronized(this) {
                instance ?: ReminderDatabase(context.applicationContext).also { instance = it }
            }
        }
    }

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            """
            CREATE TABLE $TABLE (
                id TEXT PRIMARY KEY,
                userId TEXT NOT NULL,
                title TEXT NOT NULL,
                message TEXT NOT NULL,
                triggerTime INTEGER NOT NULL,
                timezone TEXT NOT NULL,
                repeatRule TEXT NOT NULL DEFAULT 'none',
                enabled INTEGER NOT NULL DEFAULT 1,
                alarmId INTEGER NOT NULL,
                createdAt INTEGER NOT NULL,
                updatedAt INTEGER NOT NULL
            )
            """.trimIndent()
        )
        db.execSQL("CREATE INDEX idx_trigger ON $TABLE(triggerTime)")
        db.execSQL("CREATE INDEX idx_enabled ON $TABLE(enabled)")
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        // Future migrations
    }

    fun insert(entity: ReminderEntity): Boolean {
        val cv = ContentValues().apply {
            put("id", entity.id)
            put("userId", entity.userId)
            put("title", entity.title)
            put("message", entity.message)
            put("triggerTime", entity.triggerTime)
            put("timezone", entity.timezone)
            put("repeatRule", entity.repeatRule)
            put("enabled", if (entity.enabled) 1 else 0)
            put("alarmId", entity.alarmId)
            put("createdAt", entity.createdAt)
            put("updatedAt", entity.updatedAt)
        }
        return writableDatabase.insert(TABLE, null, cv) != -1L
    }

    fun update(entity: ReminderEntity): Boolean {
        val cv = ContentValues().apply {
            put("title", entity.title)
            put("message", entity.message)
            put("triggerTime", entity.triggerTime)
            put("timezone", entity.timezone)
            put("repeatRule", entity.repeatRule)
            put("enabled", if (entity.enabled) 1 else 0)
            put("alarmId", entity.alarmId)
            put("updatedAt", entity.updatedAt)
        }
        return writableDatabase.update(TABLE, cv, "id = ?", arrayOf(entity.id)) > 0
    }

    fun delete(id: String): Boolean {
        return writableDatabase.delete(TABLE, "id = ?", arrayOf(id)) > 0
    }

    fun getById(id: String): ReminderEntity? {
        val cursor = readableDatabase.query(
            TABLE, null, "id = ?", arrayOf(id), null, null, null
        )
        return cursor.use {
            if (it.moveToFirst()) cursorToEntity(it) else null
        }
    }

    fun getAllEnabled(): List<ReminderEntity> {
        val cursor = readableDatabase.query(
            TABLE, null, "enabled = 1", null, null, null, "triggerTime ASC"
        )
        return cursor.use {
            val list = mutableListOf<ReminderEntity>()
            while (it.moveToNext()) {
                list.add(cursorToEntity(it))
            }
            list
        }
    }

    fun getAll(): List<ReminderEntity> {
        val cursor = readableDatabase.query(
            TABLE, null, null, null, null, null, "triggerTime ASC"
        )
        return cursor.use {
            val list = mutableListOf<ReminderEntity>()
            while (it.moveToNext()) {
                list.add(cursorToEntity(it))
            }
            list
        }
    }

    private fun cursorToEntity(c: Cursor): ReminderEntity {
        return ReminderEntity(
            id = c.getString(c.getColumnIndexOrThrow("id")),
            userId = c.getString(c.getColumnIndexOrThrow("userId")),
            title = c.getString(c.getColumnIndexOrThrow("title")),
            message = c.getString(c.getColumnIndexOrThrow("message")),
            triggerTime = c.getLong(c.getColumnIndexOrThrow("triggerTime")),
            timezone = c.getString(c.getColumnIndexOrThrow("timezone")),
            repeatRule = c.getString(c.getColumnIndexOrThrow("repeatRule")),
            enabled = c.getInt(c.getColumnIndexOrThrow("enabled")) == 1,
            alarmId = c.getInt(c.getColumnIndexOrThrow("alarmId")),
            createdAt = c.getLong(c.getColumnIndexOrThrow("createdAt")),
            updatedAt = c.getLong(c.getColumnIndexOrThrow("updatedAt"))
        )
    }

    fun nextAlarmId(): Int {
        val cursor = readableDatabase.rawQuery("SELECT MAX(alarmId) FROM $TABLE", null)
        return cursor.use {
            if (it.moveToFirst()) it.getInt(0) + 1 else 1000
        }
    }

    fun createNew(
        title: String,
        message: String,
        triggerTime: Long,
        timezone: String,
        repeatRule: String = "none",
        userId: String = "default"
    ): ReminderEntity {
        val now = System.currentTimeMillis()
        return ReminderEntity(
            id = UUID.randomUUID().toString(),
            userId = userId,
            title = title,
            message = message,
            triggerTime = triggerTime,
            timezone = timezone,
            repeatRule = repeatRule,
            enabled = true,
            alarmId = nextAlarmId(),
            createdAt = now,
            updatedAt = now
        )
    }
}
