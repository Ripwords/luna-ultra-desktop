/**
 * Feature flags for work that isn't ready to ship.
 *
 * Each flag defaults to `import.meta.dev`, so in-development features stay
 * visible while running `nuxt dev` / `tauri dev` but are hidden in the packaged
 * release build (`tauri build` → `nuxt generate`, where `import.meta.dev` is
 * false). Hard-code a flag to `true`/`false` to force it in any build.
 */
export const FEATURES = {
  /**
   * Capture modes beyond Video and Photo (Pure, Slow-mo, Pano, Pano HDR,
   * Timelapse). Kept back until each is verified on-device.
   */
  extraCaptureModes: import.meta.dev,

  /**
   * The Color Mode picker (Standard / i-Log / Dolby Vision). The camera accepts
   * `color_mode` but does not apply it — i-Log/Dolby Vision look like shooting
   * modes selected elsewhere — so it's hidden until we find the real lever.
   */
  colorMode: import.meta.dev,
} as const;
