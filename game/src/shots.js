// The screenshot scenes behind ?shot=start|play|ring|end. Each one plays the real
// rules forward from a fresh world for a fixed time, steered by a simple autopilot
// (throttle up, rotate at 82 kt, then chase the next ring's lateral position and
// altitude), so the frame is what a short game really looks like and the same seed
// always gives the same frame. The end scene's pilot stops climbing after 12 s,
// so it meets the valley floor the way a careless pilot would.
import { STEP } from './config.js';
import { EVENT_CRASH, EVENT_DONE } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 0;
const PLAY_SECONDS = 24;
const RING_SECONDS = 40;
const END_SECONDS = 60;

function autopilot(state, descend, terrainHeight) {
  const ctl = { throttle: 1, pitch: 0, roll: 0 };
  if (state.status === 'runway') {
    ctl.pitch = state.speedKt >= 82 ? 1 : 0;
    return ctl;
  }
  const ring = state.ring;
  if (!ring) return ctl;
  const latErr = ring.lat - state.lat;
  // Low down, chase the ring gently: a hard bank just after rotation slides
  // the plane sideways into rising ground before it has climbed clear.
  const lowLimit = Math.max(0.25, Math.min(1, state.altFt / 500));
  ctl.roll = Math.max(-1, Math.min(1, latErr / 60)) * lowLimit;
  // Climb for the ring, or higher when a mountain shoulder rises ahead.
  let groundAhead = 0;
  for (let d = state.distance + 100; d <= state.distance + 600; d += 100) {
    groundAhead = Math.max(groundAhead, terrainHeight(d, state.lat));
  }
  const targetAlt = Math.max(ring.altFt, groundAhead * 3.28 + 500);
  const altErr = targetAlt - state.altFt;
  ctl.pitch = descend ? -1 : Math.max(-1, Math.min(1, altErr / 600));
  ctl.throttle = state.speedKt > 200 ? -1 : state.speedKt < 150 ? 1 : 0;
  return ctl;
}

/**
 * Set `world` to the named scene (start, play, ring or end; any other name is
 * start) and return the screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  world.reset();
  if (name !== 'play' && name !== 'ring' && name !== 'end') {
    for (let index = 0; index < START_SECONDS / STEP; index += 1) world.step(STEP, { throttle: 0, pitch: 0, roll: 0 });
    return { screen: SCREEN_TITLE, best: 0 };
  }
  const limit = name === 'play' ? PLAY_SECONDS : name === 'ring' ? RING_SECONDS : END_SECONDS;
  let crashed = false;
  let done = false;
  for (let index = 0; index < limit / STEP; index += 1) {
    const descend = name === 'end' && world.state.time > 12;
    // The ring scene waits for the second gate, flown at altitude: the first
    // gate comes while the plane is still climbing off the runway, too low
    // and too close to frame well. It stops with the gate 180-420 m ahead and
    // its centre inside the frame — a gate far above the plane would sit
    // above the top of the picture, however close it is.
    if (name === 'ring' && world.state.ringsSeen >= 1 && world.state.altFt > 500 && world.state.ring) {
      const ring = world.state.ring;
      const rel = ring.d - world.state.distance;
      const s = 900 / (rel + 60);
      const rx = 640 + (ring.lat - world.state.lat) * s;
      const ry = 296 + (world.state.altFt / 3.28 - ring.altFt / 3.28) * s;
      if (rel < 420 && rel > 180 && ry > 140 && ry < 470 && Math.abs(rx - 640) < 380) break;
    }
    const events = world.step(STEP, autopilot(world.state, descend, world.terrainHeight));
    if (events & EVENT_CRASH) {
      crashed = true;
      break;
    }
    if (events & EVENT_DONE) {
      done = true;
      break;
    }
  }
  const over = crashed || done || world.state.status === 'crashed' || world.state.status === 'done';
  return { screen: over ? SCREEN_OVER : SCREEN_PLAY, best: world.state.score };
}
