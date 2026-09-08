"use client";

import * as React from "react";
import { cn } from "./utils";

/**
 * One sweep of the highlight, straight into the next.
 *
 * Constant speed: this is continuous motion, not an arrival, and an ease
 * would dwell at the corners where the streak is only a sliver in frame and
 * read as the loop having stopped. The travel is only as far as the streak is
 * visible, from just outside the top-left corner to just past the
 * bottom-right, so no time is spent moving light nobody can see. The carrier
 * is the size of the frame and moves in its own percentages, so the same
 * keyframes run corner to corner at any player size.
 */
const SWEEP: Keyframe[] = [
  { transform: "translate(-66%, -66%)", easing: "linear" },
  { transform: "translate(66%, 66%)" },
];

/** Under reduced motion the band stays put and breathes instead of moving. */
const BREATHE: Keyframe[] = [
  { opacity: 0.35, easing: "ease-in-out" },
  { opacity: 1, easing: "ease-in-out" },
  { opacity: 0.35 },
];

export function LoadingSkeleton({
  ariaLabel,
  className,
}: {
  ariaLabel?: string;
  className?: string;
}) {
  const carrierRef = React.useRef<HTMLDivElement | null>(null);

  // The Web Animations API rather than a JS-driven animation: the skeleton is
  // on screen precisely while the page is busy decoding and hydrating, and a
  // compositor transform keeps sweeping smoothly through all of that. No
  // keyframe stylesheet is needed either, which keeps the package to
  // utilities alone.
  React.useEffect(() => {
    const carrier = carrierRef.current;
    if (!carrier || typeof carrier.animate !== "function") return;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduced) {
      // Parked in the middle of the frame rather than at the sweep's start,
      // which is off screen.
      carrier.style.transform = "none";
      const animation = carrier.animate(BREATHE, {
        duration: 3200,
        iterations: Infinity,
      });
      return () => animation.cancel();
    }
    const animation = carrier.animate(SWEEP, {
      duration: 1500,
      iterations: Infinity,
    });
    return () => animation.cancel();
  }, []);

  return (
    <div
      role="status"
      aria-label={ariaLabel ?? "Loading video"}
      className={cn(
        "relative aspect-video w-full overflow-hidden rounded-xl border bg-neutral-900",
        className,
      )}
    >
      {/* A long, thin streak of light: several frames tall and well under
          half a frame wide, turned to lie across the diagonal it travels so it
          crosses the picture as one continuous line. Its brightness only
          falls off across its width, never along its length, so it is as
          visible entering a corner as it is mid-frame; a blur on top
          dissolves the last of the gradient steps. */}
      <div
        ref={carrierRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 will-change-transform"
        style={{ transform: "translate(-66%, -66%)" }}
      >
        <div
          className="absolute top-1/2 left-1/2 h-[480%] w-[46%]"
          style={{
            transform: "translate(-50%, -50%) rotate(30deg)",
            filter: "blur(18px)",
            background:
              "linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.014) 18%, rgba(255,255,255,0.045) 34%, rgba(255,255,255,0.11) 50%, rgba(255,255,255,0.045) 66%, rgba(255,255,255,0.014) 82%, rgba(255,255,255,0) 100%)",
          }}
        />
      </div>
    </div>
  );
}
