"use client";

import { useEffect, useId, useRef, useState } from "react";

export function Hint({ text, label = "About this" }: { text: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<{ top: number; left: number; width: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const id = useId();

  function place() {
    const node = buttonRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const width = Math.min(288, window.innerWidth - 24);
    const left = Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12));
    setBox({ top: rect.bottom + 8, left, width });
  }

  useEffect(() => {
    if (!open) return;
    place();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    function onPointer(event: MouseEvent) {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target)) return;
      const tip = document.getElementById(id);
      if (tip?.contains(target)) return;
      setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onPointer);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("resize", place);
    };
  }, [open, id]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="min-h-8 rounded-full border border-border px-2.5 text-[11px] font-medium text-muted transition hover:border-gold hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          setOpen((value) => {
            const next = !value;
            if (next) requestAnimationFrame(place);
            return next;
          });
        }}
      >
        {label}
      </button>
      {open && box ? (
        <span
          id={id}
          role="tooltip"
          style={{ position: "fixed", top: box.top, left: box.left, width: box.width }}
          className="z-[80] rounded-2xl border border-border bg-white p-3 text-left text-xs leading-relaxed text-foreground shadow-[var(--shadow-lift)]"
        >
          {text}
        </span>
      ) : null}
    </>
  );
}
