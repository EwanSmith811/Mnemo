"use client";

import dynamic from "next/dynamic";

const GraphClient = dynamic(() => import("@/components/GraphClient"), {
  ssr: false,
  loading: () => (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <p className="text-zinc-500">Loading concept graph...</p>
    </div>
  ),
});

export default function GraphPage() {
  return <GraphClient />;
}
