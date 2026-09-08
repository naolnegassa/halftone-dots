/**
 * Types for the vendored `@ybouane/liquidglass` build in `./index.js`,
 * trimmed to the surface the player uses.
 */

/** Per-element glass configuration. */
export interface GlassConfig {
  /** Background blur strength (0 = sharp, 1 = maximum blur). */
  blurAmount: number;
  /** Refraction strength — how much the glass bends the image behind it. */
  refraction: number;
  /** Chromatic aberration — colour fringing at edges. */
  chromAberration: number;
  /** Edge highlight intensity (inner glow / rim lighting). */
  edgeHighlight: number;
  /** Specular highlight intensity (Blinn-Phong). */
  specular: number;
  /** Fresnel reflection intensity at grazing angles. */
  fresnel: number;
  /** Micro-distortion noise strength. */
  distortion: number;
  /** Corner radius in CSS pixels. */
  cornerRadius: number;
  /** Z-radius (bevel depth) — controls the curvature of the pill bevel. */
  zRadius: number;
  /** Overall opacity of the glass panel. */
  opacity: number;
  /** Saturation adjustment (-1 = desaturated, 0 = normal, 1 = vivid). */
  saturation: number;
  /** Tint strength — cool blue-ish glass tint. */
  tintStrength: number;
  /** Brightness adjustment (-0.5 to 0.5). */
  brightness: number;
  /** Shadow opacity (0 = no shadow, 1 = full black). */
  shadowOpacity: number;
  /** Shadow spread in CSS pixels. */
  shadowSpread: number;
  /** Shadow vertical offset in CSS pixels. */
  shadowOffsetY: number;
  /** Whether this glass element can be dragged around (Pointer Events). */
  floating: boolean;
  /** Whether this glass element behaves as a button (hover lift + press effect). */
  button: boolean;
  /** Bevel mode: 0 = biconvex pill (default), 1 = dome. */
  bevelMode: number;
}

/** Options accepted by {@link LiquidGlass.init}. */
export interface LiquidGlassOptions {
  /** Root container element. Glass elements must be its direct children. */
  root: HTMLElement;
  /** Elements to apply the glass effect to. */
  glassElements?: NodeListOf<HTMLElement> | HTMLElement[];
  /** Override the default configuration values. */
  defaults?: Partial<GlassConfig>;
}

export declare class LiquidGlass {
  static init(options: LiquidGlassOptions): Promise<LiquidGlass>;
  readonly root: HTMLElement;
  readonly defaults: GlassConfig;
  /** Current frames-per-second (updated every frame). */
  fps: number;
  /** Stop the render loop, remove injected canvases and free WebGL resources. */
  destroy(): void;
  /** Flag content the library cannot observe on its own for a re-render. */
  markChanged(element?: HTMLElement): void;
}

export declare const DEFAULTS: GlassConfig;

/** Call after dynamically loading new font stylesheets so the next `init()` rebuilds the embedded font cache. */
export declare function invalidateFontEmbedCache(): void;
