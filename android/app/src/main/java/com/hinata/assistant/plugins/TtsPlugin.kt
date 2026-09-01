package com.hinata.assistant.plugins

import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.util.Locale

@CapacitorPlugin(name = "Tts")
class TtsPlugin : Plugin(), TextToSpeech.OnInitListener {

    private var tts: TextToSpeech? = null
    private var ready = false
    private var pendingCall: PluginCall? = null
    private var pendingText: String? = null
    private var pendingLang: String = "hi-IN"

    override fun load() {
        tts = TextToSpeech(context, this)
    }

    override fun onInit(status: Int) {
        ready = status == TextToSpeech.SUCCESS
        if (ready) {
            setLanguage(pendingLang)
            pendingText?.let { speakInternal(it, pendingCall) }
        }
    }

    private fun setLanguage(lang: String) {
        val parts = lang.split("-")
        val locale = if (parts.size >= 2) Locale(parts[0], parts[1]) else Locale(lang)
        val result = tts?.setLanguage(locale)
        if (result == TextToSpeech.LANG_MISSING_DATA || result == TextToSpeech.LANG_NOT_SUPPORTED) {
            tts?.language = Locale("hi", "IN")
            if (tts?.isLanguageAvailable(Locale("hi", "IN")) == TextToSpeech.LANG_NOT_SUPPORTED) {
                tts?.language = Locale.US
            }
        }
    }

    @PluginMethod
    fun speak(call: PluginCall) {
        val text = call.getString("text")
        if (text.isNullOrEmpty()) {
            call.reject("text is required")
            return
        }
        val lang = call.getString("language") ?: "hi-IN"
        pendingLang = lang

        if (!ready) {
            pendingText = text
            pendingCall = call
            return
        }
        setLanguage(lang)
        speakInternal(text, call)
    }

    private fun speakInternal(text: String, call: PluginCall?) {
        tts?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String?) {}
            override fun onDone(utteranceId: String?) {
                val result = JSObject()
                result.put("success", true)
                call?.resolve(result)
            }
            override fun onError(utteranceId: String?) {
                val result = JSObject()
                result.put("success", false)
                call?.resolve(result)
            }
        })
        tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "hinata_tts")
        // Resolve early so JS doesn't hang; actual speak continues
        if (call != null && call !== pendingCall) {
            // already handled in listener for pending
        } else {
            val result = JSObject()
            result.put("success", true)
            call?.resolve(result)
        }
        pendingText = null
        pendingCall = null
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        tts?.stop()
        call.resolve()
    }

    @PluginMethod
    fun isSpeaking(call: PluginCall) {
        val result = JSObject()
        result.put("speaking", tts?.isSpeaking == true)
        call.resolve(result)
    }

    override fun handleOnDestroy() {
        tts?.stop()
        tts?.shutdown()
        super.handleOnDestroy()
    }
}
