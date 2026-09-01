import React, { useState, useRef, useEffect, useCallback } from 'react';
import { toolRouter } from './services/ToolRouter';
import { bridge } from './bridge/AndroidBridge';
import type { ToolResult } from './types';

interface ChatMessage {
  id: string;
  role: 'user' | 'hinata' | 'system';
  text: string;
  success?: boolean;
}

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '0',
      role: 'hinata',
      text: 'Namaste Boss! Main Hinata hoon — aapki Android assistant. App kholo, reminder set karo, jo chahiye bolo.',
    },
  ]);
  const [input, setInput] = useState('');
  const [listening, setListening] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [isNative, setIsNative] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    setIsNative(bridge.isNative());
    // Pre-load installed apps on native
    if (bridge.isNative()) {
      bridge.getInstalledApps().then((apps) => {
        console.log(`[Hinata] Discovered ${apps.length} apps`);
      });
    }
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const addMessage = useCallback((role: ChatMessage['role'], text: string, success?: boolean) => {
    setMessages((prev) => [
      ...prev,
      { id: Date.now().toString() + Math.random(), role, text, success },
    ]);
  }, []);

  const processCommand = useCallback(
    async (text: string) => {
      if (!text.trim()) return;
      addMessage('user', text);
      setProcessing(true);

      try {
        const result: ToolResult = await toolRouter.handle(text.trim());
        addMessage('hinata', result.speak || result.message || 'Done.', result.success);

        // Speak via native TTS when available
        if (result.speak) {
          await bridge.speak(result.speak);
        }

        // Handle follow-ups
        if (result.data && (result.data as any).offerPlayStore) {
          // User can say "haan" / "Play Store kholo"
        }
        if (result.data && (result.data as any).needsPermission) {
          // User can approve opening settings
        }
      } catch (e: any) {
        addMessage('hinata', `Boss, error aaya: ${e?.message || 'unknown'}`, false);
      } finally {
        setProcessing(false);
      }
    },
    [addMessage]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (processing || !input.trim()) return;
    const text = input;
    setInput('');
    processCommand(text);
  };

  const startListening = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      addMessage('system', 'Speech recognition is not supported in this browser.');
      return;
    }

    const recog = new SpeechRecognition();
    recog.lang = 'hi-IN';
    recog.interimResults = false;
    recog.maxAlternatives = 1;

    recog.onstart = () => setListening(true);
    recog.onend = () => setListening(false);
    recog.onerror = () => setListening(false);
    recog.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInput(transcript);
      processCommand(transcript);
    };

    recognitionRef.current = recog;
    recog.start();
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
    setListening(false);
  };

  return (
    <div className="app">
      <header className="header">
        <div className="logo">ヒ</div>
        <div>
          <h1>Hinata</h1>
          <p className="subtitle">
            {isNative ? '🟢 Android Native' : '🟡 Web Preview (native features limited)'}
          </p>
        </div>
      </header>

      <main className="chat">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`bubble ${m.role} ${m.success === false ? 'error' : ''} ${m.success === true ? 'ok' : ''}`}
          >
            {m.role === 'hinata' && <span className="name">Hinata</span>}
            <p>{m.text}</p>
          </div>
        ))}
        {processing && (
          <div className="bubble hinata thinking">
            <p>Soch rahi hoon…</p>
          </div>
        )}
        <div ref={bottomRef} />
      </main>

      <footer className="input-area">
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="WhatsApp kholo… / 8 baje reminder…"
            disabled={processing}
            autoComplete="off"
          />
          <button
            type="button"
            className={`mic ${listening ? 'active' : ''}`}
            onClick={listening ? stopListening : startListening}
            title="Voice"
          >
            {listening ? '⏹' : '🎤'}
          </button>
          <button type="submit" disabled={processing || !input.trim()}>
            ➤
          </button>
        </form>
        <div className="quick">
          {['WhatsApp kholo', 'YouTube kholo', '8 baje meeting yaad dila dena', 'Saare reminders batao'].map(
            (q) => (
              <button key={q} type="button" onClick={() => processCommand(q)} disabled={processing}>
                {q}
              </button>
            )
          )}
        </div>
      </footer>
    </div>
  );
}
