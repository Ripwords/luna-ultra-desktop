/**
 * Watches for the camera going silent mid-session. Only transport failures
 * count: a thrown fetch (timeout, refused connection, Wi-Fi gone). Any
 * completed HTTP response, including a 404 for a missing file, proves the
 * camera is answering and resets the count, so one bad file can never end a
 * working session.
 */
export const FAILURE_THRESHOLD = 3;

let consecutiveFailures = 0;
let onDeadCallback: (() => void) | null = null;

/** Start counting. Replaces any previous callback and resets the count. */
export function armCameraHealth(onDead: () => void): void {
  consecutiveFailures = 0;
  onDeadCallback = onDead;
}

/** Stop counting. Reports become no-ops until armed again. */
export function disarmCameraHealth(): void {
  consecutiveFailures = 0;
  onDeadCallback = null;
}

export function reportCameraSuccess(): void {
  if (!onDeadCallback) return;
  consecutiveFailures = 0;
}

export function reportCameraFailure(): void {
  if (!onDeadCallback) return;
  consecutiveFailures += 1;
  if (consecutiveFailures < FAILURE_THRESHOLD) return;
  // Disarm before invoking so a burst of concurrent in-flight failures
  // cannot fire the callback more than once.
  const callback = onDeadCallback;
  disarmCameraHealth();
  callback();
}
