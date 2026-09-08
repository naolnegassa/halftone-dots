"use client";

import * as React from "react";
import { IconRotate, IconRotateClockwise } from "@tabler/icons-react";
import type { GlassState } from "./glass-controls";
import { GlassFilter, type GlassAssets } from "./liquid-glass";
import { PlayPauseIcon } from "./play-pause-icon";
import { cn, SKIP_SECONDS } from "./utils";

const BUTTON_CLASS =
  "inline-flex items-center justify-center rounded-full border text-white transition-[background-color,border-color,box-shadow,scale,opacity] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] motion-reduce:transition-none";

/**
 * The player's own glass: a tint, a hairline ring, a drop shadow and the SVG
 * displacement filter. Worn until the WebGL panes are running, and for good
 * where they cannot run.
 */
const FALLBACK_GLASS_CLASS =
  "border-white/25 bg-black/10 shadow-[0_10px_40px_rgba(0,0,0,0.45)] backdrop-blur-xl hover:bg-black/25";

/**
 * Once the panes are live the button is icon and press only. The shader draws
 * its own rim and shadow; under a second, flat one it reads as a blurred disc
 * with a border, which is the look the panes replace.
 */
const LIVE_GLASS_CLASS = "border-transparent bg-transparent shadow-none";

type CenterControlsProps = {
  visible: boolean;
  isPlaying: boolean;
  disableSkip: boolean;
  isMdUp: boolean;
  glass: GlassState;
  layerRef: React.Ref<HTMLDivElement>;
  glassFilterId: string;
  playGlass: GlassAssets | null;
  skipGlass: GlassAssets | null;
  onTogglePlay: () => void;
  onSeekBy: (delta: number) => void;
};

/**
 * The centered play / skip cluster, plus the hidden SVG element hosting the
 * fallback glass displacement filters it references.
 */
export function CenterControls({
  visible,
  isPlaying,
  disableSkip,
  isMdUp,
  glass,
  layerRef,
  glassFilterId,
  playGlass,
  skipGlass,
  onTogglePlay,
  onSeekBy,
}: CenterControlsProps) {
  const fallback = glass !== "live";
  const surfaceClass = cn(
    fallback ? FALLBACK_GLASS_CLASS : LIVE_GLASS_CLASS,
    /* Hidden, not faded, while the shader starts: out of hit-testing and the
       tab order too, and the computed opacity is left alone for the panes to
       mirror once they are live. */
    glass === "pending" && "invisible",
  );
  const playStyle =
    fallback && playGlass
      ? { backdropFilter: `url(#${glassFilterId}-play)` }
      : undefined;
  const skipStyle =
    fallback && skipGlass
      ? { backdropFilter: `url(#${glassFilterId}-skip)` }
      : undefined;

  return (
    <>
      <svg aria-hidden width="0" height="0" className="absolute">
        {playGlass && (
          <GlassFilter
            id={`${glassFilterId}-play`}
            assets={playGlass}
            size={isMdUp ? 88 : 64}
          />
        )}
        {skipGlass && (
          <GlassFilter
            id={`${glassFilterId}-skip`}
            assets={skipGlass}
            size={isMdUp ? 66 : 48}
          />
        )}
      </svg>

      {/* The reveal fades each button's own opacity (plain CSS): animating
          scale would re-rasterize the SVG backdrop filter every frame
          (jitter), and fading an ancestor group would turn it into the
          backdrop root, cutting the video out of the buttons' backdrop and
          killing the fallback glass entirely. */}
      <div
        ref={layerRef}
        aria-hidden={!visible}
        className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2"
      >
        {!disableSkip && (
          <SkipButton
            direction="back"
            visible={visible}
            surfaceClass={surfaceClass}
            style={skipStyle}
            onClick={() => onSeekBy(-SKIP_SECONDS)}
          />
        )}

        <button
          type="button"
          onClick={onTogglePlay}
          aria-label={isPlaying ? "Pause" : "Play"}
          tabIndex={visible ? undefined : -1}
          className={cn(
            BUTTON_CLASS,
            surfaceClass,
            "h-16 w-16 md:h-[88px] md:w-[88px]",
            visible
              ? "pointer-events-auto opacity-100"
              : "pointer-events-none opacity-0",
          )}
          style={playStyle}
        >
          {/* A third of the disc reads as a badge on a button rather than the
              button's own mark; at 40 of 88 the triangle fills it the way a
              play glyph is expected to. */}
          <PlayPauseIcon isPlaying={isPlaying} className="size-8 md:size-10" />
        </button>

        {!disableSkip && (
          <SkipButton
            direction="forward"
            visible={visible}
            surfaceClass={surfaceClass}
            style={skipStyle}
            onClick={() => onSeekBy(SKIP_SECONDS)}
          />
        )}
      </div>
    </>
  );
}

function SkipButton({
  direction,
  visible,
  surfaceClass,
  style,
  onClick,
}: {
  direction: "back" | "forward";
  visible: boolean;
  surfaceClass: string;
  style?: React.CSSProperties;
  onClick: () => void;
}) {
  const isBack = direction === "back";
  const Icon = isBack ? IconRotate : IconRotateClockwise;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${isBack ? "Back" : "Forward"} ${SKIP_SECONDS} seconds`}
      tabIndex={visible ? undefined : -1}
      className={cn(
        "group/skip shrink-0",
        BUTTON_CLASS,
        surfaceClass,
        "h-12 w-12 md:h-[66px] md:w-[66px]",
        visible
          ? "pointer-events-auto opacity-100"
          : "pointer-events-none opacity-0",
      )}
      style={style}
    >
      <span
        aria-hidden
        className={cn(
          "inline-flex transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none",
          isBack
            ? "group-active/skip:-rotate-[20deg]"
            : "group-active/skip:rotate-[20deg]",
        )}
      >
        <Icon
          className="size-4 md:size-6"
          style={{ transform: "scaleX(-1) scaleY(-1)" }}
        />
      </span>
    </button>
  );
}
