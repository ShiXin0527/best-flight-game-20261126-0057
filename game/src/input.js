// Keyboard and mouse input. Held keys give throttle, pitch and roll; one-shot presses
// (start / restart, pause) are queued as bit flags and taken once by the loop, so a
// press between two frames is never lost and never counted twice. The mouse steers
// too: its position across the window banks and pitches the plane, a click confirms.
//
// Keys: W / S throttle, ArrowUp / ArrowDown pitch (up is climb), ArrowLeft /
// ArrowRight or A / D roll. Mouse: left-right banks, up-down pitches.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;

const THROTTLE_UP = new Set(['KeyW']);
const THROTTLE_DOWN = new Set(['KeyS']);
const PITCH_UP = new Set(['ArrowUp']);
const PITCH_DOWN = new Set(['ArrowDown']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);

export function createInput(canvas) {
  let throttleUp = false;
  let throttleDown = false;
  let pitchUp = false;
  let pitchDown = false;
  let left = false;
  let right = false;
  let actions = 0;
  // Mouse steering, -1..1 across each axis; 0 while the pointer never moved.
  let mouseX = 0;
  let mouseY = 0;
  let mouseActive = false;

  window.addEventListener('keydown', (event) => {
    if (THROTTLE_UP.has(event.code)) throttleUp = true;
    else if (THROTTLE_DOWN.has(event.code)) throttleDown = true;
    else if (PITCH_UP.has(event.code)) pitchUp = true;
    else if (PITCH_DOWN.has(event.code)) pitchDown = true;
    else if (LEFT.has(event.code)) left = true;
    else if (RIGHT.has(event.code)) right = true;
    else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (THROTTLE_UP.has(event.code)) throttleUp = false;
    else if (THROTTLE_DOWN.has(event.code)) throttleDown = false;
    else if (PITCH_UP.has(event.code)) pitchUp = false;
    else if (PITCH_DOWN.has(event.code)) pitchDown = false;
    else if (LEFT.has(event.code)) left = false;
    else if (RIGHT.has(event.code)) right = false;
  });
  window.addEventListener('blur', () => {
    throttleUp = false;
    throttleDown = false;
    pitchUp = false;
    pitchDown = false;
    left = false;
    right = false;
  });
  canvas.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouseY = ((event.clientY - rect.top) / rect.height) * 2 - 1;
    mouseActive = true;
  });
  canvas.addEventListener('pointerdown', () => {
    actions |= ACTION_CONFIRM;
  });

  return {
    /** -1, 0 or 1: throttle down, hold, up. */
    throttle() {
      return (throttleUp ? 1 : 0) - (throttleDown ? 1 : 0);
    },
    /** -1 (dive) .. 1 (climb): keyboard first, mouse position otherwise. */
    pitch() {
      const keys = (pitchUp ? 1 : 0) - (pitchDown ? 1 : 0);
      if (keys !== 0) return keys;
      if (mouseActive && Math.abs(mouseY) > 0.08) return Math.max(-1, Math.min(1, -mouseY));
      return 0;
    },
    /** -1 (left) .. 1 (right): keyboard first, mouse position otherwise. */
    roll() {
      const keys = (right ? 1 : 0) - (left ? 1 : 0);
      if (keys !== 0) return keys;
      if (mouseActive && Math.abs(mouseX) > 0.08) return Math.max(-1, Math.min(1, mouseX));
      return 0;
    },
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
