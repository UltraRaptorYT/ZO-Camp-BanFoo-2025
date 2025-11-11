"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import clsx from "clsx";

type UnscrambleGameProps = {
  initialWord?: string; // e.g. "TCAH"
  answerWord?: string; // e.g. "CHAT"
};

type Tile = { id: string; ch: string };

export function UnscrambleGame({
  initialWord = "TCAH",
  answerWord = "CHAT",
}: UnscrambleGameProps) {
  const normalizedInitial = useMemo(() => initialWord.trim(), [initialWord]);
  const normalizedAnswer = useMemo(() => answerWord.trim(), [answerWord]); // add refs:
  const lastXRef = useRef<number | null>(null);
  const lastYRef = useRef<number | null>(null);

  const [tiles, setTiles] = useState<Tile[]>(
    normalizedInitial
      .split("")
      .map((ch, i) => ({ id: `${i}-${ch}-${Math.random()}`, ch }))
  );

  useEffect(() => {
    setTiles(
      normalizedInitial
        .split("")
        .map((ch, i) => ({ id: `${i}-${ch}-${Math.random()}`, ch }))
    );
  }, [normalizedInitial]);

  const currentWord = tiles.map((t) => t.ch).join("");
  const isCorrect = currentWord === normalizedAnswer;

  // --- Drag state ---
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const [dragX, setDragX] = useState(0);
  const [dragY, setDragY] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const tileRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const setTileRef = (id: string) => (el: HTMLDivElement | null) => {
    tileRefs.current[id] = el;
  };

  function swap(from: number, to: number) {
    setTiles((prev) => {
      const next = prev.slice();
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  function indexFromPoint(clientX: number, clientY: number) {
    // Find the tile under the pointer using elementFromPoint for mobile friendliness
    const el = document.elementFromPoint(
      clientX,
      clientY
    ) as HTMLElement | null;
    if (!el) return null;
    const tileEl = el.closest("[data-idx]") as HTMLElement | null;
    if (!tileEl) return null;
    const idx = Number(tileEl.dataset.idx);
    return Number.isNaN(idx) ? null : idx;
  }

  function onPointerDown(e: React.PointerEvent, idx: number) {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragIndex(idx);
    setDragId(e.pointerId);
    setDragX(0);
    setDragY(0);
    lastXRef.current = e.clientX;
    lastYRef.current = e.clientY;
  }

  function onPointerMove(e: React.PointerEvent) {
    if (dragIndex === null || dragId === null || e.pointerId !== dragId) return;

    // ✅ compute deltas manually (Safari mobile fix)
    const lastX = lastXRef.current ?? e.clientX;
    const lastY = lastYRef.current ?? e.clientY;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastXRef.current = e.clientX;
    lastYRef.current = e.clientY;

    setDragX((prev) => prev + dx);
    setDragY((prev) => prev + dy);

    const overIdx = indexFromPoint(e.clientX, e.clientY);
    if (overIdx !== null && overIdx !== dragIndex) {
      const from = dragIndex;
      const to = overIdx;
      swap(from, to);
      setDragIndex(to);
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    if (dragId !== null) {
      try {
        (e.target as HTMLElement).releasePointerCapture(dragId);
      } catch {}
    }
    setDragIndex(null);
    setDragId(null);
    setDragX(0);
    setDragY(0);
    lastXRef.current = null;
    lastYRef.current = null;
  }

  function shuffle() {
    setTiles((prev) => {
      const next = prev.slice();
      for (let i = next.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [next[i], next[j]] = [next[j], next[i]];
      }
      return next;
    });
  }

  return (
    <Card className="w-full max-w-xl mx-auto">
      <CardHeader className="pb-2">
        <CardTitle className="text-xl">Unscramble the Word</CardTitle>
        <p className="text-sm text-muted-foreground">
          Drag tiles to reorder. Works on mobile (touch) and desktop.
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-sm font-medium">
              Initial (scrambled) word
            </label>
            <Input value={normalizedInitial} onChange={() => {}} readOnly />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Correct word</label>
            <Input value={normalizedAnswer} onChange={() => {}} readOnly />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button type="button" variant="secondary" onClick={shuffle}>
            Shuffle
          </Button>
          <div
            className={clsx(
              "rounded-full px-3 py-1 text-sm",
              isCorrect
                ? "bg-green-100 text-green-700"
                : "bg-amber-100 text-amber-700"
            )}
          >
            {isCorrect ? "✅ Correct!" : "🧩 Keep going"}
          </div>
        </div>

        <div
          ref={containerRef}
          className="flex flex-wrap gap-2 p-3 rounded-2xl bg-muted/60 min-h-20 select-none touch-none"
        >
          {tiles.map((t, idx) => (
            <div
              key={t.id}
              data-idx={idx}
              onPointerDown={(e) => onPointerDown(e, idx)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              className={clsx(
                "relative cursor-grab active:cursor-grabbing",
                "rounded-xl border bg-background shadow-sm",
                "px-4 py-3 text-xl font-semibold tracking-wide",
                "transition-transform will-change-transform",
                "touch-none" // optional extra
              )}
              style={
                dragIndex === idx
                  ? {
                      transform: `translate3d(${dragX}px, ${dragY}px, 0) scale(1.05)`,
                      zIndex: 50,
                    }
                  : undefined
              }
            >
              {t.ch}
            </div>
          ))}
        </div>

        <div className="text-sm text-muted-foreground">
          Current:{" "}
          <span className="font-semibold text-foreground">{currentWord}</span>
        </div>
      </CardContent>
    </Card>
  );
}
