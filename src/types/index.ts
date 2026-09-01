/** Core types for Hinata Android Assistant */

export interface InstalledApp {
  packageName: string;
  appName: string;
  label: string;
  iconBase64?: string;
  isSystemApp: boolean;
  versionName?: string;
}

export interface AppLaunchResult {
  success: boolean;
  packageName?: string;
  appName?: string;
  error?: string;
  message?: string;
}

export interface Reminder {
  id: string;
  userId: string;
  title: string;
  message: string;
  triggerTime: number; // epoch ms
  timezone: string;
  repeatRule?: string; // e.g. "daily", "weekdays", "none"
  enabled: boolean;
  alarmId: number;
  createdAt: number;
  updatedAt: number;
}

export interface ReminderCreateRequest {
  title: string;
  message: string;
  triggerTime: number;
  timezone?: string;
  repeatRule?: string;
}

export interface ReminderResult {
  success: boolean;
  reminder?: Reminder;
  error?: string;
  message?: string;
  needsExactAlarmPermission?: boolean;
}

export interface AppStatus {
  packageName: string;
  isInstalled: boolean;
  isEnabled: boolean;
  versionName?: string;
}

export type IntentType =
  | 'OPEN_APP'
  | 'OPEN_WEBSITE'
  | 'SEARCH'
  | 'SET_REMINDER'
  | 'LIST_REMINDERS'
  | 'CANCEL_REMINDER'
  | 'SEND_MESSAGE'
  | 'UNKNOWN';

export interface ClassifiedIntent {
  type: IntentType;
  confidence: number;
  entities: {
    appName?: string;
    packageName?: string;
    url?: string;
    query?: string;
    timeExpression?: string;
    triggerTime?: number;
    reminderId?: string;
    contactName?: string;
    messageText?: string;
    message?: string;
    title?: string;
  };
  originalText: string;
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  message?: string;
  speak?: string; // text Hinata should speak
}

export interface MemoryItem {
  key: string;
  value: string;
  category: 'preference' | 'context' | 'contact' | 'fact';
  updatedAt: number;
}
