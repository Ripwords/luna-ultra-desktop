declare module "pannellum/build/pannellum.css";
declare module "pannellum/build/pannellum.js";

interface PannellumViewer {
  on(event: string, handler: (arg?: unknown) => void): void;
  destroy(): void;
}

interface PannellumApi {
  viewer(container: HTMLElement | string, config: Record<string, unknown>): PannellumViewer;
}

interface Window {
  pannellum?: PannellumApi;
}
