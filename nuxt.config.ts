// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ["@nuxt/ui"],
  devtools: {
    enabled: true,
  },
  // Bundle every statically-referenced icon so the app works fully offline
  // (the Tauri build must never fetch icons from the Iconify CDN at runtime)
  icon: {
    clientBundle: {
      scan: true,
      sizeLimitKb: 512,
    },
  },
  css: ["~/assets/css/main.css"],
  compatibilityDate: "2026-06-30",
  ssr: false,
  vite: {
    // Better support for Tauri CLI output
    clearScreen: false,
    // Enable environment variables
    // Additional environment variables can be found at
    // https://v2.tauri.app/reference/environment-variables/
    envPrefix: ["VITE_", "TAURI_"],
    server: {
      // Tauri requires a consistent port
      strictPort: true,
    },
  },
  // Avoids error [unhandledRejection] EMFILE: too many open files, watch
  ignore: ["**/src-tauri/**"],
});
