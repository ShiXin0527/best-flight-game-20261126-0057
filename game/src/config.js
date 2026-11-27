// Ridge Runner — Sunset Valley Flight. Tuning numbers and colours in one place.
// The playfield is a fixed 1280x720 logical area; the renderer scales it to fit the
// window, so no rule below depends on the screen size.
export const FIELD = { width: 1280, height: 720 };
export const HORIZON = 296;
export const STEP = 1 / 60;

/** A flight lasts this long; the clock, not a finish line, ends a run. */
export const FLIGHT_SECONDS = 90;
/** Rings are worth this; a dead-centre pass pays the bonus instead. */
export const RING_POINTS = 100;
export const RING_CENTRE_POINTS = 150;
/** One point per this many metres flown. */
export const DISTANCE_POINTS_PER_M = 100;
/** Fuel starts full and drains with throttle; empty means a forced glide. */
export const FUEL_DRAIN_PER_S = 0.85;
/** Take-off rotation speed, knots. */
export const ROTATE_KT = 82;

export const PALETTE = {
  backdrop: '#1a1430',
  skyTop: '#2b3a6e',
  skyMid: '#7a5a9e',
  skyLow: '#ff9a5c',
  sun: '#ffd9a0',
  sunCore: '#fff3d6',
  farRidge: '#5a4a7a',
  nearRidge: '#3d5a3a',
  groundNear: '#4a7a3f',
  groundFar: '#6a8a4a',
  fieldA: '#7fae4e',
  fieldB: '#c2a55a',
  fieldC: '#5d8a48',
  fieldD: '#a8873f',
  river: '#4f8fd0',
  road: '#5a5a60',
  runway: '#3a3d46',
  runwayMark: '#f2f2e8',
  ring: '#ffc93c',
  ringGlow: '#ff9d2e',
  planeBody: '#e8ecf2',
  planeBelly: '#9fb2c8',
  planeTrim: '#d8443c',
  planeGlass: '#7fd4ff',
  panel: '#141824',
  panelEdge: '#2c3550',
  hud: '#8dff9e',
  hudAmber: '#ffc93c',
  hudRed: '#ff5a4a',
  text: '#f4f1e8',
  muted: '#b8b2a4',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'ridge-runner.best';
