"use client";

import * as React from "react";

/**
 * Liquid glass under the centre controls.
 *
 * The buttons keep their handlers, icons and hit areas; each gains a pane of
 * WebGL glass underneath it, rendered by the vendored `liquidglass` library
 * from the live video frame. That shape is forced as much as chosen: the
 * shader only renders elements that are *direct children* of its root, and
 * the buttons sit inside the centre layer, so they cannot be glass themselves.
 * What can be a direct child is a panel positioned over each button, inserted
 * before the button layer so it paints underneath. The button supplies the
 * icon and the press; the panel supplies the surface.
 *
 * The root is the player container rather than a wrapper, because the library
 * draws `<video>` straight to the scene with `drawImage` and rasterises
 * everything else through `html-to-image`. A video nested one div deeper would
 * go down the second path, which cannot read a moving frame: the glass would
 * refract a still, or nothing at all.
 *
 * Until the shader is confirmed running the player keeps its own glass (the SVG
 * displacement filter in `liquid-glass.tsx`), and the buttons stay hidden so
 * that fallback is never seen, not even for the frames it takes to replace it.
 * If WebGL is missing, the context is refused, or start-up overruns, the
 * buttons are revealed wearing the fallback and the player is exactly what it
 * would have been.
 */

/**
 * The library's `Regular Glass`: its defaults with the frosting turned off.
 *
 * Everything the effect is known for lives in the defaults. Refraction bends
 * the picture through the bevel, the fresnel term and the edge highlight draw
 * the rim, a touch of chromatic aberration splits the light along it, and the
 * drop shadow lifts the pane off the frame. Blur is the one thing that hides
 * all of that, because a blurred picture has no edges left to bend, and at
 * any strength it reads as a CSS backdrop filter rather than as glass.
 *
 * Not `button`. That mode brightens the pane on hover and flattens it on
 * press, and on a lens this size the hover lands as a hard dark ring around a
 * washed-out disc. The player's own affordance for the press is its scale,
 * which the pane already follows.
 */
const REGULAR_GLASS = { blurAmount: 0 } as const;

/** The WebGL glass under the centre buttons, or the SVG-filter fallback. */
export type GlassState =
  /** Waiting on the shader; the buttons are hidden so no fallback is seen. */
  | "pending"
  /** The shader is running and the panes are the visible surface. */
  | "live"
  /** The shader is unavailable; the buttons wear the player's own glass. */
  | "off";

type Pane = { button: HTMLElement; panel: HTMLElement };

type GlassInstance = { destroy: () => void };

/** Every early return hands back the same do-nothing teardown. */
const noop = () => {};

/** A box in the root's own coordinates, which is what the panel is positioned in. */
function boxWithin(child: Element, root: Element) {
  const a = child.getBoundingClientRect();
  const b = root.getBoundingClientRect();
  return { x: a.left - b.left, y: a.top - b.top, w: a.width, h: a.height };
}

export type GlassControlsTarget = {
  /** The player container: the `<video>`'s parent, and the shader's root. */
  root: HTMLElement;
  video: HTMLVideoElement;
  /** The centre layer holding the play / skip buttons. */
  layer: HTMLElement;
};

/**
 * Resolves once the player has a size.
 *
 * The panels are positioned from the buttons' own boxes, so the frame has to
 * be laid out first. A player mounted inside a hidden tab has no height until
 * it is shown, so this watches for one rather than measuring zeros, and gives
 * up rather than observing a page forever if it never comes.
 */
function waitForLayout(
  root: HTMLElement,
  signal: AbortSignal,
): Promise<boolean> {
  if (root.getBoundingClientRect().height > 0) return Promise.resolve(true);

  return new Promise((resolve) => {
    const stop = (value: boolean) => {
      observer.disconnect();
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      resolve(value);
    };
    const onAbort = () => stop(false);
    const observer = new ResizeObserver(() => {
      if (root.getBoundingClientRect().height > 0) stop(true);
    });
    const timer = setTimeout(() => stop(false), 10_000);

    observer.observe(root);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Resolves once the page is actually on screen.
 *
 * Everything below depends on `requestAnimationFrame`, and a browser stops
 * firing it entirely in a background tab. The library's own start-up waits on a
 * rasterisation step that needs a frame, so on a page opened in a background
 * tab `init` does not fail — it never settles at all. Waiting here means the
 * player is only ever touched at a moment when the work can finish.
 */
function waitForVisible(signal: AbortSignal): Promise<boolean> {
  if (document.visibilityState === "visible") return Promise.resolve(true);

  return new Promise((resolve) => {
    const stop = (value: boolean) => {
      document.removeEventListener("visibilitychange", onVisible);
      signal.removeEventListener("abort", onAbort);
      resolve(value);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") stop(true);
    };
    const onAbort = () => stop(false);

    document.addEventListener("visibilitychange", onVisible);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Resolves once the video has presented a frame the shader can copy.
 *
 * The scene behind each pane is built by drawing the `<video>` onto a canvas,
 * and that copies the frame the video is currently showing. Loaded is not the
 * same as shown: with a poster up, a paused video keeps its first frame decoded
 * but never presents it, so `readyState` says a frame exists while `drawImage`
 * copies nothing. The library paints the canvas white first, so a pane over
 * such a video is a pane over white, and every button is a flat white disc
 * until playback starts.
 *
 * A seek to the current position makes the browser present a frame without
 * moving in the clip. `requestVideoFrameCallback` is the signal that it has
 * been composited; `seeked` stands in where that API is missing. A playing
 * video presents frames on its own and needs no nudge.
 */
function waitForFrame(
  video: HTMLVideoElement,
  signal: AbortSignal,
): Promise<boolean> {
  const canWatchFrames = "requestVideoFrameCallback" in video;
  if (!video.paused && !canWatchFrames) return Promise.resolve(true);

  return new Promise((resolve) => {
    let watch = 0;
    const stop = (value: boolean) => {
      if (watch) video.cancelVideoFrameCallback(watch);
      video.removeEventListener("seeked", onFrame);
      video.removeEventListener("loadedmetadata", nudge);
      signal.removeEventListener("abort", onAbort);
      resolve(value);
    };
    const onFrame = () => stop(true);
    const onAbort = () => stop(false);
    const nudge = () => {
      const at = video.currentTime;
      video.currentTime = at;
    };

    signal.addEventListener("abort", onAbort, { once: true });
    if (canWatchFrames) watch = video.requestVideoFrameCallback(onFrame);
    video.addEventListener("seeked", onFrame);

    if (video.paused) {
      /* The seek needs a duration to seek within; before metadata there is
         none and the assignment is dropped. */
      video.preload = "auto";
      if (video.readyState >= HTMLMediaElement.HAVE_METADATA) nudge();
      else video.addEventListener("loadedmetadata", nudge, { once: true });
    }
  });
}

/** Long enough for a slow font fetch and the first rasterisation, short enough
 *  that a wedged start-up gives up rather than hanging on to the player. */
const INIT_TIMEOUT_MS = 15_000;

/**
 * `LiquidGlass.init` with a deadline.
 *
 * A promise cannot be cancelled, so a start-up that overruns is abandoned
 * rather than stopped: if it does eventually settle, the instance it produces
 * is destroyed on arrival instead of being left running against a player that
 * has already been handed back.
 */
function initWithDeadline(
  start: Promise<GlassInstance>,
): Promise<GlassInstance> {
  let expired = false;

  return Promise.race([
    start.then((instance) => {
      if (expired) {
        instance.destroy();
        throw new Error("glass: init resolved after its deadline");
      }
      return instance;
    }),
    new Promise<never>((_, reject) => {
      setTimeout(() => {
        expired = true;
        reject(new Error("glass: init did not settle"));
      }, INIT_TIMEOUT_MS);
    }),
  ]);
}

type Attached = {
  /** Whether the shader is running and the panes are the visible surface. */
  live: boolean;
  teardown: () => void;
};

/**
 * Attaches the effect and returns a teardown.
 *
 * Resolves with `live: false` and a no-op teardown when the layer holds no
 * buttons, when the browser has no WebGL, when start-up overruns, or when the
 * caller unmounted while it waited. Failing quiet is deliberate: this is a
 * finish on a control that already works without it, so a browser that cannot
 * draw it should get the player, not an error.
 */
export async function attachGlassControls(
  { root, video, layer }: GlassControlsTarget,
  signal: AbortSignal,
): Promise<Attached> {
  const bail = { live: false, teardown: noop };

  if (!(await waitForLayout(root, signal)) || signal.aborted) return bail;
  const buttons = Array.from(layer.querySelectorAll("button"));
  if (buttons.length === 0) return bail;

  if (!(await waitForVisible(signal)) || signal.aborted) return bail;
  if (!(await waitForFrame(video, signal)) || signal.aborted) return bail;

  const { LiquidGlass } = await import("./liquidglass/index.js");
  if (signal.aborted) return bail;

  const panes: Pane[] = buttons.map((button) => {
    const panel = document.createElement("div");
    panel.setAttribute("aria-hidden", "true");
    panel.dataset.slot = "loomix-glass";
    panel.style.position = "absolute";
    /* The library draws into a canvas it injects at `z-index: -1` inside the
       panel. A negative z-index sits inside the nearest stacking context, and
       an absolutely positioned box with `z-index: auto` does not form one, so
       without this the canvas escapes the panel and paints behind the video. */
    panel.style.isolation = "isolate";
    /* The button above it takes every pointer, so the glass must not intercept
       the click it is sitting under. */
    panel.style.pointerEvents = "none";
    /* Nothing to show until the shader has drawn into it. */
    panel.style.opacity = "0";

    /* Before the button layer, so it paints below it. Appending instead would
       put the glass over the icon it is meant to sit behind. */
    root.insertBefore(panel, layer);

    return { button, panel };
  });

  const release = () => {
    for (const { panel } of panes) panel.remove();
  };

  /** Flips once the shader is running and the panels are the visible surface. */
  let live = false;

  /** Position, size and fade, copied from the button each frame it changes. */
  const sync = () => {
    for (const { button, panel } of panes) {
      const { x, y, w, h } = boxWithin(button, root);
      if (w === 0 || h === 0) {
        panel.style.opacity = "0";
        continue;
      }
      const radius = Math.round(h / 2);
      const next = `${x}px|${y}px|${w}px|${h}px|${radius}`;
      if (panel.dataset.box !== next) {
        panel.dataset.box = next;
        panel.style.left = `${x}px`;
        panel.style.top = `${y}px`;
        panel.style.width = `${w}px`;
        panel.style.height = `${h}px`;
        panel.dataset.config = JSON.stringify({
          ...REGULAR_GLASS,
          /* A circle wants both at half its height, which makes the whole
             disc bevel: a lens rather than a flat pane with rounded corners. */
          cornerRadius: radius,
          zRadius: radius,
        });
      }
      /* The player fades the cluster in and out with the pointer. The panel is
         not inside that layer, so it has to be told. */
      const shown = live ? getComputedStyle(button).opacity : "0";
      if (panel.style.opacity !== shown) panel.style.opacity = shown;
    }
  };

  sync();

  let instance: GlassInstance;
  try {
    instance = await initWithDeadline(
      LiquidGlass.init({
        root,
        glassElements: panes.map((pane) => pane.panel),
      }),
    );
  } catch {
    /* No WebGL, the context was refused, or start-up overran. Drop the panels
       and leave the player exactly as it would have been. */
    release();
    return bail;
  }

  if (signal.aborted) {
    instance.destroy();
    release();
    return bail;
  }

  /* The shader is running, so the panels are now the surface. The caller
     strips the player's own glass off the buttons and shows them, so the
     first frame anyone sees is icon over glass. */
  live = true;
  sync();

  let frame = requestAnimationFrame(function tick() {
    sync();
    frame = requestAnimationFrame(tick);
  });

  return {
    live: true,
    teardown: () => {
      cancelAnimationFrame(frame);
      instance.destroy();
      release();
    },
  };
}

/**
 * Runs the glass under the centre controls for the life of the player and
 * reports which surface the buttons should wear.
 *
 * `pending` from the first render, so the buttons are never painted in their
 * fallback glass while the shader starts; `live` once the panes are drawing;
 * `off` when the shader is unavailable and the fallback is the surface.
 *
 * Re-runs when `deps` change (a new source, a different set of buttons) and
 * tears down what it built first. If the caller unmounts while start-up is
 * still waiting on the player or the shader, the teardown runs on arrival
 * rather than leaving a render loop over a node no longer in the document.
 */
export function useGlassControls(
  refs: {
    root: React.RefObject<HTMLElement | null>;
    video: React.RefObject<HTMLVideoElement | null>;
    layer: React.RefObject<HTMLElement | null>;
  },
  deps: React.DependencyList,
): GlassState {
  const [glass, setGlass] = React.useState<GlassState>("pending");
  /* Reset during render rather than in the effect, so a source change never
     paints a frame of fallback glass between the old panes going and the new
     ones arriving. */
  const [seen, setSeen] = React.useState(deps);
  if (!sameDeps(seen, deps)) {
    setSeen(deps);
    setGlass("pending");
  }

  React.useEffect(() => {
    const root = refs.root.current;
    const video = refs.video.current;
    const layer = refs.layer.current;
    if (!root || !video || !layer) {
      setGlass("off");
      return;
    }

    const controller = new AbortController();
    let detach: (() => void) | null = null;

    void attachGlassControls({ root, video, layer }, controller.signal).then(
      ({ live, teardown }) => {
        if (controller.signal.aborted) {
          teardown();
          return;
        }
        detach = teardown;
        setGlass(live ? "live" : "off");
      },
    );

    return () => {
      controller.abort();
      detach?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return glass;
}

function sameDeps(a: React.DependencyList, b: React.DependencyList): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (!Object.is(a[i], b[i])) return false;
  }
  return true;
}
