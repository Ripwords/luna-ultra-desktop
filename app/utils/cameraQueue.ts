/**
 * Global concurrency limiter for camera HTTP traffic.
 *
 * The Luna's embedded HTTP server is single-connection and low-capacity. Each
 * gallery tile has its own IntersectionObserver that fires a download the moment
 * it nears the viewport, so a screen of tiles would otherwise launch ~16
 * transfers at once — saturating the camera and starving every request (photos,
 * RAW, and video thumbnails alike). The reference app (luna-ai-cut) caps all
 * camera-facing traffic at 2 concurrent transfers via a priority queue; we do
 * the same here.
 *
 * The slot is held for the WHOLE transfer — fetch AND body read — because the
 * camera connection isn't free until the body has been consumed. Callers pass a
 * function that does both. Higher-priority work (an opened full-screen preview)
 * drains ahead of background grid thumbnails.
 */
export const CAMERA_PRIORITY = { THUMBNAIL: 0, LISTING: 1, PREVIEW: 2 } as const;

/**
 * Max concurrent camera transfers. The reference app uses 2; on-device testing
 * showed 2 loads the grid noticeably slowly while the Luna copes with more, so
 * we run 4. If media starts failing en masse again, lower this first.
 */
export const CAMERA_CONCURRENCY = 4;

interface QueuedTask {
  priority: number;
  run: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

let active = 0;
const queue: QueuedTask[] = [];

function drain(): void {
  while (active < CAMERA_CONCURRENCY && queue.length > 0) {
    let best = 0;
    for (let i = 1; i < queue.length; i++) {
      if (queue[i]!.priority > queue[best]!.priority) best = i;
    }
    const task = queue.splice(best, 1)[0]!;
    active++;
    task
      .run()
      .then(task.resolve, task.reject)
      .finally(() => {
        active--;
        drain();
      });
  }
}

/**
 * Run `fn` while holding one of the limited camera slots. `fn` must perform the
 * entire transfer (fetch + body read) so the slot covers the whole download.
 */
export function withCameraSlot<T>(fn: () => Promise<T>, priority: number = CAMERA_PRIORITY.THUMBNAIL): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    queue.push({
      priority,
      run: fn as () => Promise<unknown>,
      resolve: resolve as (value: unknown) => void,
      reject,
    });
    drain();
  });
}
