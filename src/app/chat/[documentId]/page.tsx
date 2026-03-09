"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { Document } from "@/types";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  updated_at: string;
}

export default function ChatPage() {
  const params = useParams();
  const documentId = params.documentId as string;

  const [doc, setDoc] = useState<Document | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isDocLoading, setIsDocLoading] = useState(true);

  // Conversation state
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvoId, setActiveConvoId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load document info + conversation list on mount
  useEffect(() => {
    async function loadDoc() {
      try {
        const res = await fetch("/api/documents");
        const docs: Document[] = await res.json();
        setDoc(docs.find((d) => d.id === documentId) || null);
      } finally {
        setIsDocLoading(false);
      }
    }
    loadDoc();
  }, [documentId]);

  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch(`/api/chat/${documentId}/conversations`);
      if (res.ok) {
        const data: Conversation[] = await res.json();
        setConversations(data);
      }
    } catch {
      // silently fail
    }
  }, [documentId]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Derive a title from the first user message
  function deriveTitle(msgs: ChatMessage[]): string {
    const first = msgs.find((m) => m.role === "user");
    if (!first) return "New conversation";
    return first.content.length > 50 ? first.content.slice(0, 50) + "..." : first.content;
  }

  // Save or update the current conversation
  async function saveConversation(msgs: ChatMessage[], convoId: string | null): Promise<string | null> {
    try {
      const res = await fetch(`/api/chat/${documentId}/conversations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: convoId,
          title: deriveTitle(msgs),
          messages: msgs,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        loadConversations();
        return data.id;
      }
    } catch {
      // silently fail
    }
    return convoId;
  }

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    const userMessage: ChatMessage = { role: "user", content: trimmed };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch(`/api/chat/${documentId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: updatedMessages }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to get response");
      }

      const data = await res.json();
      const finalMessages = [...updatedMessages, { role: "assistant" as const, content: data.reply }];
      setMessages(finalMessages);

      // Save conversation after successful exchange
      const savedId = await saveConversation(finalMessages, activeConvoId);
      if (savedId && !activeConvoId) {
        setActiveConvoId(savedId);
      }
    } catch (err) {
      setMessages([
        ...updatedMessages,
        { role: "assistant", content: `Error: ${err instanceof Error ? err.message : "Something went wrong. Please try again."}` },
      ]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleNewChat = () => {
    setMessages([]);
    setActiveConvoId(null);
    setSidebarOpen(false);
    inputRef.current?.focus();
  };

  const handleLoadConversation = (convo: Conversation) => {
    setMessages(convo.messages);
    setActiveConvoId(convo.id);
    setSidebarOpen(false);
  };

  const handleDeleteConversation = async (convoId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch(`/api/chat/${documentId}/conversations?id=${convoId}`, { method: "DELETE" });
      if (activeConvoId === convoId) {
        handleNewChat();
      }
      loadConversations();
    } catch {
      // silently fail
    }
  };

  if (isDocLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="relative mx-auto mb-4 h-10 w-10">
            <div className="absolute inset-0 rounded-full border-2 border-white/10" />
            <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-purple-400" />
          </div>
          <p className="text-zinc-500">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen" style={{ background: "#050510" }}>
      {/* Sidebar overlay on mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col lg:relative lg:z-auto transition-transform duration-200 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
        style={{
          backgroundColor: "rgba(5, 5, 16, 0.98)",
          borderRight: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        {/* Sidebar header with back button */}
        <div className="flex items-center gap-2 p-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
          <Link
            href={`/documents/${documentId}`}
            className="flex items-center gap-1 rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-white/5 hover:text-teal-400"
            title="Back to document"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <span className="text-sm font-semibold text-zinc-300 flex-1">Conversations</span>
          <button
            onClick={handleNewChat}
            className="rounded-lg glass-teal px-3 py-1.5 text-xs font-medium text-teal-400 transition-all glass-hover"
          >
            + New
          </button>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto p-2">
          {conversations.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-zinc-600">No conversations yet</p>
          ) : (
            <div className="space-y-1">
              {conversations.map((convo) => (
                <div
                  key={convo.id}
                  onClick={() => handleLoadConversation(convo)}
                  className={`group flex cursor-pointer items-start gap-2 rounded-lg px-3 py-2.5 transition-all ${
                    activeConvoId === convo.id
                      ? "bg-teal-500/10 border border-teal-500/20"
                      : "hover:bg-white/5"
                  }`}
                >
                  <svg className="mt-0.5 h-4 w-4 shrink-0 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-sm ${activeConvoId === convo.id ? "text-teal-300" : "text-zinc-400"}`}>
                      {convo.title}
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-600">
                      {convo.messages.length} messages &middot; {formatTimeAgo(convo.updated_at)}
                    </p>
                  </div>
                  <button
                    onClick={(e) => handleDeleteConversation(convo.id, e)}
                    className="mt-0.5 shrink-0 rounded p-1 text-zinc-700 opacity-0 transition-all hover:bg-white/5 hover:text-red-400 group-hover:opacity-100"
                    title="Delete conversation"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sidebar footer */}
        <div className="p-3" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
          <p className="text-center text-xs text-zinc-600">
            {conversations.length}/10 saved
          </p>
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex flex-1 flex-col">
        {/* Header */}
        <div
          style={{
            borderBottom: "1px solid rgba(255,255,255,0.05)",
            padding: "12px 16px",
            backgroundColor: "rgba(5, 5, 16, 0.97)",
            backdropFilter: "blur(20px)",
          }}
        >
          <div className="mx-auto flex max-w-3xl items-center gap-3">
            {/* Mobile sidebar toggle */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-300 lg:hidden"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div className="flex items-center gap-2 flex-1">
              <div className="h-2 w-2 rounded-full bg-teal-400 animate-pulse" />
              <h1 className="text-lg font-bold gradient-text-teal">Study Chat</h1>
              {doc && <span className="text-xs text-zinc-500 ml-2">{doc.filename}</span>}
            </div>
            <button
              onClick={handleNewChat}
              className="rounded-xl glass-teal px-3 py-1.5 text-sm text-teal-400 transition-all glass-hover hover-glow-teal"
            >
              New Chat
            </button>
          </div>
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto px-4 py-6">
          <div className="mx-auto max-w-3xl space-y-6">
            {messages.length === 0 && (
              <div className="py-20 text-center">
                <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500/10 to-cyan-500/10">
                  <svg className="h-8 w-8 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <h2 className="mb-2 text-xl font-semibold text-zinc-100">Ask anything about your document</h2>
                <p className="mb-8 text-sm text-zinc-500">
                  I have access to your full document and study materials. Ask me questions,
                  request explanations, or explore topics in depth.
                </p>
                <div className="mx-auto grid max-w-lg gap-3 sm:grid-cols-2">
                  {[
                    "Summarize the key points",
                    "Explain the most important concept",
                    "What are the main takeaways?",
                    "Quiz me on this material",
                  ].map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => { setInput(suggestion); inputRef.current?.focus(); }}
                      className="rounded-xl glass-teal px-4 py-3 text-left text-sm text-zinc-400 transition-all glass-hover hover-glow-teal"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                    msg.role === "user"
                      ? "bg-gradient-to-r from-blue-600/80 to-indigo-600/80 text-white"
                      : "glass text-zinc-200"
                  }`}
                >
                  {msg.role === "assistant" ? (
                    <div className="prose prose-invert prose-sm max-w-none">
                      <MessageContent content={msg.content} />
                    </div>
                  ) : (
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  )}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start">
                <div className="glass rounded-2xl px-4 py-3">
                  <div className="flex items-center gap-2 text-sm text-zinc-400">
                    <div className="relative h-4 w-4">
                      <div className="absolute inset-0 rounded-full border-2 border-white/10" />
                      <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-teal-400" />
                    </div>
                    Thinking...
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input area */}
        <div
          style={{
            borderTop: "1px solid rgba(255,255,255,0.05)",
            padding: "16px",
            backgroundColor: "rgba(5, 5, 16, 0.97)",
            backdropFilter: "blur(20px)",
          }}
        >
          <div className="mx-auto flex max-w-3xl gap-3">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a question about your document..."
              rows={1}
              className="flex-1 resize-none rounded-xl glass px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-all focus:border-teal-500/40"
              style={{ minHeight: 44, maxHeight: 120 }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              className="shrink-0 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-500 px-5 py-3 text-sm font-medium text-white transition-all hover:shadow-[0_0_20px_rgba(20,184,166,0.3)] disabled:opacity-40"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

/** Simple markdown-ish renderer for assistant messages */
function MessageContent({ content }: { content: string }) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("### ")) {
      elements.push(<h4 key={i} className="mt-3 mb-1 text-sm font-semibold text-zinc-100">{formatInline(line.slice(4))}</h4>);
    } else if (line.startsWith("## ")) {
      elements.push(<h3 key={i} className="mt-3 mb-1 text-base font-semibold text-zinc-100">{formatInline(line.slice(3))}</h3>);
    } else if (line.startsWith("# ")) {
      elements.push(<h2 key={i} className="mt-4 mb-2 text-lg font-bold text-zinc-100">{formatInline(line.slice(2))}</h2>);
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      const items: string[] = [];
      while (i < lines.length && (lines[i].startsWith("- ") || lines[i].startsWith("* "))) {
        items.push(lines[i].slice(2));
        i++;
      }
      elements.push(
        <ul key={`ul-${i}`} className="my-1 ml-4 list-disc space-y-0.5 text-sm text-zinc-300">
          {items.map((item, j) => <li key={j}>{formatInline(item)}</li>)}
        </ul>
      );
      continue;
    } else if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s/, ""));
        i++;
      }
      elements.push(
        <ol key={`ol-${i}`} className="my-1 ml-4 list-decimal space-y-0.5 text-sm text-zinc-300">
          {items.map((item, j) => <li key={j}>{formatInline(item)}</li>)}
        </ol>
      );
      continue;
    } else if (line.trim() === "") {
      elements.push(<div key={i} className="h-2" />);
    } else {
      elements.push(<p key={i} className="text-sm text-zinc-300 leading-relaxed">{formatInline(line)}</p>);
    }
    i++;
  }

  return <>{elements}</>;
}

/** Inline formatting: **bold** and `code` */
function formatInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    const codeMatch = remaining.match(/`(.+?)`/);

    const nextBold = boldMatch?.index ?? Infinity;
    const nextCode = codeMatch?.index ?? Infinity;

    if (nextBold === Infinity && nextCode === Infinity) {
      parts.push(remaining);
      break;
    }

    if (nextBold <= nextCode && boldMatch) {
      if (boldMatch.index! > 0) parts.push(remaining.slice(0, boldMatch.index));
      parts.push(<strong key={key++} className="font-semibold text-zinc-100">{boldMatch[1]}</strong>);
      remaining = remaining.slice(boldMatch.index! + boldMatch[0].length);
    } else if (codeMatch) {
      if (codeMatch.index! > 0) parts.push(remaining.slice(0, codeMatch.index));
      parts.push(<code key={key++} className="rounded bg-white/10 px-1.5 py-0.5 text-xs text-teal-300">{codeMatch[1]}</code>);
      remaining = remaining.slice(codeMatch.index! + codeMatch[0].length);
    }
  }

  return parts.length === 1 && typeof parts[0] === "string" ? parts[0] : <>{parts}</>;
}
