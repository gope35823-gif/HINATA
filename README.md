# Hinata — Smart Android Personal Assistant

Real Android app control + system-level alarms.  
**Not** a website pretending to control the phone.

## Architecture

```
                HINATA
                   │
             Gemini Live / Voice
                   │
             Intent Engine
                   │
             Memory Manager
                   │
              Tool Router
                   │
        ┌──────────┴──────────┐
        │                     │
 Android App Manager      Alarm Manager
        │                     │
 Installed Apps          AlarmManager
        │                BroadcastReceiver
        │                NotificationManager
        │                Foreground Service + TTS
        └──────────┬──────────┘
                   │
             Android System
```

### Stack

| Layer | Tech |
|-------|------|
| UI | React 18 + TypeScript + Vite |
| Hybrid bridge | Capacitor 6 |
| Native | Kotlin |
| App launch | `PackageManager` + `getLaunchIntentForPackage` |
| Alarms | `AlarmManager.setExactAndAllowWhileIdle` |
| Persistence | SQLite (`ReminderDatabase`) |
| Speech on alarm | Android `TextToSpeech` (independent of Gemini) |
| Reboot survival | `BOOT_COMPLETED` → re-register from DB |

## Features Implemented

### 1. Real App Launch
- `AppManagerPlugin` discovers installed apps via PackageManager
- Resolves aliases (`whatsapp`, `wa`, `discord`, `youtube`…) against **actually installed** packages
- Launches with real Android Intent — never opens a website unless user says “Web”
- If app missing → honest reply + optional Play Store offer

### 2. Smart Intent Understanding
- Hindi + English mixed commands
- Distinguishes:
  - `"WhatsApp kholo"` → installed app
  - `"WhatsApp Web kholo"` → browser
  - `"Google par Minecraft search karo"` → search
- Multiple matches → asks which one

### 3. Real System Alarms
- **No** `setTimeout` / `setInterval` / React state timers
- `AlarmManager` + `BroadcastReceiver` + `NotificationManager` + Foreground Service
- Exact-alarm permission check (Android 12+)
- Survives: app minimized, screen locked, process death, reboot
- On fire: native TTS speaks  
  *“Boss, aapne jo reminder set kiya tha, uska time ho gaya hai.”*  
  then the actual message

### 4. No Fake Success
Every tool path returns success **only** after the native call succeeds.

## Project Structure

```
hinata-android/
├── src/
│   ├── bridge/AndroidBridge.ts      # Capacitor plugin wrappers
│   ├── services/
│   │   ├── IntentEngine.ts          # NLU / classification
│   │   └── ToolRouter.ts            # Action planner + execution
│   ├── types/index.ts
│   ├── App.tsx                      # Voice + text UI
│   └── main.tsx
├── android/
│   └── app/src/main/
│       ├── java/com/hinata/assistant/
│       │   ├── MainActivity.kt
│       │   ├── plugins/
│       │   │   ├── AppManagerPlugin.kt
│       │   │   ├── AlarmManagerPlugin.kt
│       │   │   └── TtsPlugin.kt
│       │   ├── receivers/
│       │   │   ├── AlarmReceiver.kt
│       │   │   └── BootReceiver.kt
│       │   ├── services/
│       │   │   └── ReminderForegroundService.kt
│       │   └── db/
│       │       └── ReminderDatabase.kt
│       └── AndroidManifest.xml
├── capacitor.config.ts
├── package.json
└── README.md
```

## Build & Run

### Prerequisites
- Node 18+
- Android Studio (Hedgehog or newer)
- JDK 17
- Android device/emulator with API 26+

### Steps

```bash
# 1. Install JS deps
npm install

# 2. Build web assets
npm run build

# 3. Add Android platform (first time)
npx cap add android

# 4. Copy web + native plugins
npx cap sync android

# 5. Open in Android Studio
npx cap open android
```

In Android Studio:
1. Let Gradle sync finish
2. Ensure `MainActivity` registers the three plugins
3. Run on device/emulator

### Permissions to grant on device
- Notifications
- Exact alarms (Settings → Apps → Special app access → Alarms & reminders)
- (Optional) Query all packages for full app list on some OEMs

## Command Examples

| You say | Hinata does |
|---------|-------------|
| `WhatsApp kholo` | Launches installed WhatsApp |
| `WA kholo` | Same |
| `Discord chalao` | Launches Discord if installed |
| `YouTube kholo` | Launches YouTube app |
| `WhatsApp Web kholo` | Opens web.whatsapp.com |
| `Telegram kholo` (not installed) | “Boss, Telegram phone mein installed nahi hai. Play Store khol doon?” |
| `8 baje mujhe meeting yaad dila dena` | Registers exact AlarmManager alarm |
| `30 minute baad reminder karna` | Relative alarm |
| `Saare reminders batao` | Lists from SQLite |
| `8 baje wala reminder cancel kar do` | Cancels matching alarm |

## Gemini Live Integration Point

The `ToolRouter.handle(text)` is the single entry for any voice/text pipeline.

Wire Gemini Live function-calling / tool use to:

```ts
import { toolRouter } from './services/ToolRouter';

// Inside your Gemini tool handler:
const result = await toolRouter.handle(userUtterance);
// result.speak → feed back to TTS or Gemini response
```

Gemini does **not** need to stay connected for alarms — the native `AlarmReceiver` + `ReminderForegroundService` handle speech independently.

## Important Notes

1. **QUERY_ALL_PACKAGES** — declared for app discovery. On Play Store distribution you may need a declaration form; for sideload / internal use it works.
2. **Exact alarms** — Android 12+ requires user grant. Hinata detects this and offers to open the settings screen.
3. **Message sending** — Full auto-type into WhatsApp requires AccessibilityService (heavily restricted). Current implementation opens the app + prepares context; full automation is left as an optional future Accessibility module.
4. **Web preview** — Running `npm run dev` works for UI + intent classification, but app launch and real alarms only function inside the Capacitor Android build.

## License

Private / personal assistant project.
