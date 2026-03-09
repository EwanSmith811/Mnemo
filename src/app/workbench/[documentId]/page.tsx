"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { WorkbenchGroupStatus } from "@/types";

const GROUP_COLORS: Record<string, { bg: string; border: string; text: string }> = {};
const COLOR_PALETTE = [
  { bg: "#dbeafe", border: "#60a5fa", text: "#1e3a8a" },
  { bg: "#dcfce7", border: "#4ade80", text: "#166534" },
  { bg: "#fee2e2", border: "#f87171", text: "#991b1b" },
  { bg: "#fef9c3", border: "#facc15", text: "#854d0e" },
  { bg: "#ede9fe", border: "#a78bfa", text: "#5b21b6" },
  { bg: "#ffe4e6", border: "#fb7185", text: "#9f1239" },
  { bg: "#cffafe", border: "#22d3ee", text: "#155e75" },
  { bg: "#fed7aa", border: "#fb923c", text: "#9a3412" },
];

function getGroupColor(group: string) {
  if (!GROUP_COLORS[group]) {
    const idx = Object.keys(GROUP_COLORS).length % COLOR_PALETTE.length;
    GROUP_COLORS[group] = COLOR_PALETTE[idx];
  }
  return GROUP_COLORS[group];
}

function stageLabel(stage: number): string {
  if (stage === 0) return "Not started";
  if (stage === 1) return "Brief done";
  if (stage === 2) return "Inquiry done";
  return "Mastered";
}

function stageColor(stage: number): string {
  if (stage === 0) return "text-zinc-600";
  if (stage === 1) return "text-blue-400";
  if (stage === 2) return "text-purple-400";
  return "text-emerald-400";
}

function stageGlowClass(stage: number): string {
  if (stage === 3) return "hover-glow-green";
  if (stage >= 1) return "hover-glow-purple";
  return "hover-glow-blue";
}

export default function WorkbenchHub() {
  const params = useParams();
  const documentId = params.documentId as string;

  const [groups, setGroups] = useState<WorkbenchGroupStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/workbench/${documentId}/overview`);
        if (res.ok) setGroups(await res.json());
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [documentId]);

  const mastered = groups.filter((g) => g.stageCompleted >= 3).length;
  const started = groups.filter((g) => g.stageCompleted > 0).length;
  const total = groups.length;
  const totalNodes = groups.reduce((s, g) => s + g.nodeIds.length, 0);
  const progressPct = total > 0 ? Math.round((mastered / total) * 100) : 0;

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="relative mx-auto mb-4 h-10 w-10">
            <div className="absolute inset-0 rounded-full border-2 border-white/10" />
            <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-rose-400" />
          </div>
          <p className="text-zinc-500">Loading workbench...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-6 py-12">
      <div className="mx-auto max-w-5xl">
        {/* Nav */}
        <Link
          href={`/documents/${documentId}`}
          className="mb-8 inline-flex items-center gap-2 text-sm text-zinc-500 transition-colors hover:text-zinc-300"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to document
        </Link>

        <div className="mb-8 animate-fade-in-up">
          <h1 className="mb-2 text-3xl font-bold gradient-text-rose">Workbench</h1>
          <p className="text-sm text-zinc-500">
            Deep-dive into concept groups. Master each through 3 stages: Brief, Inquiry, Fade.
          </p>
          <p className="mt-1 text-xs text-zinc-600">
            {total} groups covering {totalNodes} concepts
          </p>
          <div className="mt-3 glow-line-rose w-20" />
        </div>

        {/* Progress bar */}
        <div className="mb-8 rounded-2xl glass-rose p-5 animate-fade-in-up delay-100 glow-rose" style={{ opacity: 0 }}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <span className="text-lg font-semibold text-zinc-100">{mastered}/{total}</span>
              <span className="ml-2 text-sm text-zinc-500">groups mastered</span>
            </div>
            <div className="flex items-center gap-4 text-xs text-zinc-500">
              <span>{started} started</span>
              <span>{progressPct}% complete</span>
            </div>
          </div>
          <div className="h-2 rounded-full bg-white/5 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Group cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 animate-fade-in-up delay-200" style={{ opacity: 0 }}>
          {groups.map((group) => {
            const gc = getGroupColor(group.group);
            const reqCount = group.requiredNodeIds.length;
            return (
              <Link
                key={group.group}
                href={`/workbench/${documentId}/${encodeURIComponent(group.group)}`}
                className={`group relative rounded-2xl glass p-5 transition-all duration-300 glass-hover ${stageGlowClass(group.stageCompleted)}`}
              >
                {/* Group badge */}
                <div className="mb-3 flex items-center gap-2">
                  <span
                    className="inline-block rounded-full px-3 py-1 text-xs font-medium"
                    style={{ backgroundColor: gc.bg, color: gc.text }}
                  >
                    {group.group}
                  </span>
                </div>

                {/* Node count breakdown */}
                <div className="mb-3 text-xs text-zinc-500">
                  <span>{group.nodeIds.length} concepts</span>
                  {reqCount > 0 && reqCount < group.nodeIds.length && (
                    <span className="ml-1 text-zinc-600">({reqCount} required)</span>
                  )}
                </div>

                {/* Node labels preview */}
                <div className="mb-3 flex flex-wrap gap-1">
                  {group.nodeLabels.slice(0, 4).map((label) => (
                    <span key={label} className="rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] text-zinc-400">
                      {label}
                    </span>
                  ))}
                  {group.nodeLabels.length > 4 && (
                    <span className="rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] text-zinc-600">
                      +{group.nodeLabels.length - 4} more
                    </span>
                  )}
                </div>

                {/* BIF stage indicator dots */}
                <div className="flex items-center gap-2 mb-2">
                  {[1, 2, 3].map((s) => (
                    <div key={s} className="flex items-center gap-1">
                      <div
                        className={`h-2 w-2 rounded-full transition-all ${
                          group.stageCompleted >= s
                            ? s === 3
                              ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]"
                              : s === 2
                              ? "bg-purple-400 shadow-[0_0_6px_rgba(167,139,250,0.5)]"
                              : "bg-blue-400 shadow-[0_0_6px_rgba(96,165,250,0.5)]"
                            : "bg-white/10"
                        }`}
                      />
                      <span className={`text-[10px] transition-all ${
                        group.stageCompleted >= s
                          ? s === 3
                            ? "text-emerald-400 drop-shadow-[0_0_4px_rgba(52,211,153,0.6)]"
                            : s === 2
                            ? "text-purple-400 drop-shadow-[0_0_4px_rgba(167,139,250,0.6)]"
                            : "text-blue-400 drop-shadow-[0_0_4px_rgba(96,165,250,0.6)]"
                          : "text-zinc-600"
                      }`}>
                        {s === 1 ? "B" : s === 2 ? "I" : "F"}
                      </span>
                    </div>
                  ))}
                </div>

                <p className={`text-xs font-medium ${stageColor(group.stageCompleted)}`}>
                  {stageLabel(group.stageCompleted)}
                </p>

                {/* Subtle glow for mastered groups */}
                {group.stageCompleted >= 3 && (
                  <div className="absolute -right-2 -top-2 h-8 w-8 rounded-full bg-emerald-400/20 blur-xl" />
                )}
              </Link>
            );
          })}
        </div>

        {groups.length === 0 && (
          <div className="text-center py-20">
            <p className="text-zinc-500">No concept nodes found. Upload a document and generate a concept graph first.</p>
          </div>
        )}
      </div>
    </div>
  );
}
