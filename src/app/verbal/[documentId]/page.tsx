"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import AudioBubble from "@/components/AudioBubble";

// ── Voice options ────────────────────────────────────────────────
const VOICES = [
  { id: "hudson_williams", label: "Hudson Williams" },

  { id: "male", label: "Male" },
  { id: "woman", label: "Woman" },
];

const RECORDER_MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
] as const;

const getSupportedRecorderMimeType = () => {
  if (typeof MediaRecorder === "undefined") return null;
  return (
    RECORDER_MIME_CANDIDATES.find((mimeType) =>
      MediaRecorder.isTypeSupported(mimeType)
    ) ?? null
  );
};

const getAudioFilenameForMimeType = (mimeType: string) => {
  if (mimeType.includes("mp4")) return "recording.mp4";
  if (mimeType.includes("mpeg")) return "recording.mp3";
  if (mimeType.includes("ogg")) return "recording.ogg";
  return "recording.webm";
};

type Mode = "user_explains" | "ai_quizzes";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function VerbalQuizPage() {
  const params = useParams();
  const documentId = params.documentId as string;

  // ── State ──────────────────────────────────────────────────────
  const [mode, setMode] = useState<Mode | null>(null);
  const [voiceId, setVoiceId] = useState(VOICES[0].id);
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentText, setCurrentText] = useState(""); // streaming AI text
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
  const streamMediaSourceRef = useRef<MediaSource | null>(null);
  const ttsSentenceQueueRef = useRef<string[]>([]);
  const isProcessingTTSRef = useRef(false);
  const voiceIdRef = useRef(VOICES[0].id);
  const recorderMimeTypeRef = useRef("audio/webm");

  // ── Scroll to bottom on new messages ───────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, currentText]);

  // ── Create persistent audio element ────────────────────────────
  useEffect(() => {
    const audio = new Audio();
    audio.addEventListener("ended", () => {
      setIsSpeaking(false);
      playNextInQueue();
    });
    audioElementRef.current = audio;
    return () => {
      audio.pause();
      audio.removeAttribute("src");
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const enqueueAudio = useCallback(
    (url: string) => {
      audioQueueRef.current.push(url);
      if (!isPlayingQueueRef.current) {
        isPlayingQueueRef.current = true;
        playNextInQueue();
      }
    },
    [playNextInQueue]
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
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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
    [processTTSQueue]
  );

  // ── Send message to LLM (streaming) ───────────────────────────
  const sendToLLM = useCallback(
    async (allMessages: Message[]) => {
      setIsStreaming(true);
      setCurrentText("");
      setError(null);

      try {
        const res = await fetch(`/api/verbal/${documentId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: allMessages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
            mode,
          }),
        });

        if (!res.ok) {
          throw new Error("Failed to get AI response");
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No stream");

        const decoder = new TextDecoder();
        let fullText = "";
        let sentenceBuffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              if (data === "[DONE]") continue;
              try {
                const parsed = JSON.parse(data);
                if (parsed.text) {
                  fullText += parsed.text;
                  sentenceBuffer += parsed.text;
                  setCurrentText(fullText);

                  // When we accumulate a sentence, send to TTS
                  const sentenceEnd = sentenceBuffer.match(
                    /[.!?]\s|[.!?]$/
                  );
                  if (sentenceEnd) {
                    const idx =
                      sentenceEnd.index! + sentenceEnd[0].length;
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
          { role: "assistant", content: fullText },
        ]);
        setCurrentText("");
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to get AI response"
        );
      } finally {
        setIsStreaming(false);
      }
    },
    [documentId, mode, speakText]
  );

  // ── Start recording ────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    let activeStream: MediaStream | null = null;

    try {
      setError(null);
      // Stop any playing audio
      if (audioElementRef.current) {
        audioElementRef.current.pause();
        audioElementRef.current.removeAttribute("src");
      }
      audioQueueRef.current = [];
      isPlayingQueueRef.current = false;
      setIsSpeaking(false);

      if (!navigator.mediaDevices?.getUserMedia) {
        setError("This browser does not support microphone recording.");
        return;
      }

      if (typeof MediaRecorder === "undefined") {
        setError("This browser does not support audio recording.");
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
        mediaRecorder.mimeType || preferredMimeType || "audio/webm";

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
          "audio/webm";
        const audioBlob = new Blob(audioChunksRef.current, {
          type: recordedMimeType,
        });

        // Send to STT
        setIsProcessing(true);
        try {
          const formData = new FormData();
          formData.append(
            "audio",
            audioBlob,
            getAudioFilenameForMimeType(recordedMimeType)
          );
          const sttRes = await fetch("/api/stt", {
            method: "POST",
            body: formData,
          });
          const sttData = await sttRes.json().catch(() => null);

          if (!sttRes.ok) {
            throw new Error(
              sttData?.error || "Speech recognition failed. Please try again."
            );
          }

          if (sttData?.text && sttData.text.trim()) {
            const userMsg: Message = {
              role: "user",
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
              : "Speech recognition failed. Please try again."
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
        if (err.name === "NotAllowedError" || err.name === "SecurityError") {
          setError(
            "Microphone access denied. Please allow microphone access and try again."
          );
          return;
        }
        if (err.name === "NotFoundError") {
          setError("No microphone found. Please connect a microphone and try again.");
          return;
        }
        if (err.name === "NotReadableError") {
          setError(
            "Microphone is busy or unavailable. Close other apps using it and try again."
          );
          return;
        }
      }

      setError("Unable to start audio recording. Please try again.");
    }
  }, [messages, sendToLLM]);

  // ── Stop recording ─────────────────────────────────────────────
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  }, []);

  // ── Start session ──────────────────────────────────────────────
  const startSession = useCallback(
    (selectedMode: Mode) => {
      setMode(selectedMode);
      setMessages([]);
      setCurrentText("");
      setError(null);

      // For AI quizzes mode, immediately get first question
      if (selectedMode === "ai_quizzes") {
        // Use a minimal trigger message to initiate
        const initMessages: Message[] = [
          { role: "user", content: "Start the quiz." },
        ];
        setMessages(initMessages);
        // Need to defer to let mode state update
        setTimeout(() => {
          sendToLLM(initMessages);
        }, 0);
      }
    },
    [sendToLLM]
  );

  // ── Mode selection screen ──────────────────────────────────────
  if (!mode) {
    return (
      <div className="min-h-screen px-6 py-12">
        <div className="mx-auto max-w-3xl">
          <Link
            href={`/documents/${documentId}`}
            className="mb-8 inline-flex items-center gap-2 text-sm text-zinc-500 transition-colors hover:text-zinc-300"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to document
          </Link>

          <div className="mb-10 animate-fade-in-up">
            <h1 className="mb-2 text-3xl font-bold gradient-text-indigo">
              Verbal Quiz
            </h1>
            <p className="text-zinc-500">
              Have a voice conversation with AI about your study material.
            </p>
            <div className="mt-3 glow-line-indigo w-20" />
          </div>

          {/* Voice selector */}
          <div className="mb-8 animate-fade-in-up delay-100" style={{ opacity: 0 }}>
            <label className="mb-3 block text-sm font-medium text-zinc-400">
              AI Voice
            </label>
            <div className="flex flex-wrap gap-2">
              {VOICES.map((v) => (
                <button
                  key={v.id}
                  onClick={() => setVoiceId(v.id)}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition-all ${
                    voiceId === v.id
                      ? "bg-purple-500/20 text-purple-300 ring-1 ring-purple-500/40"
                      : "glass text-zinc-400 hover:text-zinc-200 glass-hover"
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          {/* Mode cards */}
          <div className="grid gap-5 sm:grid-cols-2 animate-fade-in-up delay-200" style={{ opacity: 0 }}>
            {/* User Explains */}
            <button
              onClick={() => startSession("user_explains")}
              className="group relative overflow-hidden rounded-2xl glass p-6 text-left transition-all duration-300 glass-hover hover-glow-blue"
            >
              <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-gradient-to-br from-blue-500/20 to-cyan-500/20 opacity-50 blur-2xl transition-opacity duration-300 group-hover:opacity-100" />
              <div className="relative">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 text-blue-400">
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                </div>
                <h2 className="mb-1 text-lg font-semibold text-zinc-100">
                  You Explain
                </h2>
                <p className="text-sm text-zinc-500">
                  Explain a topic verbally. The AI will evaluate your
                  understanding and probe for gaps.
                </p>
              </div>
            </button>

            {/* AI Quizzes */}
            <button
              onClick={() => startSession("ai_quizzes")}
              className="group relative overflow-hidden rounded-2xl glass p-6 text-left transition-all duration-300 glass-hover hover-glow-purple"
            >
              <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-gradient-to-br from-purple-500/20 to-pink-500/20 opacity-50 blur-2xl transition-opacity duration-300 group-hover:opacity-100" />
              <div className="relative">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 text-purple-400">
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </div>
                <h2 className="mb-1 text-lg font-semibold text-zinc-100">
                  AI Quizzes You
                </h2>
                <p className="text-sm text-zinc-500">
                  The AI picks topics and asks you questions conversationally.
                  Answer verbally.
                </p>
              </div>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Active session screen ──────────────────────────────────────
  const isBusy = isProcessing || isStreaming;

  return (
    <div className="flex min-h-screen flex-col px-6 py-12">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => {
                setMode(null);
                if (audioElementRef.current) {
                  audioElementRef.current.pause();
                  audioElementRef.current.removeAttribute("src");
                }
                audioQueueRef.current = [];
                isPlayingQueueRef.current = false;
                setIsSpeaking(false);
              }}
              className="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-300"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className="text-lg font-semibold text-zinc-100">
                {mode === "user_explains" ? "You Explain" : "AI Quizzes You"}
              </h1>
              <p className="text-xs text-zinc-500">
                {mode === "user_explains"
                  ? "Explain any topic and get feedback"
                  : "Answer the AI's questions"}
              </p>
            </div>
          </div>

          {/* Voice switcher */}
          <div className="flex items-center gap-2">
            {VOICES.map((v) => (
              <button
                key={v.id}
                onClick={() => setVoiceId(v.id)}
                title={v.label}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition-all ${
                  voiceId === v.id
                    ? "bg-purple-500/20 text-purple-300 ring-1 ring-purple-500/40"
                    : "text-zinc-600 hover:text-zinc-400"
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto rounded-2xl glass p-5 mb-6">
          <div className="space-y-4">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${
                  msg.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-blue-500/15 text-blue-100"
                      : "bg-white/5 text-zinc-300"
                  }`}
                >
                  {/* Hide the "Start the quiz." trigger message */}
                  {msg.role === "user" && msg.content === "Start the quiz."
                    ? <span className="italic text-zinc-500">Session started</span>
                    : msg.content}
                </div>
              </div>
            ))}

            {/* Streaming text */}
            {currentText && (
              <div className="flex justify-start">
                <div className="max-w-[80%] rounded-2xl bg-white/5 px-4 py-3 text-sm leading-relaxed text-zinc-300">
                  {currentText}
                  <span className="ml-1 inline-block h-4 w-0.5 animate-pulse bg-purple-400" />
                </div>
              </div>
            )}

            {/* Processing indicator */}
            {isProcessing && (
              <div className="flex justify-center">
                <span className="rounded-full glass px-4 py-2 text-xs text-zinc-500">
                  Transcribing...
                </span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Audio bubble + controls */}
        <div className="flex flex-col items-center gap-4 pb-6">
          {error && (
            <p className="rounded-lg bg-red-500/10 px-4 py-2 text-xs text-red-400">
              {error}
            </p>
          )}

          <AudioBubble
            audioElement={audioElementRef.current}
            isSpeaking={isSpeaking}
            isRecording={isRecording}
            size={160}
          />

          {/* Record button */}
          <button
            onMouseDown={!isBusy ? startRecording : undefined}
            onMouseUp={isRecording ? stopRecording : undefined}
            onTouchStart={!isBusy ? startRecording : undefined}
            onTouchEnd={isRecording ? stopRecording : undefined}
            disabled={isBusy}
            className={`group relative flex h-16 w-16 items-center justify-center rounded-full transition-all duration-200 ${
              isRecording
                ? "bg-red-500/30 ring-2 ring-red-500 scale-110"
                : isBusy
                ? "bg-white/5 text-zinc-600 cursor-not-allowed"
                : "bg-white/10 text-zinc-300 hover:bg-white/15 hover:scale-105 active:scale-95"
            }`}
          >
            {isRecording ? (
              <div className="h-5 w-5 rounded-sm bg-red-400" />
            ) : (
              <svg
                className="h-6 w-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                />
              </svg>
            )}
          </button>

          <p className="text-xs text-zinc-600">
            {isRecording
              ? "Release to send"
              : isBusy
              ? "Processing..."
              : "Hold to speak"}
          </p>
        </div>
      </div>
    </div>
  );
}
