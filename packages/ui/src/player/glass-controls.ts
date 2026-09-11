"use client";

import * as React from "react";

/**
 * Liquid glass under the center controls.
 *
 * The buttons keep their handlers, icons and hit areas; each gains a pane of
 * WebGL glass underneath it, rendered by the vendored `liquidglass` library
 * from the live video frame. That shape is forced as much as chosen: the
 * shader only renders elements that are *direct children* of its root, and
 * the buttons sit inside the center layer, so they cannot be glass themselves.
 * What can be a direct child is a panel positioned over each button, inserted
 * before the button layer so it paints underneath. The button supplies the
 * icon and the press; the panel supplies the surface.
 *
 * The root is the player container rather than a wrapper, because the library
 * draws `<video>` straight to the scene with `drawImage` and rasterizes
 * everything else through `html-to-image`. A video nested one div deeper would
 * go down the second path, which cannot read a moving frame: the glass would
 * refract a still, or nothing at all.
 *
 * The cluster is invisible until the shader is confirmed running, and never
 * shown otherwise. The glass is the cluster's only look: a browser the shader
 * cannot run in gets the bar along the bottom, which plays and seeks, rather
 * than three discs in a style the rest of the player does not wear.
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

/**
 * Reading the picture under the panes, so the glyphs stay legible on it.
 *
 * The panes are lenses, not surfaces: they bend the frame rather than covering
 * it, which is the whole effect and also the problem. The glyphs are white, so
 * over the dark half of a shot they read and over a sunlit beach they
 * disappear into it. Nothing about the glass can fix that, because the glass
 * is showing the beach on purpose.
 *
 * So a scrim, and only as much of one as the picture calls for. Over something
 * dark it is not there at all and the lens is clean; over something bright it
 * comes up far enough to put a wall behind the white.
 *
 * The cost is the part worth defending. A frame is copied into a 48px canvas,
 * about a thousand pixels, twenty times a second, and one `getImageData`
 * reads the whole thing back for every pane at once. There is no second
 * animation loop: this rides the one already syncing the boxes, and skips
 * outright while the controls are faded out or while a paused video sits on a
 * frame that has already been read.
 *
 * 50ms, down from 200. At five readings a second a slow pan from dark water to
 * bright sky reached the scrim as a staircase: a step, a quarter-second hold,
 * a step. Twenty readings a second make each step a quarter the size and the
 * ease below runs them together, so the shade tracks the picture instead of
 * answering it in installments. The readback is a thousand pixels; four times
 * as many of them is still nothing.
 */
const SAMPLE_INTERVAL_MS = 50;

/** The scratch frame's width. Small enough that the readback is free, large
 *  enough that a pane covers several pixels of it rather than one. */
const SAMPLE_WIDTH = 48;

/* Where the scrim starts and where it tops out, in relative luminance, and how
   dark it is allowed to get. The floor is above black on purpose: a dim shot
   still reads white-on-dark, and darkening it would only dull the lens.

   The ceiling came down from 0.42. Over a bright sky and open water the three
   lenses sat at the top of the range and read as gray discs on the picture:
   the shade had stopped being a wall behind the glyph and become the thing
   you looked at. At 0.32 the glyph still has something behind it on the
   brightest frame, and the water is still visible through it. */
const SCRIM_FROM = 0.34;
const SCRIM_TO = 0.78;
const SCRIM_MAX = 0.32;

/**
 * How much of the gap to the new reading is closed each frame, by the size of
 * the gap.
 *
 * Two kinds of change reach the scrim and they want opposite treatment. A
 * slow pan from dark water to bright sky arrives as a run of small readings,
 * and those want easing: closed at 8% a frame they run together into a shade
 * that tracks the light without a step anyone can point to. A cut arrives as
 * one big reading, and easing it is the mistake: at a fixed 0.18 the scrim
 * took eleven frames to settle after a cut, which is a disc visibly darkening
 * on a picture that had already changed. The eye forgives almost anything
 * that happens inside a cut and notices everything that happens just after
 * one, so a big gap is closed inside two frames instead: the shade lands with
 * the picture and reads as part of it.
 *
 * One rule rather than a threshold, so there is no gap size at which the
 * behavior flips: the rate climbs with the step from the floor to the cap. At
 * a hundredth of shade it is 0.15; at a tenth, the smallest cut on a typical
 * reel, it is already at the cap.
 *
 * Chosen once per reading, from the size of the step that reading asks for,
 * and held until the next one. Recomputed every frame from the gap still
 * open, the rate fell as the gap closed: a cut that started at the cap
 * trailed off at the floor and took nine frames to settle instead of two.
 */
const SHADE_EASE = 0.08;
const SHADE_SNAP_GAIN = 7;
const SHADE_EASE_MAX = 0.7;

/** The per-frame closure for a reading that moves the shade by `step`. */
function shadeRate(step: number) {
  return Math.min(SHADE_EASE_MAX, SHADE_EASE + step * SHADE_SNAP_GAIN);
}

/** What a pane wears when the frame cannot be read at all: a cross-origin
 *  source, or a browser with no 2D context. Enough to help on a bright shot,
 *  little enough not to spoil a dark one, since which it is cannot be known. */
const SCRIM_BLIND = 0.2;

/** The WebGL glass under the center buttons, or nothing. */
export type GlassState =
  /** Waiting on the shader; the buttons are hidden. */
  | "pending"
  /** The shader is running and the panes are the visible surface. */
  | "live"
  /** The shader is unavailable; the cluster stays hidden and the bar along
   *  the bottom is the control. */
  | "off";

type Pane = {
  button: HTMLElement;
  panel: HTMLElement;
  /** The disc of shade over the lens. A sibling of the panel rather than a
   *  child: the shader rasterizes its own elements, and a node inside one is
   *  a node it may decide to refract. */
  scrim: HTMLElement;
};

type GlassInstance = { destroy: () => void };

/** Every early return hands back the same do-nothing teardown. */
const noop = () => {};

/** A box in the root's own coordinates, which is what the panel is positioned in. */
function boxWithin(child: Element, root: Element) {
  const a = child.getBoundingClientRect();
  const b = root.getBoundingClientRect();
  return { x: a.left - b.left, y: a.top - b.top, w: a.width, h: a.height };
}

/**
 * A luminance reader over the video, shared by every pane.
 *
 * One canvas, one `drawImage`, one `getImageData` per sample, however many
 * panes there are: the readback is the expensive half and doing it once for
 * the whole frame is what keeps this affordable. The panes then average their
 * own patch out of the array that came back.
 *
 * Rec. 709 coefficients on the sRGB values rather than linearized ones. The
 * exact number does not matter here, since it drives an opacity rather than a
 * color decision, and linearizing a thousand pixels twenty times a second to
 * move a scrim by a percent would be paying for precision nobody can see.
 */
function createSampler(video: HTMLVideoElement) {
  const canvas = document.createElement("canvas");
  /* `willReadFrequently` is the difference between a readback that stays on
     the CPU and one that stalls waiting for the GPU every time. */
  const context = canvas.getContext("2d", { willReadFrequently: true });

  let pixels: ImageData | null = null;
  /** Set once a read throws: a tainted canvas cannot untaint, so retrying it
   *  every 50ms would be an exception per sample for the life of the page. */
  let blind = context === null;

  return {
    get blind() {
      return blind;
    },
    /** Copies the current frame. Returns false when there is nothing to read. */
    read(): boolean {
      if (blind || !context) return false;
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (w === 0 || h === 0) return false;

      const width = SAMPLE_WIDTH;
      const height = Math.max(1, Math.round((h / w) * SAMPLE_WIDTH));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      try {
        context.drawImage(video, 0, 0, width, height);
        pixels = context.getImageData(0, 0, width, height);
      } catch {
        /* A cross-origin frame taints the canvas and the read throws. Give up
           for good and let the panes fall back to a fixed scrim. */
        blind = true;
        pixels = null;
        return false;
      }
      return true;
    },
    /**
     * Mean luminance over a box given in normalized frame coordinates.
     *
     * Clamped to at least one pixel on each axis, because a pane an eighth of
     * the frame wide is still only six pixels across at this size and rounding
     * can otherwise collapse the box to nothing.
     */
    luminanceOf(nx: number, ny: number, nw: number, nh: number): number | null {
      if (!pixels) return null;
      const { width, height, data } = pixels;
      const x0 = Math.max(0, Math.min(width - 1, Math.floor(nx * width)));
      const y0 = Math.max(0, Math.min(height - 1, Math.floor(ny * height)));
      const x1 = Math.max(
        x0 + 1,
        Math.min(width, Math.ceil((nx + nw) * width)),
      );
      const y1 = Math.max(
        y0 + 1,
        Math.min(height, Math.ceil((ny + nh) * height)),
      );

      let total = 0;
      let count = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const at = (y * width + x) * 4;
          total +=
            0.2126 * data[at]! +
            0.7152 * data[at + 1]! +
            0.0722 * data[at + 2]!;
          count++;
        }
      }
      return count === 0 ? null : total / count / 255;
    },
  };
}

/**
 * Luminance to how dark the disc over the lens gets.
 *
 * Exported so a check can run the curve rather than read it: the shape is the
 * whole design, flat below the floor so a dark shot keeps a clean lens, capped
 * above it so a white sky cannot black the control out, and none of that is
 * legible from the arithmetic.
 */
export function scrimFor(luminance: number): number {
  const t = (luminance - SCRIM_FROM) / (SCRIM_TO - SCRIM_FROM);
  return Math.max(0, Math.min(1, t)) * SCRIM_MAX;
}

export type GlassControlsTarget = {
  /** The player container: the `<video>`'s parent, and the shader's root. */
  root: HTMLElement;
  video: HTMLVideoElement;
  /** The center layer holding the play / skip buttons. */
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
 * rasterization step that needs a frame, so on a page opened in a background
 * tab `init` does not fail: it never settles at all. Waiting here means the
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

/** Long enough for a slow font fetch and the first rasterization, short enough
 *  that a wedged start-up gives up rather than hanging on to the player. */
const INIT_TIMEOUT_MS = 15_000;

/**
 * `LiquidGlass.init` with a deadline.
 *
 * A promise cannot be canceled, so a start-up that overruns is abandoned
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

    /* The shade, between the lens and the icon. After the panel in the DOM and
       both with `z-index: auto`, so it paints over the glass; still before the
       button layer, so the glyph stays over it.

       No CSS transition on it. One was here to keep a cut in the footage from
       snapping the shade, and it did, but opacity is also what the cluster's
       fade rides, so every hide dragged the disc out over a third of a second
       after the glyph had gone. The easing moved into the loop below, where it
       can apply to the reading without touching the fade. */
    const scrim = document.createElement("div");
    scrim.setAttribute("aria-hidden", "true");
    scrim.dataset.slot = "loomix-glass-scrim";
    scrim.style.position = "absolute";
    scrim.style.pointerEvents = "none";
    scrim.style.background = "rgb(0 0 0)";
    scrim.style.opacity = "0";
    root.insertBefore(scrim, layer);

    return { button, panel, scrim };
  });

  const release = () => {
    for (const { panel, scrim } of panes) {
      panel.remove();
      scrim.remove();
    }
  };

  const sampler = createSampler(video);

  /** Flips once the shader is running and the panels are the visible surface. */
  let live = false;

  /**
   * The cluster's own fade, read once for all three panes.
   *
   * Opacity does not inherit: the computed value on a child knows nothing
   * about an ancestor fading, and the computed value on an ancestor knows
   * nothing about a child. So the reading is the product of the two places
   * the fade can live, the layer and the button, and is right whichever one
   * moves. The three buttons fade together, so one of them stands for all,
   * and this stays at two style reads a frame rather than four.
   */
  const lead = buttons[0]!;
  const clusterAlpha = () =>
    live
      ? (Number(getComputedStyle(layer).opacity) || 0) *
        (Number(getComputedStyle(lead).opacity) || 0)
      : 0;

  /**
   * Position, size and fade, copied from the buttons each frame they change.
   *
   * This runs every frame forever, so what it does *not* do matters as much as
   * what it does. The root is measured once per frame and handed down rather
   * than once per pane, and the fade is two style reads rather than one per
   * pane. With the cluster faded out there is nothing to place, so it stops
   * before touching layout at all. That is the state a player spends most of
   * its time in: playing, with the controls away.
   */
  const sync = () => {
    const alpha = clusterAlpha();
    if (alpha === 0) {
      for (const { panel, scrim } of panes) {
        if (panel.style.opacity !== "0") panel.style.opacity = "0";
        if (scrim.style.opacity !== "0") scrim.style.opacity = "0";
      }
      return;
    }

    const base = root.getBoundingClientRect();
    for (const { button, panel, scrim } of panes) {
      const rect = button.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      if (w === 0 || h === 0) {
        panel.style.opacity = "0";
        scrim.style.opacity = "0";
        continue;
      }
      const x = rect.left - base.left;
      const y = rect.top - base.top;
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
        scrim.style.left = `${x}px`;
        scrim.style.top = `${y}px`;
        scrim.style.width = `${w}px`;
        scrim.style.height = `${h}px`;
        scrim.style.borderRadius = `${radius}px`;
      }

      const shown = String(alpha);
      if (panel.style.opacity !== shown) panel.style.opacity = shown;
      /* The shade follows the reading at a rate set by how far it has to go;
         see `shadeRate`: a slow change eases, a cut lands with the picture.
         Multiplied by the cluster's own fade so a hidden cluster is never a
         dark disc on the picture. The fade is untouched by the easing, which
         is the whole reason the easing lives here and not on a transition. */
      const level = Number(scrim.dataset.level ?? "0");
      const target = Number(scrim.dataset.target ?? "0");
      const eased =
        level +
        (target - level) * Number(scrim.dataset.rate ?? String(SHADE_EASE));
      scrim.dataset.level = String(eased);

      const shade = (alpha * eased).toFixed(3);
      if (scrim.style.opacity !== shade) scrim.style.opacity = shade;
    }
  };

  /**
   * Re-reads the frame and hands each pane its own patch of it.
   *
   * Everything here is a reason not to do the work: nothing is live yet, the
   * cluster is faded out, the video has no frame, or it is paused on one that
   * has already been measured. What is left is a moving picture under a
   * visible control, which is the only case the scrim is for.
   */
  let sampledAt = 0;
  let sampledFrame = -1;
  const measure = (now: number) => {
    if (!live || sampler.blind) return;
    if (now - sampledAt < SAMPLE_INTERVAL_MS) return;
    sampledAt = now;

    /* The whole cluster fades out when the pointer leaves. A reading taken
       then is a reading for controls nobody can see, and the next one lands
       before they are back. */
    if (clusterAlpha() === 0) return;

    /* Mid-seek, `currentTime` already says where the video is going while
       `drawImage` still copies where it was. A reading taken then is of the
       old picture, and on a paused video it would be kept as the reading for
       the new one. Wait for the frame to land. */
    if (video.seeking) return;
    /* A paused video keeps showing the same frame, so once it has been read
       there is nothing to read again until it moves. */
    if (video.paused && video.currentTime === sampledFrame) return;
    if (!sampler.read()) return;
    sampledFrame = video.paused ? video.currentTime : -1;

    const frame = boxWithin(video, root);
    if (frame.w === 0 || frame.h === 0) return;

    for (const { button, scrim } of panes) {
      const box = boxWithin(button, root);
      const luminance = sampler.luminanceOf(
        (box.x - frame.x) / frame.w,
        (box.y - frame.y) / frame.h,
        box.w / frame.w,
        box.h / frame.h,
      );
      if (luminance === null) continue;
      const target = scrimFor(luminance);
      scrim.dataset.rate = String(
        shadeRate(Math.abs(target - Number(scrim.dataset.level ?? "0"))),
      );
      scrim.dataset.target = String(target);
    }
  };

  /* Blind from the start, with no 2D context at all, means no reading will
     ever arrive, so the panes take the fixed fallback once and keep it. */
  if (sampler.blind) {
    for (const { scrim } of panes) {
      scrim.dataset.rate = String(SHADE_EASE_MAX);
      scrim.dataset.target = String(SCRIM_BLIND);
    }
  }

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
     shows the buttons, so the first frame anyone sees is icon over glass. */
  live = true;
  sync();

  /* One loop for both. The boxes have to be checked every frame because the
     cluster scales under a press; the picture does not, and `measure`
     throttles itself rather than adding a timer of its own. */
  let frame = requestAnimationFrame(function tick(now) {
    measure(now);
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
 * Runs the glass under the center controls for the life of the player and
 * reports whether the cluster should show.
 *
 * `pending` from the first render, so the buttons are never painted before
 * the shader has a frame to refract, server-rendered HTML included; `live`
 * once the panes are drawing; `off` when the shader is unavailable, which
 * keeps the cluster hidden and leaves the bottom bar as the control.
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
     paints a frame of bare buttons between the old panes going and the new
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
