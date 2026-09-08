"use client";

import { type ReactNode, useLayoutEffect, useRef, useState } from "react";

import { cn } from "../lib/cn";

type Tab<T extends string> = { id: T; label: ReactNode };
type Pill = { x: number; width: number; y: number; height: number };

export type SlidingTabsIndicator = "pill" | "underline";

const UNDERLINE_HEIGHT = 2;

/**
 * Tabs whose indicator slides between them, and whose active label changes
 * colour exactly where the indicator covers it. Each label is drawn twice,
 * stacked: the resting colour underneath and the active colour on top, clipped
 * to the indicator's box. Since the clip transitions on the same duration and
 * curve as the indicator, the reveal edge rides the pill instead of the label
 * swapping colour in one go.
 */
export function SlidingTabs<T extends string>({
  tabs,
  value,
  onChange,
  indicator = "pill",
  className,
  pillClassName,
  tabClassName,
  activeTabClassName,
  ariaLabel,
}: {
  tabs: Tab<T>[];
  value: T;
  onChange: (id: T) => void;
  indicator?: SlidingTabsIndicator;
  className?: string;
  pillClassName?: string;
  tabClassName?: string;
  /** Colour of the label where the indicator covers it. Defaults to reading
   * against a solid pill; a translucent one wants the page's ink instead. */
  activeTabClassName?: string;
  ariaLabel?: string;
}) {
  const refs = useRef<Partial<Record<T, HTMLButtonElement | null>>>({});
  const labelRefs = useRef<Partial<Record<T, HTMLSpanElement | null>>>({});
  const [pill, setPill] = useState<Pill | null>(null);

  // `indicator` is not read here, but each style gives the tabs different
  // padding, so the measurement it produced is wrong the moment the style
  // changes.
  useLayoutEffect(() => {
    const tab = refs.current[value];
    if (!tab) return;

    setPill({
      x: tab.offsetLeft,
      width: tab.offsetWidth,
      y: tab.offsetTop,
      height: tab.offsetHeight,
    });
  }, [value, indicator]);

  useLayoutEffect(() => {
    let canceled = false;

    void document.fonts.ready.then(() => {
      const tab = refs.current[value];
      if (canceled || !tab) return;

      setPill({
        x: tab.offsetLeft,
        width: tab.offsetWidth,
        y: tab.offsetTop,
        height: tab.offsetHeight,
      });
    });

    return () => {
      canceled = true;
    };
  }, [value, indicator]);

  // The pill insets by a pixel so it sits inside the track; the underline is a
  // thin rule spanning the tab, flush with its bottom edge.
  const bar =
    pill === null
      ? null
      : indicator === "underline"
        ? {
            x: pill.x,
            width: pill.width,
            top: pill.y + pill.height - UNDERLINE_HEIGHT,
            height: UNDERLINE_HEIGHT,
          }
        : {
            x: pill.x + 1,
            width: pill.width - 2,
            top: pill.y + 1,
            height: pill.height - 2,
          };

  /** How much of the label the indicator covers, as an inset on the label's own
   *  box. Measured against the label rather than the button: `inset()` resolves
   *  against the element it is set on, so button-space numbers would shave the
   *  pill's 1px inset off the glyphs instead of off the padding.
   *
   *  Deliberately unclamped. Both insets are then affine in the bar's edges, and
   *  since the bar's `transform`/`width` transition on the same duration and
   *  curve, each inset interpolates to exactly where the bar is at that instant
   *  — the reveal edge rides the pill instead of trailing it. Clamping to
   *  `[0, width]` flattens the far end of that line, so the last few pixels of a
   *  label finished revealing after the pill had already arrived. Values outside
   *  the box are harmless: the shape is clipped to the element regardless. */
  const activeClip = (id: T) => {
    const tab = refs.current[id];
    const label = labelRefs.current[id];
    if (!bar || !tab || !label) return undefined;

    // The button is the label's offset parent, so this lifts the label into the
    // same coordinate space the bar is positioned in.
    const labelLeft = tab.offsetLeft + label.offsetLeft;
    const labelRight = labelLeft + label.offsetWidth;

    return `inset(0 ${labelRight - (bar.x + bar.width)}px 0 ${bar.x - labelLeft}px)`;
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn("relative inline-flex rounded-full", className)}
    >
      {bar ? (
        <span
          className={cn(
            "sliding-tab-pill pointer-events-none absolute left-0 rounded-full",
            pillClassName,
          )}
          style={{
            transform: `translateX(${bar.x}px)`,
            width: bar.width,
            top: bar.top,
            height: bar.height,
          }}
        />
      ) : null}
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={tab.id === value}
          data-slot="sliding-tabs-item"
          ref={(element) => {
            refs.current[tab.id] = element;
          }}
          onClick={() => onChange(tab.id)}
          className={cn(
            "relative z-10 flex-none cursor-pointer rounded-full whitespace-nowrap text-[var(--color-muted)] transition-[transform,color,box-shadow] duration-150 ease-out select-none hover:text-[var(--color-ink)] focus-visible:ring-2 focus-visible:ring-[var(--color-ink)]/40 focus-visible:outline-none active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100",
            tabClassName,
          )}
        >
          <span
            className="relative grid"
            ref={(element) => {
              labelRefs.current[tab.id] = element;
            }}
          >
            <span className="col-start-1 row-start-1">{tab.label}</span>
            {bar ? (
              <span
                aria-hidden
                className={cn(
                  "sliding-tab-active-label pointer-events-none col-start-1 row-start-1",
                  activeTabClassName ?? "text-white",
                )}
                style={{ clipPath: activeClip(tab.id) }}
              >
                {tab.label}
              </span>
            ) : null}
          </span>
        </button>
      ))}
    </div>
  );
}
