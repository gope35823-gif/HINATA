/**
 * AndroidBridge — TypeScript interface to native Kotlin plugins.
 * Communicates via Capacitor Plugin system / WebView JavaScriptInterface.
 *
 * NEVER use browser timers or fake launches.
 * All critical operations go through native Android APIs.
 */

import { Capacitor, registerPlugin } from '@capacitor/core';
import type {
  InstalledApp,
  AppLaunchResult,
  AppStatus,
  Reminder,
  ReminderCreateRequest,
  ReminderResult,
} from '../types';

export interface AppManagerPlugin {
  getInstalledApps(): Promise<{ apps: InstalledApp[] }>;
  searchApp(options: { name: string }): Promise<{ matches: InstalledApp[] }>;
  launchApp(options: { packageName: string }): Promise<AppLaunchResult>;
  resolveAppAlias(options: { name: string }): Promise<{ packageName: string | null; appName: string | null }>;
  getAppStatus(options: { packageName: string }): Promise<AppStatus>;
  openPlayStore(options: { packageName?: string; query?: string }): Promise<{ success: boolean }>;
}

export interface AlarmManagerPlugin {
  createReminder(options: ReminderCreateRequest): Promise<ReminderResult>;
  cancelReminder(options: { id: string }): Promise<{ success: boolean; message?: string }>;
  listReminders(): Promise<{ reminders: Reminder[] }>;
  getReminder(options: { id: string }): Promise<{ reminder: Reminder | null }>;
  checkExactAlarmPermission(): Promise<{ granted: boolean; canRequest: boolean }>;
  openExactAlarmSettings(): Promise<{ opened: boolean }>;
  rescheduleAll(): Promise<{ success: boolean; count: number }>;
}

export interface TtsPlugin {
  speak(options: { text: string; language?: string }): Promise<{ success: boolean }>;
  stop(): Promise<void>;
  isSpeaking(): Promise<{ speaking: boolean }>;
}

export interface SystemPlugin {
  openSettings(): Promise<{ success: boolean }>;
  openAppSettings(): Promise<{ success: boolean }>;
  getBatteryLevel(): Promise<{ level: number }>;
  isScreenOn(): Promise<{ on: boolean }>;
}

const AppManager = registerPlugin<AppManagerPlugin>('AppManager');
const AlarmManager = registerPlugin<AlarmManagerPlugin>('AlarmManager');
const Tts = registerPlugin<TtsPlugin>('Tts');
const System = registerPlugin<SystemPlugin>('System');

export class AndroidBridge {
  private static instance: AndroidBridge;
  private appCache: InstalledApp[] | null = null;
  private aliasMap: Map<string, string> = new Map();

  private constructor() {
    this.seedCommonAliases();
  }

  static getInstance(): AndroidBridge {
    if (!AndroidBridge.instance) {
      AndroidBridge.instance = new AndroidBridge();
    }
    return AndroidBridge.instance;
  }

  isNative(): boolean {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  }

  private seedCommonAliases() {
    // Soft aliases — actual resolution always prefers installed apps
    const common: Record<string, string> = {
      whatsapp: 'com.whatsapp',
      wa: 'com.whatsapp',
      'whats app': 'com.whatsapp',
      discord: 'com.discord',
      youtube: 'com.google.android.youtube',
      yt: 'com.google.android.youtube',
      instagram: 'com.instagram.android',
      ig: 'com.instagram.android',
      telegram: 'org.telegram.messenger',
      tg: 'org.telegram.messenger',
      settings: 'com.android.settings',
      camera: 'com.android.camera',
      gallery: 'com.android.gallery3d',
      photos: 'com.google.android.apps.photos',
      spotify: 'com.spotify.music',
      chrome: 'com.android.chrome',
      gmail: 'com.google.android.gm',
      maps: 'com.google.android.apps.maps',
      phone: 'com.android.dialer',
      contacts: 'com.android.contacts',
      messages: 'com.android.mms',
      sms: 'com.android.mms',
      clock: 'com.android.deskclock',
      calculator: 'com.android.calculator2',
      files: 'com.android.documentsui',
      playstore: 'com.android.vending',
      'play store': 'com.android.vending',
    };
    Object.entries(common).forEach(([k, v]) => this.aliasMap.set(k.toLowerCase(), v));
  }

  // ─── App Manager ───────────────────────────────────────────────

  async getInstalledApps(forceRefresh = false): Promise<InstalledApp[]> {
    if (!this.isNative()) {
      console.warn('[AndroidBridge] Not running on Android native — returning empty list');
      return [];
    }
    if (this.appCache && !forceRefresh) return this.appCache;

    try {
      const result = await AppManager.getInstalledApps();
      this.appCache = result.apps || [];
      return this.appCache;
    } catch (e) {
      console.error('[AndroidBridge] getInstalledApps failed', e);
      return [];
    }
  }

  async searchApp(name: string): Promise<InstalledApp[]> {
    if (!this.isNative()) return [];
    try {
      const result = await AppManager.searchApp({ name });
      return result.matches || [];
    } catch (e) {
      console.error('[AndroidBridge] searchApp failed', e);
      return [];
    }
  }

  async resolveAppAlias(name: string): Promise<{ packageName: string | null; appName: string | null; multiple?: InstalledApp[] }> {
    const normalized = name.toLowerCase().trim();

    // 1. Try exact alias
    if (this.aliasMap.has(normalized)) {
      const pkg = this.aliasMap.get(normalized)!;
      const status = await this.getAppStatus(pkg);
      if (status.isInstalled) {
        return { packageName: pkg, appName: name };
      }
    }

    // 2. Search installed apps
    const matches = await this.searchApp(name);
    if (matches.length === 1) {
      return { packageName: matches[0].packageName, appName: matches[0].appName };
    }
    if (matches.length > 1) {
      return { packageName: null, appName: null, multiple: matches };
    }

    // 3. Fuzzy alias match
    for (const [alias, pkg] of this.aliasMap.entries()) {
      if (normalized.includes(alias) || alias.includes(normalized)) {
        const status = await this.getAppStatus(pkg);
        if (status.isInstalled) {
          return { packageName: pkg, appName: alias };
        }
      }
    }

    return { packageName: null, appName: null };
  }

  async launchApp(packageName: string): Promise<AppLaunchResult> {
    if (!this.isNative()) {
      return {
        success: false,
        error: 'NOT_NATIVE',
        message: 'Boss, ye feature sirf Android app mein kaam karta hai.',
      };
    }
    try {
      const result = await AppManager.launchApp({ packageName });
      return result;
    } catch (e: any) {
      return {
        success: false,
        error: 'LAUNCH_FAILED',
        message: e?.message || 'App open nahi ho paya.',
      };
    }
  }

  async getAppStatus(packageName: string): Promise<AppStatus> {
    if (!this.isNative()) {
      return { packageName, isInstalled: false, isEnabled: false };
    }
    try {
      return await AppManager.getAppStatus({ packageName });
    } catch {
      return { packageName, isInstalled: false, isEnabled: false };
    }
  }

  async openPlayStore(packageName?: string, query?: string): Promise<boolean> {
    if (!this.isNative()) return false;
    try {
      const res = await AppManager.openPlayStore({ packageName, query });
      return res.success;
    } catch {
      return false;
    }
  }

  // ─── Alarm Manager ─────────────────────────────────────────────

  async createReminder(req: ReminderCreateRequest): Promise<ReminderResult> {
    if (!this.isNative()) {
      return {
        success: false,
        error: 'NOT_NATIVE',
        message: 'Boss, real alarms sirf Android native app mein possible hain.',
      };
    }

    // Check exact alarm permission first
    const perm = await this.checkExactAlarmPermission();
    if (!perm.granted) {
      return {
        success: false,
        needsExactAlarmPermission: true,
        error: 'EXACT_ALARM_PERMISSION',
        message: 'Boss, exact alarm permission off hai. Main ise enable karne ke liye settings khol sakti hoon.',
      };
    }

    try {
      const result = await AlarmManager.createReminder(req);
      return result;
    } catch (e: any) {
      return {
        success: false,
        error: 'CREATE_FAILED',
        message: e?.message || 'Alarm register nahi hua.',
      };
    }
  }

  async cancelReminder(id: string): Promise<{ success: boolean; message?: string }> {
    if (!this.isNative()) return { success: false, message: 'Not native' };
    try {
      return await AlarmManager.cancelReminder({ id });
    } catch (e: any) {
      return { success: false, message: e?.message || 'Cancel failed' };
    }
  }

  async listReminders(): Promise<Reminder[]> {
    if (!this.isNative()) return [];
    try {
      const res = await AlarmManager.listReminders();
      return res.reminders || [];
    } catch {
      return [];
    }
  }

  async checkExactAlarmPermission(): Promise<{ granted: boolean; canRequest: boolean }> {
    if (!this.isNative()) return { granted: false, canRequest: false };
    try {
      return await AlarmManager.checkExactAlarmPermission();
    } catch {
      return { granted: false, canRequest: false };
    }
  }

  async openExactAlarmSettings(): Promise<boolean> {
    if (!this.isNative()) return false;
    try {
      const res = await AlarmManager.openExactAlarmSettings();
      return res.opened;
    } catch {
      return false;
    }
  }

  // ─── TTS ───────────────────────────────────────────────────────

  async speak(text: string, language = 'hi-IN'): Promise<boolean> {
    if (!this.isNative()) {
      // Fallback for web preview only
      if ('speechSynthesis' in window) {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = language;
        speechSynthesis.speak(u);
        return true;
      }
      return false;
    }
    try {
      const res = await Tts.speak({ text, language });
      return res.success;
    } catch {
      return false;
    }
  }

  async stopSpeaking(): Promise<void> {
    if (this.isNative()) {
      await Tts.stop();
    } else if ('speechSynthesis' in window) {
      speechSynthesis.cancel();
    }
  }
}

export const bridge = AndroidBridge.getInstance();
