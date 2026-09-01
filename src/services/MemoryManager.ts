/**
 * MemoryManager — Lightweight persistent preferences & context.
 * Uses localStorage on web; on native can be extended with Capacitor Preferences / SQLite.
 * Only relevant memories are retrieved — never dump entire store to Gemini.
 */

import type { MemoryItem } from '../types';

const STORAGE_KEY = 'hinata_memory_v1';

export class MemoryManager {
  private cache: Map<string, MemoryItem> = new Map();

  constructor() {
    this.load();
  }

  private load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const items: MemoryItem[] = JSON.parse(raw);
        items.forEach((i) => this.cache.set(i.key, i));
      }
    } catch {
      // ignore
    }
  }

  private persist() {
    try {
      const items = Array.from(this.cache.values());
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // ignore
    }
  }

  set(key: string, value: string, category: MemoryItem['category'] = 'preference') {
    this.cache.set(key, {
      key,
      value,
      category,
      updatedAt: Date.now(),
    });
    this.persist();
  }

  get(key: string): string | null {
    return this.cache.get(key)?.value ?? null;
  }

  /** Retrieve only memories relevant to a query (simple keyword match) */
  retrieveRelevant(query: string, limit = 5): MemoryItem[] {
    const q = query.toLowerCase();
    const scored = Array.from(this.cache.values())
      .map((m) => {
        let score = 0;
        if (m.key.toLowerCase().includes(q)) score += 3;
        if (m.value.toLowerCase().includes(q)) score += 2;
        if (q.includes(m.key.toLowerCase())) score += 2;
        return { m, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((x) => x.m);
    return scored;
  }

  getPreferences(): Record<string, string> {
    const prefs: Record<string, string> = {};
    this.cache.forEach((m) => {
      if (m.category === 'preference') prefs[m.key] = m.value;
    });
    return prefs;
  }

  // Seed defaults
  ensureDefaults() {
    if (!this.get('preferredLanguage')) this.set('preferredLanguage', 'Hindi', 'preference');
    if (!this.get('assistantName')) this.set('assistantName', 'Hinata', 'preference');
    if (!this.get('preferredVoice')) this.set('preferredVoice', 'female', 'preference');
  }
}

export const memory = new MemoryManager();
memory.ensureDefaults();
