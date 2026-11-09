"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from "react";
import type { AnatomyCameraView, AnatomyHighlight, AnatomyProfile, AnatomyStage } from "@/lib/anatomy-3d/scene";

export type Anatomy3DHandle = { setView: (view: AnatomyCameraView) => void; zoomBy: (factor: number) => void; reset: () => void };
const EMPTY_HIGHLIGHT: AnatomyHighlight = { front: { primary: [], secondary: [] }, back: { primary: [], secondary: [] } };

function webglAvailable() {
  try { const canvas = document.createElement("canvas"); return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl")); } catch { return false; }
}

/** Corpo anatômico 3D (arrastar gira, pinça/roda dá zoom). Mostra `fallback` se o 3D não puder ser carregado. */
export const Anatomy3DViewer = forwardRef<Anatomy3DHandle, {
  profile: AnatomyProfile; view?: AnatomyCameraView; highlight?: AnatomyHighlight; label: string; className?: string;
  fallback: ReactNode; onZoom?: (percent: number) => void; onFailed?: () => void;
}>(function Anatomy3DViewer({ profile, view = "front", highlight = EMPTY_HIGHLIGHT, label, className, fallback, onZoom, onFailed }, ref) {
  const container = useRef<HTMLDivElement>(null);
  const stage = useRef<AnatomyStage | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const highlightKey = JSON.stringify(highlight);
  const initialView = useRef(view); const zoomCallback = useRef(onZoom);
  const failedCallback = useRef(onFailed);
  useEffect(() => { zoomCallback.current = onZoom; failedCallback.current = onFailed; }, [onZoom, onFailed]);
  useEffect(() => { if (state === "failed") failedCallback.current?.(); }, [state]);

  useImperativeHandle(ref, () => ({
    setView: (next) => stage.current?.setView(next),
    zoomBy: (factor) => stage.current?.zoomBy(factor),
    reset: () => stage.current?.reset(),
  }), []);

  useEffect(() => {
    const element = container.current; if (!element) return;
    if (!webglAvailable()) { setState("failed"); return; }
    let cancelled = false; setState("loading");
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    import("@/lib/anatomy-3d/scene")
      .then(({ createAnatomyStage }) => createAnatomyStage(element, { profile, highlight: JSON.parse(highlightKey) as AnatomyHighlight, view: initialView.current, reducedMotion, onZoom: (percent) => zoomCallback.current?.(percent) }))
      .then((created) => { if (cancelled) { created.dispose(); return; } stage.current = created; setState("ready"); })
      .catch(() => { if (!cancelled) setState("failed"); });
    return () => { cancelled = true; stage.current?.dispose(); stage.current = null; };
  }, [profile, highlightKey]);

  if (state === "failed") return <>{fallback}</>;
  return <div className={`anatomy-3d ${className ?? ""}`} role="img" aria-label={label} aria-busy={state === "loading"}>
    <div ref={container} className="anatomy-3d-canvas" />
    {state === "loading" && <span className="anatomy-3d-loading">Carregando corpo 3D…</span>}
  </div>;
});
