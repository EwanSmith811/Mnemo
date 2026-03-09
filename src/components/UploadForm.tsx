"use client";

import { useState, useRef } from "react";

interface UploadFormProps {
  onUploadComplete: () => void;
}

export default function UploadForm({ onUploadComplete }: UploadFormProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadPhase, setUploadPhase] = useState<"idle" | "uploading" | "processing">("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    if (file) uploadFile(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
  };

  const uploadFile = (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "pdf" && ext !== "pptx") {
      setError("Only PDF and PPTX files are supported.");
      return;
    }

    setError(null);
    setUploadPhase("uploading");
    setUploadProgress(0);

    const formData = new FormData();
    formData.append("file", file);

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
        let errMsg = "Upload failed";
        try {
          const data = JSON.parse(xhr.responseText);
          errMsg = data.error || errMsg;
        } catch { /* ignore parse error */ }
        setError(errMsg);
        setUploadPhase("idle");
        setUploadProgress(0);
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
    });

    xhr.addEventListener("error", () => {
      setError("Upload failed");
      setUploadPhase("idle");
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = "";
    });

    xhr.send(formData);
  };

  const isActive = uploadPhase !== "idle";

  return (
    <div>
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
        <div className="mt-3 rounded-xl glass px-4 py-3 text-sm text-red-400 border-red-500/20">
          {error}
        </div>
      )}
    </div>
  );
}
