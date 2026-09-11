"use client";

import * as React from "react";

/**
 * Returns `true` on devices whose primary input supports hover (mouse / trackpad),
 * `false` on touch-only devices. Defaults to `true` during SSR / first paint so the
 * desktop layout doesn't flash on hydration.
 */
export function useHasHover(): boolean {
  const [hasHover, setHasHover] = React.useState(true);
  React.useEffect(() => {
    const mq = window.matchMedia("(hover: hover)");
    setHasHover(mq.matches);
    const onChange = (event: MediaQueryListEvent) => setHasHover(event.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return hasHover;
}

/**
 * Tracks the bounding rect of `ref` while `open` is true, updating on resize and
 * scroll so portaled popovers can follow their trigger.
 */
export function useTriggerRect(
  ref: React.RefObject<HTMLElement | null>,
  open: boolean,
): DOMRect | null {
  const [rect, setRect] = React.useState<DOMRect | null>(null);
  React.useEffect(() => {
    if (!open || !ref.current) {
      setRect(null);
      return;
    }
    const update = () => {
      if (ref.current) setRect(ref.current.getBoundingClientRect());
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, ref]);
  return rect;
}
