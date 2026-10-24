import type { Side } from './race-v2';
/** One stroke per pull, even if a pointer crosses the threshold repeatedly. */
export class RowGesture {
  private pointer: number | null = null;
  private startY = 0;
  private startX = 0;
  private fired = false;
  start(id: number, y: number, x = 0) {
    if (this.pointer !== null) return false;
    this.pointer = id; this.startY = y; this.startX = x; this.fired = false; return true;
  }
  move(id: number, y: number, x = 0) {
    if (id !== this.pointer) return { progress: 0, stroke: false };
    const progress = Math.max(0, Math.min(1, Math.max(y - this.startY, Math.abs(x - this.startX)) / 48));
    const stroke = !this.fired && progress === 1;
    this.fired ||= stroke;
    return { progress, stroke };
  }
  owns(id: number) { return this.pointer === id; }
  cancel() { this.pointer = null; this.fired = false; }
}
export function clampLook(yaw: number, pitch: number) {
  return { yaw: Math.max(-Math.PI / 3, Math.min(Math.PI / 3, yaw)), pitch: Math.max(-Math.PI / 12, Math.min(Math.PI / 12, pitch)) };
}
export function mountControls(root: HTMLElement, options: {
  enabled: () => boolean;
  tapMode: () => boolean;
  paddle: (side?: Side) => void;
  preview: (progress: number, side?: Side) => void;
  look: (yaw: number, pitch: number) => void;
}) {
  const row = new RowGesture();
  let yaw = 0, pitch = 0;
  let side: Side = 'left';
  let activeButton: HTMLButtonElement | null = null;
  let look: { id: number; x: number; y: number } | null = null;
  const captures = new Map<number, HTMLElement>();
  const release = (id: number) => {
    const element = captures.get(id); captures.delete(id);
    if (element?.hasPointerCapture(id)) element.releasePointerCapture(id);
  };
  function cancel() {
    row.cancel(); look = null; options.preview(0);
    activeButton?.style.setProperty('--pull', '0%');
    for (const id of captures.keys()) release(id);
  }
  function down(event: PointerEvent) {
    const target = event.target as HTMLElement;
    const button = target.closest<HTMLButtonElement>('.paddle-button');
    const zone = target.closest<HTMLElement>('[data-look-zone]');
    if ((!button && !zone) || !options.enabled() || event.button !== 0) return;
    event.preventDefault();
    if (button) {
      if (button.disabled || !row.start(event.pointerId, event.clientY, event.clientX)) return;
      side = button.dataset.side === 'right' ? 'right' : 'left'; activeButton = button;
      if (options.tapMode()) options.paddle(side);
    } else {
      if (look) return;
      look = { id: event.pointerId, x: event.clientX, y: event.clientY };
    }
    const element = button || zone!;
    element.setPointerCapture(event.pointerId); captures.set(event.pointerId, element);
  }
  function move(event: PointerEvent) {
    if (!captures.has(event.pointerId)) return;
    if (!options.enabled()) { cancel(); return; }
    event.preventDefault();
    if (row.owns(event.pointerId) && !options.tapMode()) {
      const result = row.move(event.pointerId, event.clientY, event.clientX);
      options.preview(result.progress, side);
      activeButton?.style.setProperty('--pull', `${result.progress * 100}%`);
      if (result.stroke) options.paddle(side);
    } else if (look?.id === event.pointerId) {
      const next = clampLook(yaw - (event.clientX - look.x) * .006, pitch - (event.clientY - look.y) * .004);
      yaw = next.yaw; pitch = next.pitch; look.x = event.clientX; look.y = event.clientY;
      options.look(yaw, pitch);
    }
  }
  function up(event: PointerEvent) {
    if (row.owns(event.pointerId)) {
      row.cancel(); options.preview(0);
      activeButton?.style.setProperty('--pull', '0%');
    }
    if (look?.id === event.pointerId) look = null;
    release(event.pointerId);
  }
  function visibility() { if (document.hidden) cancel(); }
  root.addEventListener('pointerdown', down);
  root.addEventListener('pointermove', move);
  root.addEventListener('pointerup', up);
  root.addEventListener('pointercancel', up);
  root.addEventListener('lostpointercapture', up);
  window.addEventListener('blur', cancel);
  window.addEventListener('resize', cancel);
  document.addEventListener('visibilitychange', visibility);
  return {
    cancel,
    recenter() { cancel(); yaw = 0; pitch = 0; options.look(0, 0); },
    remove() {
      cancel();
      root.removeEventListener('pointerdown', down); root.removeEventListener('pointermove', move);
      root.removeEventListener('pointerup', up); root.removeEventListener('pointercancel', up); root.removeEventListener('lostpointercapture', up);
      window.removeEventListener('blur', cancel); window.removeEventListener('resize', cancel);
      document.removeEventListener('visibilitychange', visibility);
    }
  };
}
