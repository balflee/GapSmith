"use client";

import { useEffect } from "react";
import { trackRetainReturn } from "@/lib/events";

export function RetainTracker() {
  useEffect(() => {
    try {
      const lastVisit = localStorage.getItem("last_visit_ts");
      if (lastVisit) {
        const days = Math.floor((Date.now() - Number(lastVisit)) / 86_400_000);
        if (days >= 1) {
          trackRetainReturn({ cycle_type: "return" });
        }
      }
      localStorage.setItem("last_visit_ts", String(Date.now()));
    } catch {
      // localStorage unavailable — skip silently
    }
  }, []);

  return null;
}
