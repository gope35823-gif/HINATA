/**
 * IntentEngine — Understands natural Hindi/English mixed commands
 * and classifies them into actionable intents.
 *
 * Does NOT execute anything. Only classifies + extracts entities.
 */

import type { ClassifiedIntent, IntentType } from '../types';

const APP_OPEN_PATTERNS = [
  /(?:kholo|khole|open|chalao|chalu|on\s*karo|start|launch)\s*(?:karo|do|kar)?\s*$/i,
  /^(?:kholo|open|chalao)\s+/i,
  /\s+(?:kholo|open|chalao|chalu\s*karo)$/i,
];

const WEBSITE_HINTS = ['web', 'website', 'browser', 'site', 'online'];
const SEARCH_HINTS = ['search', 'google par', 'google pe', 'dhoondo', 'find', 'khojo'];

const TIME_PATTERNS = [
  /(\d{1,2})\s*(?:baje|o'?clock|am|pm)/i,
  /(\d{1,2}):(\d{2})\s*(am|pm)?/i,
  /(\d+)\s*(?:minute|min|mins|ghante|hour|hours)\s*(?:baad|later|after)/i,
  /(?:kal|tomorrow)\s*(?:subah|shaam|raat|morning|evening|night)?\s*(\d{1,2})?/i,
  /(?:aaj|today)\s*(?:shaam|raat|subah)?\s*(\d{1,2})?/i,
];

const REMINDER_KEYWORDS = [
  'yaad dila', 'reminder', 'alarm', 'yaad dilana', 'set kar', 'laga dena',
  'yaad rakh', 'notify', 'alert', 'wake', 'uthana', 'jagana',
];

const CANCEL_KEYWORDS = ['cancel', 'band kar', 'delete', 'hatado', 'remove', 'hata do'];
const LIST_KEYWORDS = ['saare reminder', 'list reminder', 'reminders batao', 'kitne reminder', 'show reminder'];

export class IntentEngine {
  classify(text: string): ClassifiedIntent {
    const original = text.trim();
    const lower = original.toLowerCase();

    // 1. List reminders
    if (LIST_KEYWORDS.some((k) => lower.includes(k))) {
      return {
        type: 'LIST_REMINDERS',
        confidence: 0.95,
        entities: {},
        originalText: original,
      };
    }

    // 2. Cancel reminder
    if (CANCEL_KEYWORDS.some((k) => lower.includes(k)) && (lower.includes('reminder') || lower.includes('alarm'))) {
      const timeMatch = lower.match(/(\d{1,2})\s*baje/);
      return {
        type: 'CANCEL_REMINDER',
        confidence: 0.9,
        entities: {
          timeExpression: timeMatch ? timeMatch[0] : undefined,
        },
        originalText: original,
      };
    }

    // 3. Set reminder / alarm
    if (REMINDER_KEYWORDS.some((k) => lower.includes(k))) {
      const timeExpr = this.extractTimeExpression(lower);
      const triggerTime = this.parseTimeToEpoch(timeExpr, lower);
      return {
        type: 'SET_REMINDER',
        confidence: 0.92,
        entities: {
          timeExpression: timeExpr || undefined,
          triggerTime: triggerTime || undefined,
          message: this.extractReminderMessage(original),
          title: this.extractReminderTitle(original),
        },
        originalText: original,
      };
    }

    // 4. Website explicit
    if (WEBSITE_HINTS.some((h) => lower.includes(h)) && !lower.includes('whatsapp web') === false) {
      // "WhatsApp Web kholo" → website
      if (lower.includes('web') || lower.includes('website')) {
        return {
          type: 'OPEN_WEBSITE',
          confidence: 0.9,
          entities: {
            url: this.guessWebsiteUrl(lower),
            appName: this.extractAppName(lower),
          },
          originalText: original,
        };
      }
    }

    // Special: WhatsApp Web
    if (lower.includes('whatsapp web') || lower.includes('wa web')) {
      return {
        type: 'OPEN_WEBSITE',
        confidence: 0.95,
        entities: { url: 'https://web.whatsapp.com', appName: 'WhatsApp Web' },
        originalText: original,
      };
    }

    // 5. Search
    if (SEARCH_HINTS.some((h) => lower.includes(h))) {
      const query = this.extractSearchQuery(original);
      return {
        type: 'SEARCH',
        confidence: 0.88,
        entities: { query },
        originalText: original,
      };
    }

    // 6. Open app (most common)
    if (APP_OPEN_PATTERNS.some((p) => p.test(lower)) || this.looksLikeAppOpen(lower)) {
      const appName = this.extractAppName(lower);
      return {
        type: 'OPEN_APP',
        confidence: 0.9,
        entities: { appName },
        originalText: original,
      };
    }

    // 7. Send message context (depends on previous context)
    if (lower.includes('message') || lower.includes('bol do') || lower.includes('bhej do') || lower.includes('msg')) {
      return {
        type: 'SEND_MESSAGE',
        confidence: 0.75,
        entities: {
          contactName: this.extractContactName(original),
          messageText: this.extractMessageText(original),
        },
        originalText: original,
      };
    }

    return {
      type: 'UNKNOWN',
      confidence: 0.3,
      entities: {},
      originalText: original,
    };
  }

  private looksLikeAppOpen(lower: string): boolean {
    const appWords = [
      'whatsapp', 'discord', 'youtube', 'instagram', 'telegram', 'spotify',
      'camera', 'gallery', 'settings', 'phone', 'chrome', 'gmail', 'maps',
      'wa', 'ig', 'yt', 'tg',
    ];
    return appWords.some((a) => lower.includes(a)) &&
      (lower.includes('khol') || lower.includes('open') || lower.includes('chala') || lower.includes('start'));
  }

  private extractAppName(lower: string): string {
    const known = [
      'whatsapp', 'discord', 'youtube', 'instagram', 'telegram', 'spotify',
      'camera', 'gallery', 'settings', 'phone', 'chrome', 'gmail', 'maps',
      'photos', 'clock', 'calculator', 'files', 'play store', 'playstore',
      'messages', 'contacts', 'wa', 'ig', 'yt', 'tg',
    ];
    for (const k of known) {
      if (lower.includes(k)) return k;
    }
    // Fallback: take first significant word before action verb
    const cleaned = lower
      .replace(/(?:kholo|khole|open|chalao|chalu|on\s*karo|start|launch|karo|do|kar)/gi, '')
      .trim();
    return cleaned.split(/\s+/)[0] || cleaned;
  }

  private extractTimeExpression(lower: string): string | null {
    for (const p of TIME_PATTERNS) {
      const m = lower.match(p);
      if (m) return m[0];
    }
    // "30 minute baad"
    const rel = lower.match(/(\d+)\s*(?:minute|min|mins|ghante|hour|hours)\s*(?:baad|later|after)/i);
    if (rel) return rel[0];
    return null;
  }

  private parseTimeToEpoch(expr: string | null, full: string): number | null {
    if (!expr) return null;
    const now = new Date();

    // Relative: "30 minute baad"
    const relMin = full.match(/(\d+)\s*(?:minute|min|mins)\s*(?:baad|later|after)/i);
    if (relMin) {
      return now.getTime() + parseInt(relMin[1], 10) * 60 * 1000;
    }
    const relHr = full.match(/(\d+)\s*(?:ghante|hour|hours)\s*(?:baad|later|after)/i);
    if (relHr) {
      return now.getTime() + parseInt(relHr[1], 10) * 60 * 60 * 1000;
    }

    // Absolute: "8 baje"
    const baje = full.match(/(\d{1,2})\s*baje/i);
    if (baje) {
      let hour = parseInt(baje[1], 10);
      // Heuristic: if past, assume next day or PM
      const target = new Date(now);
      target.setSeconds(0, 0);
      target.setMinutes(0);
      if (hour <= 12 && now.getHours() >= hour) {
        // could be PM
        if (hour < 12) hour += 12;
      }
      target.setHours(hour);
      if (target.getTime() <= now.getTime()) {
        target.setDate(target.getDate() + 1);
      }
      // "kal"
      if (full.includes('kal') || full.includes('tomorrow')) {
        target.setDate(now.getDate() + 1);
        target.setHours(hour > 12 ? hour : hour); // keep
      }
      return target.getTime();
    }

    // HH:MM
    const hm = full.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
    if (hm) {
      let h = parseInt(hm[1], 10);
      const m = parseInt(hm[2], 10);
      if (hm[3]?.toLowerCase() === 'pm' && h < 12) h += 12;
      if (hm[3]?.toLowerCase() === 'am' && h === 12) h = 0;
      const target = new Date(now);
      target.setHours(h, m, 0, 0);
      if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1);
      return target.getTime();
    }

    return null;
  }

  private extractReminderMessage(text: string): string {
    // Remove time and reminder keywords, keep the rest as message
    let msg = text
      .replace(/(?:yaad dila|reminder|alarm|yaad dilana|set kar|laga dena|yaad rakh).*/i, '')
      .replace(/\d{1,2}\s*baje/i, '')
      .replace(/\d+\s*(?:minute|min|ghante|hour).*/i, '')
      .replace(/(?:kal|aaj|tomorrow|today|subah|shaam|raat)/gi, '')
      .trim();
    if (!msg || msg.length < 2) {
      // Try after "ki" or "ke liye"
      const after = text.match(/(?:ki|ke liye|about)\s+(.+)/i);
      if (after) msg = after[1].trim();
    }
    return msg || 'Reminder';
  }

  private extractReminderTitle(text: string): string {
    const msg = this.extractReminderMessage(text);
    return msg.length > 40 ? msg.slice(0, 40) + '…' : msg;
  }

  private guessWebsiteUrl(lower: string): string {
    if (lower.includes('whatsapp')) return 'https://web.whatsapp.com';
    if (lower.includes('youtube')) return 'https://www.youtube.com';
    if (lower.includes('instagram')) return 'https://www.instagram.com';
    if (lower.includes('discord')) return 'https://discord.com/app';
    return 'https://www.google.com';
  }

  private extractSearchQuery(text: string): string {
    return text
      .replace(/(?:google par|google pe|search|dhoondo|find|khojo)/gi, '')
      .replace(/(?:karo|do|kar)/gi, '')
      .trim();
  }

  private extractContactName(text: string): string | undefined {
    const m = text.match(/(?:ko|to)\s+([A-Za-z\u0900-\u097F]+)/i);
    return m ? m[1] : undefined;
  }

  private extractMessageText(text: string): string | undefined {
    const m = text.match(/(?:ki|that|bol do|bhej do|msg)\s+(.+)/i);
    return m ? m[1].trim() : undefined;
  }
}

export const intentEngine = new IntentEngine();
