"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import type { StudyMode } from "@/types";

interface UploadFormProps {
  onUploadComplete: () => void;
}

export default function UploadForm({ onUploadComplete }: UploadFormProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadPhase, setUploadPhase] = useState<"idle" | "uploading" | "processing">("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<{ title: string; detail?: string; stage?: string } | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) prepareFile(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) prepareFile(file);
  };

  const prepareFile = (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "pdf" && ext !== "pptx") {
      setError({
        title: "Only PDF and PPTX files are supported.",
        detail: `The file "${file.name}" is not a supported upload type.`,
        stage: "validation",
      });
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setError(null);
    setPendingFile(file);
  };

  const closeModeModal = () => {
    setPendingFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const uploadFile = (file: File, studyMode: StudyMode) => {
    setPendingFile(null);
    setUploadPhase("uploading");
    setUploadProgress(0);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("studyMode", studyMode);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload");

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        // Scale file transfer to 0-70% so the bar never hits 100% before AI processing completes
        setUploadProgress(Math.min(Math.round((e.loaded / e.total) * 70), 70));
      }
    });

    xhr.upload.addEventListener("loadend", () => {
      setUploadPhase("processing");
      setUploadProgress(70);
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        // Jump to 100% briefly so the user sees completion, then clear
        setUploadProgress(100);
        setTimeout(() => {
          setUploadPhase("idle");
          setUploadProgress(0);
          onUploadComplete();
        }, 400);
      } else {
        let nextError = {
          title: "Upload failed.",
          detail: "The server did not return a detailed reason.",
          stage: "processing",
        };
        try {
          const data = JSON.parse(xhr.responseText);
          nextError = {
            title: data.error || nextError.title,
            detail: data.detail,
            stage: data.stage,
          };
        } catch { /* ignore parse error */ }
        setError(nextError);
        setUploadPhase("idle");
        setUploadProgress(0);
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
    });

    xhr.addEventListener("error", () => {
      setError({
        title: "Upload failed before the server could respond.",
        detail: "Check your connection and try again.",
        stage: "network",
      });
      setUploadPhase("idle");
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = "";
    });

    xhr.send(formData);
  };

  const isActive = uploadPhase !== "idle";

  const modal = pendingFile ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-[8px] px-4">
          <div className="w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
            <div className="mb-5">
              <p className="text-xs font-medium uppercase tracking-[0.24em] text-zinc-500">
                Choose Study Mode
              </p>
              <h2 className="mt-2 text-xl font-semibold text-zinc-100">
                How should we build this document?
              </h2>
              <p className="mt-2 text-sm text-zinc-400">
                {pendingFile.name} will be processed with a study flow tailored to the mode you pick.
              </p>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => uploadFile(pendingFile, "nursing")}
                className="w-full rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-4 text-left transition-all hover:border-emerald-400/40 hover:bg-emerald-500/15"
              >
                <p className="text-sm font-semibold text-emerald-300">Nursing</p>
                <p className="mt-1 text-sm text-zinc-400">
                  Adds NCLEX-style practice to the workbench and quiz.
                </p>
              </button>

              <button
                onClick={() => uploadFile(pendingFile, "engineers")}
                className="w-full rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-4 text-left transition-all hover:border-amber-400/40 hover:bg-amber-500/15"
              >
                <p className="text-sm font-semibold text-amber-300">Engineers</p>
                <p className="mt-1 text-sm text-zinc-400">
                  Keeps calculation-heavy workout questions in workbench and quiz.
                </p>
              </button>
            </div>

            <button
              onClick={closeModeModal}
              className="mt-4 w-full rounded-2xl border border-white/10 px-4 py-3 text-sm text-zinc-400 transition-colors hover:text-zinc-200"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null;

  return (
    <div>
      {mounted && createPortal(modal, document.body)}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !isActive && fileInputRef.current?.click()}
        className={`group cursor-pointer rounded-2xl p-12 text-center transition-all duration-300 ${
          isDragging
            ? "glass-blue glow-blue"
            : "glass gradient-border hover-glow-purple animate-border-glow"
        } ${isActive ? "pointer-events-none" : ""}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.pptx"
          onChange={handleFileSelect}
          className="hidden"
        />

        {isActive ? (
          <div>
            <div className="relative mx-auto mb-6 h-12 w-12">
              <div className="absolute inset-0 rounded-full border-2 border-white/10" />
              <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-blue-400" />
            </div>

            {uploadPhase === "uploading" ? (
              <>
                <p className="text-lg font-medium text-zinc-200">Uploading file...</p>
                <div className="mx-auto mt-4 h-2 w-64 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-300 ease-out"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <p className="mt-2 text-sm text-zinc-500">{uploadProgress}%</p>
              </>
            ) : (
              <>
                <p className="text-lg font-medium text-zinc-200">Processing your document...</p>
                <div className="mx-auto mt-4 h-2 w-64 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full transition-all duration-500 ease-out"
                    style={{
                      width: `${uploadProgress}%`,
                      background: "linear-gradient(90deg, #8b5cf6, #ec4899)",
                    }}
                  />
                </div>
                <p className="mt-2 text-sm text-zinc-500">
                  {uploadProgress === 100 ? "Complete!" : "Generating study materials with AI"}
                </p>
              </>
            )}
          </div>
        ) : (
          <div>
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500/10 to-purple-500/10 transition-transform duration-300 group-hover:scale-110">
              <svg
                className="h-8 w-8 text-blue-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
            </div>
            <p className="text-lg font-medium text-zinc-200">
              Drop a PDF or PowerPoint file here
            </p>
            <p className="mt-2 text-sm text-zinc-500">
              or click to browse (.pdf, .pptx)
            </p>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-3 rounded-xl glass border border-red-500/20 px-4 py-3">
          <p className="text-sm font-medium text-red-400">{error.title}</p>
          {error.detail && (
            <p className="mt-1 text-sm leading-relaxed text-red-300/90">{error.detail}</p>
          )}
          {error.stage && (
            <p className="mt-2 text-xs uppercase tracking-[0.18em] text-zinc-500">
              Stage: {error.stage.replace(/_/g, " ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
