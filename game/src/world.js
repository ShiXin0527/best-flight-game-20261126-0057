// The flight rules and state, with no drawing and no browser in it. The plane starts
// on the runway, rolls, rotates at 82 kt and flies a 90-second valley run: golden
// rings hang over the valley, each one flown through for points, while the terrain
// below rises into hills and a mountain shoulder. step() advances one fixed step
// and returns what happened as bit flags, so the caller can react without the world
// knowing about screens or sound. Nothing here allocates after createWorld returns.
import {
  DISTANCE_POINTS_PER_M,
  FLIGHT_SECONDS,
  FUEL_DRAIN_PER_S,
  RING_CENTRE_POINTS,
  RING_POINTS,
  ROTATE_KT,
} from './config.js';

export const EVENT_RING = 1;
export const EVENT_CENTRE = 2;
export const EVENT_CRASH = 4;
export const EVENT_DONE = 8;
export const EVENT_LOW_FUEL = 16;

/** Metres per second for one knot. */
const KT_TO_MS = 0.514444;
/** Feet per metre. */
const FT_PER_M = 3.28084;
/** The valley's seeded features: fields, clouds and mountain peaks. */
const FIELD_COUNT = 46;
const CLOUD_COUNT = 14;
const PEAK_COUNT = 5;

function clamp(value, low, high) {
  return value < low ? low : value > high ? high : value;
}

export function createWorld(random) {
  // Seeded valley dressing, fixed for one seed: field patches, cloud puffs and
  // mountain peaks the renderer places with the same projection as the rings.
  const fields = [];
  for (let i = 0; i < FIELD_COUNT; i += 1) {
    fields.push({
      d: 120 + random() * 2600,
      lat: -420 + random() * 840,
      w: 90 + random() * 220,
      len: 120 + random() * 260,
      colour: i % 4,
    });
  }
  const clouds = [];
  for (let i = 0; i < CLOUD_COUNT; i += 1) {
    clouds.push({
      d: 200 + random() * 2800,
      lat: -500 + random() * 1000,
      alt: 950 + random() * 700,
      size: 60 + random() * 130,
      drift: random() * 6,
    });
  }
  const peaks = [];
  for (let i = 0; i < PEAK_COUNT; i += 1) {
    peaks.push({
      d: 900 + random() * 2400,
      lat: -650 + random() * 1300,
      height: 200 + random() * 220,
      width: 260 + random() * 320,
    });
  }
  const ringPhase = random() * Math.PI * 2;
  const hillPhase = random() * Math.PI * 2;

  const state = {
    time: 0,
    timeLeft: FLIGHT_SECONDS,
    distance: 0,
    speedKt: 0,
    throttle: 0,
    altFt: 0,
    headingDeg: 90,
    lat: 0,
    pitchDeg: 0,
    rollDeg: 0,
    vsFpm: 0,
    score: 0,
    ringsHit: 0,
    ringsSeen: 0,
    fuel: 100,
    status: 'runway', // runway | flying | crashed | done
    crashReason: '',
    nextRingAt: 700,
    ring: null,
    lowFuelWarned: false,
    distAcc: 0,
    fields,
    clouds,
    peaks,
    ringPhase,
    hillPhase,
  };

  /** Terrain height in metres at a point ahead of the start line. */
  function terrainHeight(d, lat) {
    // The runway strip blends into the valley instead of ending in a cliff:
    // flat on the centreline, full hills only well clear of it.
    const edge = Math.max(
      clamp((Math.abs(lat) - 60) / 220, 0, 1),
      clamp((d - 1250) / 350, 0, 1),
    );
    let h = 8 + 14 * Math.sin(d * 0.004 + hillPhase) + 8 * Math.sin(d * 0.011 + 1.3);
    h += 6 * Math.sin(lat * 0.006 + d * 0.001);
    for (let i = 0; i < peaks.length; i += 1) {
      const p = peaks[i];
      const dd = (d - p.d) / p.width;
      const dl = (lat - p.lat) / (p.width * 0.8);
      const g = Math.exp(-(dd * dd + dl * dl));
      // The peaks stand on the valley's shoulders, never in the flight
      // corridor: inside |lat| < 240 m the valley floor stays flyable.
      const side = clamp((Math.abs(lat) - 240) / 180, 0, 1);
      h += p.height * g * side;
    }
    return Math.max(0, h * edge);
  }

  function spawnRing() {
    const d = state.nextRingAt;
    // The ring always hangs clear air above the ground under it, so it can
    // never sit inside a hill the plane would have to crash through to reach.
    const lat = -130 + 260 * (0.5 + 0.5 * Math.sin(d * 0.0016 + ringPhase));
    const groundFt = terrainHeight(d, lat) * FT_PER_M;
    state.ring = {
      d,
      lat,
      altFt: groundFt + 480 + random() * 1100,
      radiusM: 55,
      passed: false,
    };
    state.nextRingAt = d + 620 + random() * 320;
  }

  function reset() {
    state.time = 0;
    state.timeLeft = FLIGHT_SECONDS;
    state.distance = 0;
    state.speedKt = 0;
    state.throttle = 0;
    state.altFt = 0;
    state.headingDeg = 90;
    state.lat = 0;
    state.pitchDeg = 0;
    state.rollDeg = 0;
    state.vsFpm = 0;
    state.score = 0;
    state.ringsHit = 0;
    state.ringsSeen = 0;
    state.fuel = 100;
    state.status = 'runway';
    state.crashReason = '';
    state.nextRingAt = 700;
    state.lowFuelWarned = false;
    state.distAcc = 0;
    spawnRing();
  }

  function crash(reason) {
    state.status = 'crashed';
    state.crashReason = reason;
    state.speedKt = Math.max(0, state.speedKt * 0.4);
    return EVENT_CRASH;
  }

  /**
   * One fixed step. `ctl` is { throttle: -1|0|1, pitch: -1..1 (up positive),
   * roll: -1..1 }. Returns event flags.
   */
  function step(dt, ctl) {
    if (state.status === 'crashed' || state.status === 'done') return 0;
    let events = 0;
    state.time += dt;
    state.timeLeft = Math.max(0, FLIGHT_SECONDS - state.time);

    // Throttle: a held key moves it, and it stays where it is left.
    state.throttle = clamp(state.throttle + ctl.throttle * dt * 0.55, 0, 1);
    if (state.fuel <= 0) state.throttle = Math.min(state.throttle, 0.3);
    state.fuel = Math.max(0, state.fuel - FUEL_DRAIN_PER_S * (0.4 + state.throttle) * dt);
    if (state.fuel < 20 && !state.lowFuelWarned) {
      state.lowFuelWarned = true;
      events |= EVENT_LOW_FUEL;
    }

    // Speed chases the throttle: 55 kt idling, 235 kt flat out.
    const targetKt = 55 + state.throttle * 180;
    state.speedKt += (targetKt - state.speedKt) * Math.min(1, dt * 0.55);
    const speedMs = state.speedKt * KT_TO_MS;

    // Roll banks the plane and turns it; heading drifts the lateral position.
    const rollTarget = ctl.roll * 38;
    state.rollDeg += (rollTarget - state.rollDeg) * Math.min(1, dt * 4);
    state.headingDeg = (state.headingDeg + state.rollDeg * 0.28 * dt * (state.speedKt / 140) + 360) % 360;
    state.lat += Math.sin(((state.headingDeg - 90) * Math.PI) / 180) * speedMs * dt;
    state.lat += ctl.roll * speedMs * 0.22 * dt;
    state.lat = clamp(state.lat, -600, 600);

    // Pitch sets the climb rate; on the ground the plane stays put until rotation.
    const pitchTarget = ctl.pitch * 20;
    state.pitchDeg += (pitchTarget - state.pitchDeg) * Math.min(1, dt * 3.5);
    const wantVs = state.status === 'flying'
      ? state.pitchDeg * 140 + (state.throttle - 0.55) * 500
      : 0;
    state.vsFpm += (wantVs - state.vsFpm) * Math.min(1, dt * 1.6);
    if (state.status === 'runway') {
      if (state.speedKt >= ROTATE_KT && ctl.pitch > 0.25) {
        state.status = 'flying';
        state.altFt = 25;
      }
    } else {
      state.altFt += (state.vsFpm / 60) * dt;
    }
    state.distance += speedMs * dt;
    // Distance points accumulate fractionally: a whole point per 100 m flown.
    state.distAcc += speedMs * dt;
    const whole = Math.floor(state.distAcc / DISTANCE_POINTS_PER_M);
    if (whole > 0) {
      state.score += whole;
      state.distAcc -= whole * DISTANCE_POINTS_PER_M;
    }

    // Running off the end of the runway without rotating ends the run too.
    if (state.status === 'runway' && state.distance > 1400) {
      return events | crash('You ran off the end of the runway.');
    }

    // Terrain: the ground rises under the plane; touch it away from the runway
    // and the run is over. The runway itself is flat for its first 1250 m.
    // The margin is small on purpose: at rotation the plane is only a few
    // metres up, and a generous margin would crash it for taking off.
    const groundM = terrainHeight(state.distance, state.lat);
    const altM = state.altFt / FT_PER_M;
    if (state.status === 'flying' && altM <= groundM + 0.3) {
      state.altFt = groundM * FT_PER_M;
      return events | crash(groundM > 260 ? 'You flew into the mountain shoulder.' : 'You clipped the valley floor.');
    }
    if (state.status === 'flying' && state.altFt < 0) {
      state.altFt = 0;
      return events | crash('You touched down off the runway.');
    }

    // Rings: passing one's line scores by how close to the centre the plane is.
    const ring = state.ring;
    if (ring && !ring.passed && state.distance >= ring.d) {
      ring.passed = true;
      state.ringsSeen += 1;
      const latErr = Math.abs(state.lat - ring.lat);
      const altErr = Math.abs(state.altFt - ring.altFt);
      if (latErr < ring.radiusM && altErr < 420) {
        const centre = latErr < 22 && altErr < 150;
        state.score += centre ? RING_CENTRE_POINTS : RING_POINTS;
        state.ringsHit += 1;
        events |= centre ? EVENT_CENTRE : EVENT_RING;
      }
      spawnRing();
    }

    if (state.timeLeft <= 0) {
      state.status = 'done';
      events |= EVENT_DONE;
    }
    return events;
  }

  reset();
  return { state, reset, step, terrainHeight };
}
