"use client";

import { useEffect } from "react";

/**
 * Registers the worker after the page has settled. Doing it on load would make
 * the very first visit compete with the import for bandwidth, which is the one
 * moment the app actually needs the network.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // A refused registration (private browsing, unsupported context) costs
        // the offline shell and nothing else — the deck still works.
      });
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  return null;
}
