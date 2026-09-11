"use client";

import * as React from "react";
import { IconRotate, IconRotateClockwise } from "@tabler/icons-react";
import type { GlassState } from "./glass-controls";
import { PlayPauseIcon } from "./play-pause-icon";
import { cn, SKIP_SECONDS } from "./utils";

/**
 * The button is icon and press only. The glass pane underneath it draws the
 * surface, the rim and the shadow; a second, flat one on the button would
 * read as a blurred disc with a border.
 */
const BUTTON_CLASS =
  "inline-flex items-center justify-center rounded-full border border-transparent bg-transparent text-white transition-[scale,opacity] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] motion-reduce:transition-none";

type CenterControlsProps = {
  visible: boolean;
  isPlaying: boolean;
  disableSkip: boolean;
  glass: GlassState;
  layerRef: React.Ref<HTMLDivElement>;
  onTogglePlay: () => void;
  onSeekBy: (delta: number) => void;
};

/**
 * The centered play / skip cluster.
 *
 * Invisible until the glass under it is live, and never shown otherwise: the
 * glass is the cluster's only look, so a browser the shader cannot run in
 * gets the bar along the bottom, which plays and seeks, rather than three
 * bare discs. `visibility` so the buttons leave hit-testing and the tab order
 * too, and the computed opacity is left alone for the panes to mirror.
 */
export function CenterControls({
  visible,
  isPlaying,
  disableSkip,
  glass,
  layerRef,
  onTogglePlay,
  onSeekBy,
}: CenterControlsProps) {
  const hidden = glass !== "live";

  return (
    // The reveal fades each button's own opacity (plain CSS): animating scale
    // would move the glass panes under the buttons every frame of the fade.
    <div
      ref={layerRef}
      aria-hidden={!visible || hidden}
      className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2"
    >
      {!disableSkip && (
        <SkipButton
          direction="back"
          visible={visible}
          hidden={hidden}
          onClick={() => onSeekBy(-SKIP_SECONDS)}
        />
      )}

      <button
        type="button"
        onClick={onTogglePlay}
        aria-label={isPlaying ? "Pause" : "Play"}
        tabIndex={visible && !hidden ? undefined : -1}
        className={cn(
          BUTTON_CLASS,
          "h-16 w-16 md:h-[88px] md:w-[88px]",
          hidden && "invisible",
          visible
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0",
        )}
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
          hidden={hidden}
          onClick={() => onSeekBy(SKIP_SECONDS)}
        />
      )}
    </div>
  );
}

function SkipButton({
  direction,
  visible,
  hidden,
  onClick,
}: {
  direction: "back" | "forward";
  visible: boolean;
  hidden: boolean;
  onClick: () => void;
}) {
  const isBack = direction === "back";
  const Icon = isBack ? IconRotate : IconRotateClockwise;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${isBack ? "Back" : "Forward"} ${SKIP_SECONDS} seconds`}
      tabIndex={visible && !hidden ? undefined : -1}
      className={cn(
        "group/skip shrink-0",
        BUTTON_CLASS,
        "h-12 w-12 md:h-[66px] md:w-[66px]",
        hidden && "invisible",
        visible
          ? "pointer-events-auto opacity-100"
          : "pointer-events-none opacity-0",
      )}
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
