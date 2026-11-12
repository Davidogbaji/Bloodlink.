"use client";

import { useEffect } from "react";
import { registerAutoSync } from "../lib/offlineQueue";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Non-fatal — app still works without the shell cache.
      });
    }
    registerAutoSync();
  }, []);

  return null;
}
