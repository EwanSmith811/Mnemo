'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import AudioBubble from '@/components/AudioBubble';
import { BackLink, Icon, stagger } from '@/components/ui';

// ── Voice options ────────────────────────────────────────────────
const VOICES = [
  { id: 'alloy', label: 'Alloy (AI voice)' },

  { id: 'male', label: 'Onyx (AI voice)' },
  { id: 'woman', label: 'Coral (AI voice)' },
];

const RECORDER_MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/mpeg',
] as const;

const getSupportedRecorderMimeType = () => {
  if (typeof MediaRecorder === 'undefined') return null;
  return (
    RECORDER_MIME_CANDIDATES.find((mimeType) =>
      MediaRecorder.isTypeSupported(mimeType),
    ) ?? null
  );
};

const getAudioFilenameForMimeType = (mimeType: string) => {
  if (mimeType.includes('mp4')) return 'recording.mp4';
  if (mimeType.includes('mpeg')) return 'recording.mp3';
  if (mimeType.includes('ogg')) return 'recording.ogg';
  return 'recording.webm';
};

type Mode = 'user_explains' | 'ai_quizzes';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function VerbalQuizPage() {
  const params = useParams();
  const documentId = params.documentId as string;

  // ── State ──────────────────────────────────────────────────────
  const [mode, setMode] = useState<Mode | null>(null);
  const [voiceId, setVoiceId] = useState(VOICES[0].id);
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentText, setCurrentText] = useState(''); // streaming AI text
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false); // STT in progress
  const [isStreaming, setIsStreaming] = useState(false); // LLM streaming
  const [error, setError] = useState<string | null>(null);

  // ── Refs ────────────────────────────────────────────────────────
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const audioQueueRef = useRef<string[]>([]);
  const isPlayingQueueRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const ttsSentenceQueueRef = useRef<string[]>([]);
  const isProcessingTTSRef = useRef(false);
  const voiceIdRef = useRef(VOICES[0].id);
  const recorderMimeTypeRef = useRef('audio/webm');

  // ── Scroll to bottom on new messages ───────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentText]);

  // ── Audio queue management ─────────────────────────────────────
  const playNextInQueue = useCallback(() => {
    const queue = audioQueueRef.current;
    if (queue.length === 0) {
      isPlayingQueueRef.current = false;
      return;
    }
    const nextUrl = queue.shift()!;
    const audio = audioElementRef.current;
    if (audio) {
      audio.src = nextUrl;
      audio.play().catch(() => {});
      setIsSpeaking(true);
    }
  }, []);

  // ── Create persistent audio element ────────────────────────────
  useEffect(() => {
    const audio = new Audio();
    audio.addEventListener('ended', () => {
      setIsSpeaking(false);
      playNextInQueue();
    });
    audioElementRef.current = audio;
    return () => {
      audio.pause();
      audio.removeAttribute('src');
    };
  }, [playNextInQueue]);

  const enqueueAudio = useCallback(
    (url: string) => {
      audioQueueRef.current.push(url);
      if (!isPlayingQueueRef.current) {
        isPlayingQueueRef.current = true;
        playNextInQueue();
      }
    },
    [playNextInQueue],
  );

  // Keep voiceIdRef in sync
  useEffect(() => {
    voiceIdRef.current = voiceId;
  }, [voiceId]);

  // ── TTS: sequential queue to preserve sentence order ───────────
  const processTTSQueue = useCallback(async () => {
    if (isProcessingTTSRef.current) return;
    isProcessingTTSRef.current = true;
    while (ttsSentenceQueueRef.current.length > 0) {
      const text = ttsSentenceQueueRef.current.shift()!;
      if (!text.trim()) continue;
      try {
        const res = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, voiceId: voiceIdRef.current }),
        });
        if (!res.ok) continue;
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        enqueueAudio(url);
      } catch {
        // Silently fail TTS — text still shows
      }
    }
    isProcessingTTSRef.current = false;
  }, [enqueueAudio]);

  const speakText = useCallback(
    (text: string) => {
      if (!text.trim()) return;
      ttsSentenceQueueRef.current.push(text);
      processTTSQueue();
    },
    [processTTSQueue],
  );

  // ── Send message to LLM (streaming) ───────────────────────────
  const sendToLLM = useCallback(
    async (allMessages: Message[], activeMode: Mode | null = mode) => {
      setIsStreaming(true);
      setCurrentText('');
      setError(null);

      try {
        const res = await fetch(`/api/verbal/${documentId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: allMessages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
            mode: activeMode,
          }),
        });

        if (!res.ok) {
          throw new Error('Mnemo could not respond. Please try again.');
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error('No stream');

        const decoder = new TextDecoder();
        let fullText = '';
        let sentenceBuffer = '';
        let eventBuffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          eventBuffer += decoder.decode(value, { stream: true });
          const lines = eventBuffer.split('\n');
          eventBuffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;
              try {
                const parsed = JSON.parse(data);
                if (parsed.text) {
                  fullText += parsed.text;
                  sentenceBuffer += parsed.text;
                  setCurrentText(fullText);

                  // When we accumulate a sentence, send to TTS
                  const sentenceEnd = sentenceBuffer.match(/[.!?]\s|[.!?]$/);
                  if (sentenceEnd) {
                    const idx = sentenceEnd.index! + sentenceEnd[0].length;
                    const sentence = sentenceBuffer.slice(0, idx);
                    sentenceBuffer = sentenceBuffer.slice(idx);
                    speakText(sentence);
                  }
                }
              } catch {
                // skip bad JSON
              }
            }
          }
        }

        // Flush remaining text to TTS
        if (sentenceBuffer.trim()) {
          speakText(sentenceBuffer.trim());
        }

        // Add assistant message to history
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: fullText },
        ]);
        setCurrentText('');
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to get AI response',
        );
      } finally {
        setIsStreaming(false);
      }
    },
    [documentId, mode, speakText],
  );

  // ── Start recording ────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    let activeStream: MediaStream | null = null;

    try {
      setError(null);
      // Stop any playing audio
      if (audioElementRef.current) {
        audioElementRef.current.pause();
        audioElementRef.current.removeAttribute('src');
      }
      audioQueueRef.current = [];
      isPlayingQueueRef.current = false;
      setIsSpeaking(false);

      if (!navigator.mediaDevices?.getUserMedia) {
        setError('This browser does not support microphone recording.');
        return;
      }

      if (typeof MediaRecorder === 'undefined') {
        setError('This browser does not support audio recording.');
        return;
      }

      activeStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
          channelCount: 1,
        },
      });

      const preferredMimeType = getSupportedRecorderMimeType();
      let mediaRecorder: MediaRecorder;
      if (preferredMimeType) {
        try {
          mediaRecorder = new MediaRecorder(activeStream, {
            mimeType: preferredMimeType,
            audioBitsPerSecond: 128000,
          });
        } catch {
          mediaRecorder = new MediaRecorder(activeStream);
        }
      } else {
        mediaRecorder = new MediaRecorder(activeStream);
      }

      recorderMimeTypeRef.current =
        mediaRecorder.mimeType || preferredMimeType || 'audio/webm';

      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        // Stop all tracks
        activeStream?.getTracks().forEach((t) => t.stop());
        activeStream = null;

        const recordedMimeType =
          audioChunksRef.current[0]?.type ||
          recorderMimeTypeRef.current ||
          'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, {
          type: recordedMimeType,
        });

        // Send to STT
        setIsProcessing(true);
        try {
          const formData = new FormData();
          formData.append(
            'audio',
            audioBlob,
            getAudioFilenameForMimeType(recordedMimeType),
          );
          const sttRes = await fetch('/api/stt', {
            method: 'POST',
            body: formData,
          });
          const sttData = await sttRes.json().catch(() => null);

          if (!sttRes.ok) {
            throw new Error(
              sttData?.error || 'Speech recognition failed. Please try again.',
            );
          }

          if (sttData?.text && sttData.text.trim()) {
            const userMsg: Message = {
              role: 'user',
              content: sttData.text.trim(),
            };
            const updatedMessages = [...messages, userMsg];
            setMessages(updatedMessages);
            // Send to LLM
            sendToLLM(updatedMessages);
          } else {
            setError("Couldn't detect speech. Please try again.");
          }
        } catch (err) {
          setError(
            err instanceof Error
              ? err.message
              : 'Speech recognition failed. Please try again.',
          );
        } finally {
          setIsProcessing(false);
        }
      };

      mediaRecorder.start(100); // Request data every 100ms for reliable capture
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
    } catch (err) {
      activeStream?.getTracks().forEach((t) => t.stop());

      if (err instanceof DOMException) {
        if (err.name === 'NotAllowedError' || err.name === 'SecurityError') {
          setError(
            'Microphone access denied. Please allow microphone access and try again.',
          );
          return;
        }
        if (err.name === 'NotFoundError') {
          setError(
            'No microphone found. Please connect a microphone and try again.',
          );
          return;
        }
        if (err.name === 'NotReadableError') {
          setError(
            'Microphone is busy or unavailable. Close other apps using it and try again.',
          );
          return;
        }
      }

      setError('Unable to start audio recording. Please try again.');
    }
  }, [messages, sendToLLM]);

  // ── Stop recording ─────────────────────────────────────────────
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  }, []);

  // ── Start session ──────────────────────────────────────────────
  const startSession = useCallback(
    (selectedMode: Mode) => {
      setMode(selectedMode);
      setMessages([]);
      setCurrentText('');
      setError(null);

      // For AI quizzes mode, immediately get first question
      if (selectedMode === 'ai_quizzes') {
        // Use a minimal trigger message to initiate
        const initMessages: Message[] = [
          { role: 'user', content: 'Start the quiz.' },
        ];
        setMessages(initMessages);
        void sendToLLM(initMessages, selectedMode);
      }
    },
    [sendToLLM],
  );

  const stopAudio = () => {
    audioElementRef.current?.pause();
    audioElementRef.current?.removeAttribute('src');
    audioQueueRef.current = [];
    isPlayingQueueRef.current = false;
    setIsSpeaking(false);
  };

  if (!mode)
    return (
      <main className="page is-reading voice-setup">
        <BackLink href={`/documents/${documentId}`}>Study plan</BackLink>
        <header className="page-head">
          <div>
            <h1>
              Say it <em>out loud.</em>
            </h1>
            <p className="lede">
              If you can explain it clearly without notes, you understand it. If
              you stumble, you’ve found exactly what to study next.
            </p>
          </div>
        </header>
        <div className="voice-modes">
          <button
            className="card voice-mode rise"
            onClick={() => startSession('user_explains')}
          >
            <span className="voice-mode-art" aria-hidden>
              <i />
              <i />
              <i />
              <i />
              <i />
            </span>
            <span className="eyebrow">You talk</span>
            <h2>Teach it back</h2>
            <p>
              Pick a topic and explain it as if to a classmate. Mnemo listens,
              then tells you what was right, what was missing, and what to fix.
            </p>
            <span className="arrow" aria-hidden>
              ↗
            </span>
          </button>
          <button
            className="card voice-mode rise"
            style={stagger(1)}
            onClick={() => startSession('ai_quizzes')}
          >
            <span className="voice-mode-art is-question" aria-hidden>
              ?
            </span>
            <span className="eyebrow">Mnemo asks</span>
            <h2>Quiz me</h2>
            <p>
              Mnemo asks questions from your deck one at a time and responds to
              each answer, like a study partner with the notes in front of them.
            </p>
            <span className="arrow" aria-hidden>
              ↗
            </span>
          </button>
        </div>
        <div className="voice-voices">
          <span className="eyebrow">Voice</span>
          <div className="segmented">
            {VOICES.map((v) => (
              <button
                key={v.id}
                aria-pressed={voiceId === v.id}
                onClick={() => setVoiceId(v.id)}
              >
                {v.label}
              </button>
            ))}
          </div>
          <small className="muted">
            Spoken replies use an AI-generated voice.
          </small>
        </div>
      </main>
    );

  const isBusy = isProcessing || isStreaming;
  const state = isRecording
    ? 'Listening… tap to finish'
    : isProcessing
      ? 'Transcribing what you said'
      : isStreaming
        ? 'Mnemo is thinking'
        : isSpeaking
          ? 'Mnemo is speaking · tap to interrupt'
          : 'Tap to talk';
  return (
    <main className="voice-session">
      <div className="voice-top">
        <button
          className="ghost-button is-small"
          onClick={() => {
            stopRecording();
            stopAudio();
            setMode(null);
          }}
        >
          ← End session
        </button>
        <span className="eyebrow">
          {mode === 'user_explains' ? 'Teach it back' : 'Quiz me'}
        </span>
        <div className="segmented">
          {VOICES.map((v) => (
            <button
              key={v.id}
              aria-pressed={voiceId === v.id}
              onClick={() => setVoiceId(v.id)}
            >
              {v.label.split(' ')[0]}
            </button>
          ))}
        </div>
      </div>
      <div className="voice-thread">
        {messages
          .filter(
            (m, i) =>
              !(
                i === 0 &&
                m.role === 'user' &&
                m.content === 'Start the quiz.'
              ),
          )
          .map((m, i) => (
            <div key={i} className={`chat-message is-${m.role}`}>
              <p>{m.content}</p>
            </div>
          ))}
        {currentText && (
          <div className="chat-message is-assistant">
            <p>
              {currentText}
              <span className="voice-caret" />
            </p>
          </div>
        )}
        {!messages.length && !currentText && (
          <p className="voice-prompt">
            {mode === 'user_explains'
              ? 'Pick any idea from the deck. Tap the button and start explaining.'
              : 'Getting your first question ready…'}
          </p>
        )}
        <div ref={messagesEndRef} />
      </div>
      <div className="voice-controls">
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        <button
          className={`voice-record ${isRecording ? 'is-recording' : ''} ${isSpeaking ? 'is-speaking' : ''}`}
          disabled={isBusy && !isRecording}
          aria-pressed={isRecording}
          aria-label={isRecording ? 'Stop recording' : 'Start recording'}
          onClick={() => {
            if (isRecording) stopRecording();
            else {
              stopAudio();
              void startRecording();
            }
          }}
        >
          <AudioBubble
            isSpeaking={isSpeaking}
            isRecording={isRecording}
            size={168}
          />
          <span className="voice-record-icon">
            <Icon name={isRecording ? 'stop' : 'mic'} size={26} />
          </span>
        </button>
        <p className="voice-state" role="status">
          {isBusy && <span className="loading-spinner" />} {state}
        </p>
      </div>
    </main>
  );
}
