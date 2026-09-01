/**
 * ToolRouter — Receives classified intent, checks permissions/context,
 * calls the correct AndroidBridge method, verifies result, returns speakable response.
 *
 * MANDATORY: Never claim success unless the native operation actually succeeded.
 */

import { bridge } from '../bridge/AndroidBridge';
import { intentEngine } from './IntentEngine';
import type { ClassifiedIntent, ToolResult, Reminder } from '../types';

export class ToolRouter {
  private lastOpenedApp: string | null = null;
  private lastContact: string | null = null;
  private lastReminderId: string | null = null;

  async handle(text: string): Promise<ToolResult> {
    const intent = intentEngine.classify(text);
    console.log('[ToolRouter] Intent:', intent);

    switch (intent.type) {
      case 'OPEN_APP':
        return this.handleOpenApp(intent);
      case 'OPEN_WEBSITE':
        return this.handleOpenWebsite(intent);
      case 'SEARCH':
        return this.handleSearch(intent);
      case 'SET_REMINDER':
        return this.handleSetReminder(intent);
      case 'LIST_REMINDERS':
        return this.handleListReminders();
      case 'CANCEL_REMINDER':
        return this.handleCancelReminder(intent);
      case 'SEND_MESSAGE':
        return this.handleSendMessage(intent);
      default:
        return {
          success: false,
          message: 'Boss, ye command samajh nahi aayi. Thoda clear bolo?',
          speak: 'Boss, ye command samajh nahi aayi. Thoda clear bolo?',
        };
    }
  }

  private async handleOpenApp(intent: ClassifiedIntent): Promise<ToolResult> {
    const name = intent.entities.appName;
    if (!name) {
      return {
        success: false,
        message: 'Boss, kaunsa app kholna hai?',
        speak: 'Boss, kaunsa app kholna hai?',
      };
    }

    const resolved = await bridge.resolveAppAlias(name);

    if (resolved.multiple && resolved.multiple.length > 1) {
      const names = resolved.multiple.map((a) => a.appName).join(', ');
      return {
        success: false,
        message: `Boss, do apps mil rahe hain: ${names}. Kaunsa wala kholun?`,
        speak: `Boss, do apps mil rahe hain. Kaunsa wala kholun?`,
        data: resolved.multiple,
      };
    }

    if (!resolved.packageName) {
      return {
        success: false,
        error: 'NOT_INSTALLED',
        message: `Boss, ${name} phone mein installed nahi hai.`,
        speak: `Boss, ${name} phone mein installed nahi hai. Play Store khol doon?`,
        data: { offerPlayStore: true, query: name },
      };
    }

    const result = await bridge.launchApp(resolved.packageName);

    if (result.success) {
      this.lastOpenedApp = resolved.packageName;
      return {
        success: true,
        message: `${resolved.appName || name} khol diya.`,
        speak: `Boss, ${resolved.appName || name} khol diya.`,
        data: result,
      };
    }

    return {
      success: false,
      error: result.error,
      message: result.message || `Boss, ${name} open nahi ho paya.`,
      speak: result.message || `Boss, ${name} open nahi ho paya.`,
    };
  }

  private async handleOpenWebsite(intent: ClassifiedIntent): Promise<ToolResult> {
    const url = intent.entities.url || 'https://www.google.com';
    return {
      success: true,
      message: `Website khol rahi hoon: ${url}`,
      speak: `Boss, website khol rahi hoon.`,
      data: { url },
    };
  }

  private async handleSearch(intent: ClassifiedIntent): Promise<ToolResult> {
    const query = intent.entities.query || '';
    const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    return {
      success: true,
      message: `Search kar rahi hoon: ${query}`,
      speak: `Boss, ${query} search kar rahi hoon.`,
      data: { url },
    };
  }

  private async handleSetReminder(intent: ClassifiedIntent): Promise<ToolResult> {
    let triggerTime = intent.entities.triggerTime;
    const message = intent.entities.message || 'Reminder';
    const title = intent.entities.title || message;

    if (!triggerTime) {
      return {
        success: false,
        error: 'MISSING_TIME',
        message: 'Boss, kitne baje ya kitni der baad reminder set karun?',
        speak: 'Boss, kitne baje ya kitni der baad reminder set karun?',
      };
    }

    const result = await bridge.createReminder({
      title,
      message,
      triggerTime,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      repeatRule: 'none',
    });

    if (result.needsExactAlarmPermission) {
      return {
        success: false,
        error: 'EXACT_ALARM_PERMISSION',
        message: result.message!,
        speak: result.message!,
        data: { needsPermission: true },
      };
    }

    if (result.success && result.reminder) {
      this.lastReminderId = result.reminder.id;
      const timeStr = new Date(result.reminder.triggerTime).toLocaleTimeString('hi-IN', {
        hour: 'numeric',
        minute: '2-digit',
      });
      return {
        success: true,
        message: `Reminder set ho gaya: ${timeStr} — ${message}`,
        speak: `Boss, ${timeStr} ka reminder set kar diya. ${message}`,
        data: result.reminder,
      };
    }

    return {
      success: false,
      error: result.error,
      message: result.message || 'Boss, alarm register nahi hua.',
      speak: result.message || 'Boss, alarm register nahi hua.',
    };
  }

  private async handleListReminders(): Promise<ToolResult> {
    const reminders = await bridge.listReminders();
    const enabled = reminders.filter((r) => r.enabled);

    if (enabled.length === 0) {
      return {
        success: true,
        message: 'Koi active reminder nahi hai.',
        speak: 'Boss, abhi koi active reminder nahi hai.',
        data: [],
      };
    }

    const lines = enabled.map((r) => {
      const t = new Date(r.triggerTime).toLocaleString('hi-IN', {
        hour: 'numeric',
        minute: '2-digit',
        day: 'numeric',
        month: 'short',
      });
      return `• ${t}: ${r.message}`;
    });

    return {
      success: true,
      message: `Active reminders:\n${lines.join('\n')}`,
      speak: `Boss, ${enabled.length} active reminders hain.`,
      data: enabled,
    };
  }

  private async handleCancelReminder(intent: ClassifiedIntent): Promise<ToolResult> {
    const reminders = await bridge.listReminders();
    const enabled = reminders.filter((r) => r.enabled);

    if (enabled.length === 0) {
      return {
        success: false,
        message: 'Koi reminder nahi mila cancel karne ke liye.',
        speak: 'Boss, koi reminder nahi mila.',
      };
    }

    let target: Reminder | null = null;
    const timeExpr = intent.entities.timeExpression;
    if (timeExpr) {
      const hourMatch = timeExpr.match(/(\d{1,2})/);
      if (hourMatch) {
        const h = parseInt(hourMatch[1], 10);
        target =
          enabled.find((r) => {
            const d = new Date(r.triggerTime);
            return d.getHours() === h || d.getHours() === h + 12;
          }) || null;
      }
    }

    if (!target && this.lastReminderId) {
      target = enabled.find((r) => r.id === this.lastReminderId) || null;
    }

    if (!target && enabled.length === 1) {
      target = enabled[0];
    }

    if (!target) {
      return {
        success: false,
        message: 'Boss, kis reminder ki baat kar rahe ho? Time batao ya list se choose karo.',
        speak: 'Boss, kis reminder ki baat kar rahe ho?',
        data: enabled,
      };
    }

    const res = await bridge.cancelReminder(target.id);
    if (res.success) {
      return {
        success: true,
        message: `Reminder cancel ho gaya: ${target.message}`,
        speak: `Boss, reminder cancel kar diya.`,
      };
    }
    return {
      success: false,
      message: res.message || 'Cancel nahi ho paya.',
      speak: res.message || 'Boss, cancel nahi ho paya.',
    };
  }

  private async handleSendMessage(intent: ClassifiedIntent): Promise<ToolResult> {
    const contact = intent.entities.contactName || this.lastContact;
    const msg = intent.entities.messageText;

    if (!contact) {
      return {
        success: false,
        message: 'Boss, kis ko message bhejna hai?',
        speak: 'Boss, kis ko message bhejna hai?',
      };
    }
    if (!msg) {
      return {
        success: false,
        message: 'Boss, kya message bhejuna hai?',
        speak: 'Boss, kya message bhejuna hai?',
      };
    }

    this.lastContact = contact;
    return {
      success: true,
      message: `Message ready: "${msg}" for ${contact}. App khol rahi hoon.`,
      speak: `Boss, ${contact} ko message ke liye app khol rahi hoon. Text: ${msg}`,
      data: { contact, message: msg, note: 'Full auto-send requires AccessibilityService permission' },
    };
  }

  async openPlayStoreFor(query: string): Promise<ToolResult> {
    const ok = await bridge.openPlayStore(undefined, query);
    return {
      success: ok,
      message: ok ? 'Play Store khol diya.' : 'Play Store open nahi ho paya.',
      speak: ok ? 'Boss, Play Store khol diya.' : 'Boss, Play Store open nahi ho paya.',
    };
  }

  async openExactAlarmSettings(): Promise<ToolResult> {
    const ok = await bridge.openExactAlarmSettings();
    return {
      success: ok,
      message: ok ? 'Settings khol diya. Exact alarm allow kar do.' : 'Settings open nahi ho paya.',
      speak: ok
        ? 'Boss, settings khol diya. Exact alarm permission allow kar dena.'
        : 'Boss, settings open nahi ho paya.',
    };
  }
}

export const toolRouter = new ToolRouter();
