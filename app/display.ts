/** Call directly from a tap: browsers require user activation for fullscreen. */
export async function enterGameDisplay(landscape: boolean) {
  let fullscreen = !!document.fullscreenElement;
  try {
    if (!fullscreen) await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    fullscreen = !!document.fullscreenElement;
  } catch { /* Keep the full-viewport layout when the platform denies fullscreen. */ }
  let locked = false;
  if (landscape && fullscreen) {
    try {
      const orientation = screen.orientation as ScreenOrientation & { lock?: (orientation: string) => Promise<void> };
      await orientation.lock?.('landscape'); locked = !!orientation.lock;
    } catch { /* The rotate hint remains available on unsupported phones. */ }
  }
  return { fullscreen, locked };
}

export async function exitGameDisplay() {
  try { screen.orientation?.unlock(); } catch { /* Unsupported on some browsers. */ }
  if (document.fullscreenElement) await document.exitFullscreen();
}
