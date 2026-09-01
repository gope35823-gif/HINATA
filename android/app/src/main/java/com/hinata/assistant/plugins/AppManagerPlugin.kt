package com.hinata.assistant.plugins

import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.util.Base64
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.ByteArrayOutputStream

/**
 * AppManagerPlugin — Real Android app discovery & launch.
 * Uses PackageManager. Never opens websites when user asks for an app.
 */
@CapacitorPlugin(name = "AppManager")
class AppManagerPlugin : Plugin() {

    @PluginMethod
    fun getInstalledApps(call: PluginCall) {
        try {
            val pm = context.packageManager
            val packages = pm.getInstalledApplications(PackageManager.GET_META_DATA)
            val apps = JSArray()

            for (appInfo in packages) {
                // Skip pure system apps that user cannot meaningfully launch
                if ((appInfo.flags and ApplicationInfo.FLAG_SYSTEM) != 0 &&
                    (appInfo.flags and ApplicationInfo.FLAG_UPDATED_SYSTEM_APP) == 0
                ) {
                    // Keep Settings, Camera, Phone, Gallery etc.
                    val keep = listOf(
                        "com.android.settings",
                        "com.android.camera",
                        "com.android.camera2",
                        "com.google.android.GoogleCamera",
                        "com.android.gallery3d",
                        "com.google.android.apps.photos",
                        "com.android.dialer",
                        "com.google.android.dialer",
                        "com.android.contacts",
                        "com.android.mms",
                        "com.google.android.apps.messaging",
                        "com.android.deskclock",
                        "com.google.android.deskclock",
                        "com.android.calculator2",
                        "com.google.android.calculator",
                        "com.android.documentsui",
                        "com.android.vending",
                        "com.android.chrome"
                    )
                    if (appInfo.packageName !in keep) continue
                }

                val obj = JSObject()
                obj.put("packageName", appInfo.packageName)
                obj.put("appName", pm.getApplicationLabel(appInfo).toString())
                obj.put("label", pm.getApplicationLabel(appInfo).toString())
                obj.put("isSystemApp", (appInfo.flags and ApplicationInfo.FLAG_SYSTEM) != 0)
                try {
                    val pi = pm.getPackageInfo(appInfo.packageName, 0)
                    obj.put("versionName", pi.versionName ?: "")
                } catch (_: Exception) {
                    obj.put("versionName", "")
                }
                apps.put(obj)
            }

            val result = JSObject()
            result.put("apps", apps)
            call.resolve(result)
        } catch (e: Exception) {
            call.reject("Failed to get installed apps: ${e.message}", e)
        }
    }

    @PluginMethod
    fun searchApp(call: PluginCall) {
        val name = call.getString("name")?.trim()?.lowercase()
        if (name.isNullOrEmpty()) {
            call.reject("name is required")
            return
        }

        try {
            val pm = context.packageManager
            val packages = pm.getInstalledApplications(PackageManager.GET_META_DATA)
            val matches = JSArray()

            for (appInfo in packages) {
                val label = pm.getApplicationLabel(appInfo).toString().lowercase()
                val pkg = appInfo.packageName.lowercase()
                if (label.contains(name) || pkg.contains(name) ||
                    name.split(" ").any { label.contains(it) }
                ) {
                    val obj = JSObject()
                    obj.put("packageName", appInfo.packageName)
                    obj.put("appName", pm.getApplicationLabel(appInfo).toString())
                    obj.put("label", pm.getApplicationLabel(appInfo).toString())
                    obj.put("isSystemApp", (appInfo.flags and ApplicationInfo.FLAG_SYSTEM) != 0)
                    matches.put(obj)
                }
            }

            val result = JSObject()
            result.put("matches", matches)
            call.resolve(result)
        } catch (e: Exception) {
            call.reject("searchApp failed: ${e.message}", e)
        }
    }

    @PluginMethod
    fun launchApp(call: PluginCall) {
        val packageName = call.getString("packageName")
        if (packageName.isNullOrEmpty()) {
            call.reject("packageName is required")
            return
        }

        try {
            val pm = context.packageManager
            val launchIntent = pm.getLaunchIntentForPackage(packageName)
            if (launchIntent == null) {
                val result = JSObject()
                result.put("success", false)
                result.put("error", "NO_LAUNCH_INTENT")
                result.put("message", "Boss, is app ko launch nahi kar sakte.")
                call.resolve(result)
                return
            }

            launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(launchIntent)

            val result = JSObject()
            result.put("success", true)
            result.put("packageName", packageName)
            try {
                val appInfo = pm.getApplicationInfo(packageName, 0)
                result.put("appName", pm.getApplicationLabel(appInfo).toString())
            } catch (_: Exception) {
                result.put("appName", packageName)
            }
            call.resolve(result)
        } catch (e: Exception) {
            val result = JSObject()
            result.put("success", false)
            result.put("error", "LAUNCH_EXCEPTION")
            result.put("message", "Boss, app open nahi ho paya: ${e.message}")
            call.resolve(result)
        }
    }

    @PluginMethod
    fun resolveAppAlias(call: PluginCall) {
        val name = call.getString("name")?.trim()?.lowercase()
        if (name.isNullOrEmpty()) {
            call.reject("name is required")
            return
        }

        // Prefer live search over hard-coded map
        try {
            val pm = context.packageManager
            val packages = pm.getInstalledApplications(PackageManager.GET_META_DATA)
            var bestPkg: String? = null
            var bestLabel: String? = null
            var bestScore = 0

            for (appInfo in packages) {
                val label = pm.getApplicationLabel(appInfo).toString().lowercase()
                val pkg = appInfo.packageName.lowercase()
                var score = 0
                if (label == name) score = 100
                else if (label.startsWith(name)) score = 80
                else if (label.contains(name)) score = 60
                else if (pkg.contains(name.replace(" ", ""))) score = 40

                if (score > bestScore) {
                    bestScore = score
                    bestPkg = appInfo.packageName
                    bestLabel = pm.getApplicationLabel(appInfo).toString()
                }
            }

            val result = JSObject()
            if (bestPkg != null && bestScore >= 40) {
                result.put("packageName", bestPkg)
                result.put("appName", bestLabel)
            } else {
                result.put("packageName", null)
                result.put("appName", null)
            }
            call.resolve(result)
        } catch (e: Exception) {
            call.reject("resolveAppAlias failed: ${e.message}", e)
        }
    }

    @PluginMethod
    fun getAppStatus(call: PluginCall) {
        val packageName = call.getString("packageName")
        if (packageName.isNullOrEmpty()) {
            call.reject("packageName is required")
            return
        }

        val result = JSObject()
        result.put("packageName", packageName)
        try {
            val pm = context.packageManager
            val info = pm.getApplicationInfo(packageName, 0)
            result.put("isInstalled", true)
            result.put("isEnabled", info.enabled)
            try {
                val pi = pm.getPackageInfo(packageName, 0)
                result.put("versionName", pi.versionName ?: "")
            } catch (_: Exception) {
                result.put("versionName", "")
            }
        } catch (_: PackageManager.NameNotFoundException) {
            result.put("isInstalled", false)
            result.put("isEnabled", false)
        }
        call.resolve(result)
    }

    @PluginMethod
    fun openPlayStore(call: PluginCall) {
        val packageName = call.getString("packageName")
        val query = call.getString("query")

        try {
            val intent = if (!packageName.isNullOrEmpty()) {
                Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=$packageName")).apply {
                    setPackage("com.android.vending")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
            } else if (!query.isNullOrEmpty()) {
                Intent(Intent.ACTION_VIEW, Uri.parse("market://search?q=${Uri.encode(query)}")).apply {
                    setPackage("com.android.vending")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
            } else {
                Intent(Intent.ACTION_VIEW, Uri.parse("market://")).apply {
                    setPackage("com.android.vending")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
            }

            // Fallback to browser if Play Store missing
            try {
                context.startActivity(intent)
            } catch (_: Exception) {
                val web = if (!packageName.isNullOrEmpty()) {
                    Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=$packageName"))
                } else {
                    Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/search?q=${Uri.encode(query ?: "")}"))
                }
                web.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(web)
            }

            val result = JSObject()
            result.put("success", true)
            call.resolve(result)
        } catch (e: Exception) {
            val result = JSObject()
            result.put("success", false)
            call.resolve(result)
        }
    }
}
