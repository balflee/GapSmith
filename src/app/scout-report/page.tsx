"use client";

import { Suspense } from "react";
import { ScoutReportContent } from "./scout-report-content";

export default function ScoutReportPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background">
          <div className="mx-auto max-w-[960px] px-6 py-12">
            <ScoutReportSkeleton />
          </div>
        </div>
      }
    >
      <ScoutReportContent />
    </Suspense>
  );
}

function ScoutReportSkeleton() {
  return (
    <div className="space-y-8">
      {/* Header skeleton */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 animate-pulse rounded-lg bg-scout/10" />
          <div className="h-10 w-64 animate-pulse rounded-lg bg-muted" />
        </div>
        <div className="h-5 w-96 animate-pulse rounded bg-muted" />
      </div>
      {/* Stats skeleton */}
      <div className="grid grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-lg bg-muted"
            style={{ animationDelay: `${i * 100}ms` }}
          />
        ))}
      </div>
      {/* Cards skeleton */}
      <div className="space-y-4">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-40 animate-pulse rounded-lg bg-muted"
            style={{ animationDelay: `${i * 120}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
