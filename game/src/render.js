// Drawing only: the world's state and the current screen in, pixels out. The
// 1280x720 playfield is scaled to fit the window and centred, the margin filled
// with the backdrop colour. The valley is drawn with one pinhole projection:
// a point d metres ahead, lat metres to the side and h metres up lands at
// x = 640 + (lat - planeLat) * 900 / (d + 60),
// y = horizon + (camH - h) * 900 / (d + 60).
// Ground strips, field patches, the river, the road, the runway and the rings all
// go through that projection, so the world holds together as the plane moves.
import { FIELD, HORIZON, PALETTE, FONT } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

const FT_PER_M = 3.28084;
const PANEL = { width: 640, top: 128, line: 32, bottom: 64 };

function lerp(a, b, t) {
  return a + (b - a) * t;
}
function hexRgb(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}
function mix(hexA, hexB, t) {
  const a = hexRgb(hexA);
  const b = hexRgb(hexB);
  return `rgb(${Math.round(lerp(a[0], b[0], t))},${Math.round(lerp(a[1], b[1], t))},${Math.round(lerp(a[2], b[2], t))})`;
}
function pad3(value) {
  return String(Math.round(value)).padStart(3, '0');
}
function fmtTime(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const fonts = new Map();
  let bestShown = 0;

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  function text(value, x, y, size, color, align = 'left', bold = false) {
    const key = `${size}${bold ? 'b' : ''}`;
    if (!fonts.has(key)) fonts.set(key, `${bold ? '700 ' : ''}${size}px ${FONT}`);
    context.font = fonts.get(key);
    context.fillStyle = color;
    context.textAlign = align;
    context.textBaseline = 'alphabetic';
    context.fillText(value, x, y);
  }

  function proj(state, d, lat, hM) {
    // The chase camera never sits exactly on the ground: at 0 ft the ground
    // plane would collapse to the horizon line, so the projection lifts the
    // camera to 25 m. The runway and the valley floor then keep their depth
    // on the title screen and in a crash frame too.
    const camH = Math.max(state.altFt / FT_PER_M, 25);
    const s = 900 / (d + 60);
    return { x: 640 + (lat - state.lat) * s, y: HORIZON + (camH - hM) * s, s };
  }

  function quad(points, fill) {
    context.fillStyle = fill;
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) context.lineTo(points[i].x, points[i].y);
    context.closePath();
    context.fill();
  }

  function drawSky(state, now) {
    const g = context.createLinearGradient(0, 0, 0, HORIZON + 40);
    g.addColorStop(0, PALETTE.skyTop);
    g.addColorStop(0.55, PALETTE.skyMid);
    g.addColorStop(1, PALETTE.skyLow);
    context.fillStyle = g;
    context.fillRect(0, 0, FIELD.width, HORIZON + 40);
    // Low sun, west ahead-left, with a warm glow.
    const sunX = 930 - state.headingDeg * 0.4;
    const sunY = 168;
    const glow = context.createRadialGradient(sunX, sunY, 8, sunX, sunY, 150);
    glow.addColorStop(0, 'rgba(255, 243, 214, 0.95)');
    glow.addColorStop(0.25, 'rgba(255, 217, 160, 0.55)');
    glow.addColorStop(1, 'rgba(255, 154, 92, 0)');
    context.fillStyle = glow;
    context.fillRect(sunX - 150, sunY - 150, 300, 300);
    context.fillStyle = PALETTE.sunCore;
    context.beginPath();
    context.arc(sunX, sunY, 34, 0, Math.PI * 2);
    context.fill();
    // Far ridge silhouettes, parallaxed by heading and lateral position.
    for (let layer = 0; layer < 2; layer += 1) {
      const base = HORIZON - (layer === 0 ? 34 : 12);
      const amp = layer === 0 ? 46 : 22;
      const shift = (state.headingDeg - 90) * (layer === 0 ? 1.6 : 0.9) + state.lat * (layer === 0 ? 0.05 : 0.02);
      context.fillStyle = layer === 0 ? PALETTE.farRidge : PALETTE.nearRidge;
      context.beginPath();
      context.moveTo(-20, HORIZON + 2);
      for (let x = -20; x <= 1300; x += 40) {
        const px = x - shift;
        const y = base - Math.abs(Math.sin((px + layer * 173) * 0.011) * amp) - Math.abs(Math.sin((px + layer * 61) * 0.027) * amp * 0.45);
        context.lineTo(x, y);
      }
      context.lineTo(1300, HORIZON + 2);
      context.closePath();
      context.fill();
    }
    void now;
  }

  function drawGround(state) {
    // Ground strips, far to near, each one fogged toward the horizon colour.
    // The strip's half-width grows with distance, so the ground fills the whole
    // width below the horizon instead of narrowing to a wedge: at 9 km out the
    // ground is still wider than the screen.
    const camH = state.altFt / FT_PER_M;
    const strips = 26;
    const farD = 9000;
    for (let i = strips - 1; i >= 0; i -= 1) {
      const d0 = 60 + (i * farD) / strips;
      const d1 = 60 + ((i + 1) * farD) / strips;
      const fog = Math.min(0.85, i / strips + 0.08);
      const half0 = 520 + d0 * 0.9;
      const half1 = 520 + d1 * 0.9;
      const a = proj(state, d0, state.lat - half0, 0);
      const b = proj(state, d0, state.lat + half0, 0);
      const c = proj(state, d1, state.lat + half1, 0);
      const d = proj(state, d1, state.lat - half1, 0);
      const base = i % 2 === 0 ? PALETTE.groundNear : PALETTE.groundFar;
      quad([a, b, c, d], mix(base, PALETTE.skyLow, fog * 0.55));
    }
    // Field patches.
    const fieldColours = [PALETTE.fieldA, PALETTE.fieldB, PALETTE.fieldC, PALETTE.fieldD];
    for (const f of state.fields) {
      const rel = f.d - state.distance;
      if (rel < 30 || rel > 2400) continue;
      const p1 = proj(state, rel, f.lat - f.w / 2, 2);
      const p2 = proj(state, rel, f.lat + f.w / 2, 2);
      const p3 = proj(state, rel + f.len, f.lat + f.w / 2, 2);
      const p4 = proj(state, rel + f.len, f.lat - f.w / 2, 2);
      if (Math.max(p1.x, p2.x, p3.x, p4.x) < -40 || Math.min(p1.x, p2.x, p3.x, p4.x) > 1320) continue;
      quad([p1, p2, p3, p4], mix(fieldColours[f.colour], PALETTE.skyLow, Math.min(0.7, rel / 2600)));
    }
    // Mountain shoulders: solid triangles rising out of the valley floor, so
    // the ground the plane can hit is visible, not just a number.
    // Two faces, shaded differently, so the peak reads as a solid mountain.
    // The drawn peak is flatter than the terrain height and its apex sits
    // off-centre: a perfect tall triangle reads as a pyramid, not a mountain.
    for (let pi = 0; pi < state.peaks.length; pi += 1) {
      const p = state.peaks[pi];
      const rel = p.d - state.distance;
      // Only the distant shoulders are drawn: a peak the plane is about to
      // pass would fill the frame, and the near ones are the ridge silhouettes.
      if (rel < 800 || rel > 2400) continue;
      const halfW = p.width * 0.45;
      const baseL = proj(state, rel, p.lat - halfW, 0);
      const baseR = proj(state, rel, p.lat + halfW, 0);
      const apex = proj(state, rel, p.lat + ((pi % 3) - 1) * halfW * 0.3, p.height * 0.55);
      if (apex.y > 700) continue;
      const fog = Math.min(0.6, rel / 2600);
      const baseM = { x: (baseL.x + baseR.x) / 2, y: (baseL.y + baseR.y) / 2 };
      quad([baseL, baseM, apex], mix('#3d4a33', '#7a6a9e', fog));
      quad([baseM, baseR, apex], mix('#55663f', '#7a6a9e', fog));
      // Snow cap: only the tip, so a near peak does not turn into a white wall.
      const capL = { x: lerp(baseL.x, apex.x, 0.85), y: lerp(baseL.y, apex.y, 0.85) };
      const capR = { x: lerp(baseR.x, apex.x, 0.85), y: lerp(baseR.y, apex.y, 0.85) };
      quad([capL, capR, apex], mix('#e8e4da', '#7a6a9e', fog));
    }
    // River: a winding band crossing the valley.
    context.strokeStyle = PALETTE.river;
    context.lineCap = 'round';
    for (let d = 80; d < 2400; d += 80) {
      const rel = d;
      const latC = 250 * Math.sin((state.distance + d) * 0.0016 + 1.7);
      const p1 = proj(state, rel, latC - 16, 3);
      const p2 = proj(state, rel + 80, 250 * Math.sin((state.distance + d + 80) * 0.0016 + 1.7) - 16, 3);
      context.lineWidth = Math.max(1, 14 * p1.s);
      context.beginPath();
      context.moveTo(p1.x, p1.y);
      context.lineTo(p2.x, p2.y);
      context.stroke();
    }
    // Road along the valley floor.
    for (let d = 80; d < 2400; d += 120) {
      const p1 = proj(state, d, -190, 3);
      const p2 = proj(state, d + 120, -190, 3);
      context.strokeStyle = PALETTE.road;
      context.lineWidth = Math.max(1, 9 * p1.s);
      context.beginPath();
      context.moveTo(p1.x, p1.y);
      context.lineTo(p2.x, p2.y);
      context.stroke();
    }
  }

  function drawRunway(state) {
    // The runway occupies world distances 0..1250 m on the centreline.
    if (state.distance > 1500) return;
    const camH = state.altFt / FT_PER_M;
    void camH;
    for (let d = -40; d < 1250; d += 90) {
      const rel0 = d - state.distance;
      const rel1 = d + 90 - state.distance;
      if (rel1 < 8 || rel0 > 2400) continue;
      const p1 = proj(state, Math.max(8, rel0), -23, 4);
      const p2 = proj(state, Math.max(8, rel0), 23, 4);
      const p3 = proj(state, Math.max(8, rel1), 23, 4);
      const p4 = proj(state, Math.max(8, rel1), -23, 4);
      quad([p1, p2, p3, p4], PALETTE.runway);
      // Centreline dashes.
      if (((d / 90) | 0) % 2 === 0) {
        const q1 = proj(state, Math.max(8, rel0 + 12), -1.6, 5);
        const q2 = proj(state, Math.max(8, rel0 + 12), 1.6, 5);
        const q3 = proj(state, Math.max(8, rel0 + 62), 1.6, 5);
        const q4 = proj(state, Math.max(8, rel0 + 62), -1.6, 5);
        quad([q1, q2, q3, q4], PALETTE.runwayMark);
      }
    }
    // Threshold bars at the far end.
    const t0 = proj(state, Math.max(8, 1180 - state.distance), -20, 5);
    const t1 = proj(state, Math.max(8, 1180 - state.distance), 20, 5);
    const t2 = proj(state, Math.max(8, 1230 - state.distance), 20, 5);
    const t3 = proj(state, Math.max(8, 1230 - state.distance), -20, 5);
    if (state.distance < 1250) quad([t0, t1, t2, t3], PALETTE.runwayMark);
  }

  function drawRing(state, now) {
    const ring = state.ring;
    if (!ring) return;
    const rel = ring.d - state.distance;
    if (rel < 6 || rel > 2600) return;
    const c = proj(state, rel, ring.lat, ring.altFt / FT_PER_M);
    const r = ring.radiusM * c.s;
    if (r < 2) return;
    const pulse = 0.75 + 0.25 * Math.sin(now / 240);
    context.save();
    context.globalAlpha = Math.min(1, 340 / (rel + 40) + 0.25);
    context.strokeStyle = PALETTE.ringGlow;
    context.lineWidth = Math.max(2, r * 0.16);
    context.beginPath();
    context.arc(c.x, c.y, r * 1.12, 0, Math.PI * 2);
    context.stroke();
    context.strokeStyle = PALETTE.ring;
    context.lineWidth = Math.max(2, r * 0.1 * pulse);
    context.beginPath();
    context.arc(c.x, c.y, r, 0, Math.PI * 2);
    context.stroke();
    // Chevrons on the ring face, so it reads as a gate even far away.
    context.fillStyle = PALETTE.ring;
    for (let k = 0; k < 4; k += 1) {
      const a = (k / 4) * Math.PI * 2 + now / 1400;
      context.beginPath();
      context.arc(c.x + Math.cos(a) * r, c.y + Math.sin(a) * r, Math.max(2, r * 0.09), 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
    // Distance tag above the ring — or below it when the ring rides high
    // enough that the tag would run into the compass strip.
    if (rel < 1400) {
      let labelY = c.y - r - 12 < 60 ? c.y + r + 22 : c.y - r - 12;
      labelY = Math.max(18, Math.min(690, labelY));
      text(`${Math.round(rel)} m`, c.x, labelY, Math.max(13, Math.min(22, r * 0.28)), PALETTE.ring, 'center', true);
    }
  }

  function drawClouds(state) {
    for (const cl of state.clouds) {
      const rel = cl.d - state.distance + cl.drift * state.time;
      if (rel < 40 || rel > 2800) continue;
      const p = proj(state, rel, cl.lat, cl.alt);
      const r = cl.size * p.s;
      if (r < 3 || p.y < -40 || p.y > HORIZON + 30) continue;
      context.save();
      context.globalAlpha = 0.85;
      context.fillStyle = '#fff4ec';
      for (const [dx, dy, rr] of [[0, 0, 1], [-0.8, 0.25, 0.65], [0.8, 0.3, 0.6], [-0.3, -0.35, 0.55]]) {
        context.beginPath();
        context.arc(p.x + dx * r, p.y + dy * r, rr * r, 0, Math.PI * 2);
        context.fill();
      }
      context.restore();
    }
  }

  function drawPlane(state, now) {
    const cx = 640;
    const cy = 512 - state.pitchDeg * 3;
    const blink = Math.floor(now / 450) % 2 === 0;
    context.save();
    context.translate(cx, cy);
    context.rotate((state.rollDeg * Math.PI) / 180);
    // Contrails from the wingtips.
    context.strokeStyle = 'rgba(255,255,255,0.35)';
    context.lineWidth = 3;
    for (const side of [-1, 1]) {
      context.beginPath();
      context.moveTo(side * 196, 6);
      context.lineTo(side * 236, 96);
      context.stroke();
    }
    // Wings, seen from behind: tapered, red tips, silver tops.
    for (const side of [-1, 1]) {
      context.fillStyle = PALETTE.planeBody;
      context.beginPath();
      context.moveTo(side * 18, -6);
      context.lineTo(side * 208, 26);
      context.lineTo(side * 196, 44);
      context.lineTo(side * 14, 22);
      context.closePath();
      context.fill();
      context.fillStyle = PALETTE.planeTrim;
      context.beginPath();
      context.moveTo(side * 182, 22);
      context.lineTo(side * 208, 26);
      context.lineTo(side * 196, 44);
      context.lineTo(side * 176, 40);
      context.closePath();
      context.fill();
    }
    // Tailplane and fin.
    context.fillStyle = PALETTE.planeBelly;
    for (const side of [-1, 1]) {
      context.beginPath();
      context.moveTo(side * 10, -58);
      context.lineTo(side * 74, -44);
      context.lineTo(side * 68, -32);
      context.lineTo(side * 8, -40);
      context.closePath();
      context.fill();
    }
    context.fillStyle = PALETTE.planeTrim;
    context.beginPath();
    context.moveTo(-8, -62);
    context.lineTo(8, -62);
    context.lineTo(14, -108);
    context.lineTo(-14, -108);
    context.closePath();
    context.fill();
    // Fuselage, foreshortened from behind, belly shading and a lit canopy strip.
    context.fillStyle = PALETTE.planeBody;
    context.beginPath();
    context.ellipse(0, -6, 34, 96, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = PALETTE.planeBelly;
    context.beginPath();
    context.ellipse(0, 34, 26, 56, 0, 0, Math.PI);
    context.fill();
    context.fillStyle = PALETTE.planeGlass;
    context.beginPath();
    context.ellipse(0, -58, 15, 22, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = 'rgba(255,255,255,0.75)';
    context.beginPath();
    context.ellipse(-5, -66, 5, 9, -0.4, 0, Math.PI * 2);
    context.fill();
    // Engines under the wings, glowing when the throttle is up.
    for (const side of [-1, 1]) {
      context.fillStyle = '#c8d2de';
      context.beginPath();
      context.ellipse(side * 86, 34, 13, 22, 0, 0, Math.PI * 2);
      context.fill();
      const glow = 0.35 + state.throttle * 0.65;
      context.fillStyle = `rgba(255, ${Math.round(150 + 60 * glow)}, 60, ${glow})`;
      context.beginPath();
      context.ellipse(side * 86, 52, 8, 10 + state.throttle * 12, 0, 0, Math.PI * 2);
      context.fill();
    }
    // Navigation lights: red port, green starboard, white tail strobe.
    if (blink) {
      context.fillStyle = '#ff3b30';
      context.beginPath();
      context.arc(-208, 32, 6, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#34e05a';
      context.beginPath();
      context.arc(208, 32, 6, 0, Math.PI * 2);
      context.fill();
    }
    context.fillStyle = '#ffffff';
    context.beginPath();
    context.arc(0, -108, 4, 0, Math.PI * 2);
    context.fill();
    context.restore();
    // Speed streaks at the frame edges when fast.
    if (state.speedKt > 150 && state.status === 'flying') {
      context.strokeStyle = 'rgba(255,255,255,0.22)';
      context.lineWidth = 2;
      for (let i = 0; i < 6; i += 1) {
        const y = 120 + ((i * 97 + Math.floor(now / 16)) % 480);
        context.beginPath();
        context.moveTo(18, y);
        context.lineTo(18 + 46, y);
        context.moveTo(1262, y);
        context.lineTo(1216, y);
        context.stroke();
      }
    }
  }

  function drawHud(state, now) {
    const lowAlt = state.status === 'flying' && state.altFt < 260;
    const lowFuel = state.fuel < 20;
    // Top-left: the three numbers the bounty asks for, lit green.
    context.fillStyle = 'rgba(10, 14, 24, 0.55)';
    context.fillRect(16, 14, 300, 96);
    context.strokeStyle = 'rgba(141, 255, 158, 0.4)';
    context.strokeRect(16, 14, 300, 96);
    text(`ALT  ${Math.round(state.altFt).toLocaleString('en-US')} FT`, 30, 46, 24, lowAlt && Math.floor(now / 300) % 2 === 0 ? PALETTE.hudRed : PALETTE.hud, 'left', true);
    text(`SPD  ${Math.round(state.speedKt)} KT`, 30, 76, 24, PALETTE.hud, 'left', true);
    text(`HDG  ${pad3(state.headingDeg)}°`, 30, 104, 24, PALETTE.hud, 'left', true);
    // Compass strip across the top centre.
    const headings = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    context.fillStyle = 'rgba(10, 14, 24, 0.55)';
    context.fillRect(440, 14, 400, 40);
    for (let off = -150; off <= 150; off += 30) {
      const h = (Math.round(state.headingDeg + off / 5) + 360) % 360;
      const x = 640 + off;
      const label = h % 45 === 0 ? headings[Math.round(h / 45) % 8] : String(h);
      text(label, x, 42, off === 0 ? 18 : 14, off === 0 ? PALETTE.hudAmber : PALETTE.muted, 'center', off === 0);
    }
    context.fillStyle = PALETTE.hudAmber;
    context.beginPath();
    context.moveTo(640, 54);
    context.lineTo(634, 62);
    context.lineTo(646, 62);
    context.closePath();
    context.fill();
    // Top-right: score, rings, clock, fuel.
    context.fillStyle = 'rgba(10, 14, 24, 0.55)';
    context.fillRect(964, 14, 300, 96);
    context.strokeStyle = 'rgba(141, 255, 158, 0.4)';
    context.strokeRect(964, 14, 300, 96);
    text(`SCORE ${state.score.toLocaleString('en-US')}`, 978, 46, 22, PALETTE.text, 'left', true);
    text(`RINGS ${state.ringsHit}/${state.ringsSeen + (state.ring ? 1 : 0)}`, 978, 74, 20, PALETTE.hud, 'left', true);
    text(`TIME ${fmtTime(state.timeLeft)}`, 1130, 74, 20, PALETTE.text, 'left', true);
    text('FUEL', 978, 102, 16, lowFuel ? PALETTE.hudRed : PALETTE.muted, 'left', true);
    context.fillStyle = 'rgba(255,255,255,0.18)';
    context.fillRect(1030, 90, 120, 12);
    context.fillStyle = lowFuel ? PALETTE.hudRed : PALETTE.hud;
    context.fillRect(1030, 90, Math.max(0, 120 * state.fuel / 100), 12);
    // Centre reticle with a flight-path marker.
    context.strokeStyle = 'rgba(141, 255, 158, 0.85)';
    context.lineWidth = 2;
    context.beginPath();
    context.arc(640, 330, 16, 0, Math.PI * 2);
    context.stroke();
    context.beginPath();
    context.moveTo(640 - 26, 330);
    context.lineTo(640 - 18, 330);
    context.moveTo(640 + 18, 330);
    context.lineTo(640 + 26, 330);
    context.moveTo(640, 330 - 26);
    context.lineTo(640, 330 - 18);
    context.moveTo(640, 330 + 18);
    context.lineTo(640, 330 + 26);
    context.stroke();
    // Vertical speed, right of centre.
    text(`VS ${state.vsFpm >= 0 ? '+' : ''}${Math.round(state.vsFpm)}`, 700, 336, 16, PALETTE.hud, 'left', true);
    if (lowAlt && state.status === 'flying') {
      text('PULL UP', 640, 240, 34, Math.floor(now / 300) % 2 === 0 ? PALETTE.hudRed : PALETTE.hudAmber, 'center', true);
    }
    if (lowFuel && state.status === 'flying') {
      text('LOW FUEL', 640, 280, 22, Math.floor(now / 300) % 2 === 0 ? PALETTE.hudRed : PALETTE.hudAmber, 'center', true);
    }
  }

  function drawInstruments(state) {
    // The lit instrument strip along the bottom: attitude, altimeter, speed,
    // throttle. It is the "instruments lit" the screenshots have to show.
    context.fillStyle = PALETTE.panel;
    context.fillRect(0, 620, FIELD.width, 100);
    context.fillStyle = PALETTE.panelEdge;
    context.fillRect(0, 620, FIELD.width, 3);
    // Attitude indicator.
    const ax = 90;
    const ay = 670;
    context.save();
    context.beginPath();
    context.arc(ax, ay, 34, 0, Math.PI * 2);
    context.clip();
    context.translate(ax, ay);
    context.rotate((-state.rollDeg * Math.PI) / 180);
    context.translate(0, state.pitchDeg * 1.6);
    context.fillStyle = '#3a6fd8';
    context.fillRect(-40, -40, 80, 40);
    context.fillStyle = '#8a5a2e';
    context.fillRect(-40, 0, 80, 40);
    context.fillStyle = '#ffffff';
    context.fillRect(-40, -1, 80, 2);
    context.restore();
    context.strokeStyle = PALETTE.hud;
    context.lineWidth = 2;
    context.beginPath();
    context.arc(ax, ay, 34, 0, Math.PI * 2);
    context.stroke();
    context.fillStyle = PALETTE.hudAmber;
    context.beginPath();
    context.moveTo(ax, ay - 4);
    context.lineTo(ax - 12, ay + 6);
    context.lineTo(ax + 12, ay + 6);
    context.closePath();
    context.fill();
    text('ATT', ax, 716, 13, PALETTE.muted, 'center');
    // Altimeter dial.
    const bx = 210;
    const by = 670;
    context.strokeStyle = PALETTE.hud;
    context.beginPath();
    context.arc(bx, by, 30, 0, Math.PI * 2);
    context.stroke();
    const altA = -Math.PI / 2 + ((state.altFt % 1000) / 1000) * Math.PI * 2;
    context.strokeStyle = PALETTE.hudAmber;
    context.beginPath();
    context.moveTo(bx, by);
    context.lineTo(bx + Math.cos(altA) * 26, by + Math.sin(altA) * 26);
    context.stroke();
    text('ALT', bx, 716, 13, PALETTE.muted, 'center');
    // Speed dial.
    const cx2 = 320;
    context.strokeStyle = PALETTE.hud;
    context.beginPath();
    context.arc(cx2, by, 30, 0, Math.PI * 2);
    context.stroke();
    const spdA = -Math.PI / 2 + Math.min(1, state.speedKt / 260) * Math.PI * 2;
    context.strokeStyle = PALETTE.hudAmber;
    context.beginPath();
    context.moveTo(cx2, by);
    context.lineTo(cx2 + Math.cos(spdA) * 26, by + Math.sin(spdA) * 26);
    context.stroke();
    text('SPD', cx2, 716, 13, PALETTE.muted, 'center');
    // Throttle lever.
    text('THR', 420, 646, 13, PALETTE.muted, 'left');
    context.fillStyle = 'rgba(255,255,255,0.18)';
    context.fillRect(420, 652, 14, 48);
    context.fillStyle = PALETTE.hudAmber;
    context.fillRect(416, 652 + (1 - state.throttle) * 44, 22, 8);
    text(`${Math.round(state.throttle * 100)}%`, 446, 680, 18, PALETTE.hud, 'left', true);
    // Status line: what the plane is doing, in plain words.
    const statusText = state.status === 'runway'
      ? (state.speedKt < 82 ? 'ON RUNWAY — hold W for throttle, pull up (↑) at 82 kt' : 'ROTATE — pull up!')
      : state.status === 'flying'
        ? 'FLY THE RINGS — W/S throttle · ↑/↓ pitch · ←/→ or mouse to steer'
        : state.status === 'crashed'
          ? state.crashReason
          : 'FLIGHT COMPLETE';
    // Status line, centred on the free stretch of the strip (the throttle
    // lever lives at x 420-500, so the text starts clear of it).
    text(statusText, 790, 652, 16, PALETTE.text, 'center');
    text(`DIST ${(state.distance / 1000).toFixed(1)} km   ·   M — mute   ·   P — pause`, 790, 678, 15, PALETTE.muted, 'center');
  }

  function drawPanel(title, lines, prompt, best) {
    const height = PANEL.top + lines.length * PANEL.line + PANEL.bottom;
    const x = (FIELD.width - PANEL.width) / 2;
    const y = (FIELD.height - height) / 2 - 20;
    context.fillStyle = 'rgba(12, 16, 28, 0.88)';
    context.fillRect(x, y, PANEL.width, height);
    context.strokeStyle = PALETTE.hudAmber;
    context.lineWidth = 2;
    context.strokeRect(x, y, PANEL.width, height);
    text(title, FIELD.width / 2, y + 72, 46, PALETTE.hudAmber, 'center', true);
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], FIELD.width / 2, y + PANEL.top + index * PANEL.line, 21, PALETTE.text, 'center');
    }
    if (best > 0) text(`Best ${best.toLocaleString('en-US')}`, FIELD.width / 2, y + height - 58, 20, PALETTE.muted, 'center');
    text(prompt, FIELD.width / 2, y + height - 30, 22, PALETTE.hud, 'center', true);
  }

  const TITLE_LINES = [
    'Sunset Valley Flight — one valley, ninety seconds, golden rings.',
    'W / S throttle · ↑ / ↓ pitch · ← / → or mouse to steer',
    'Rotate at 82 kt, fly each ring dead centre for 150 points.',
    'Stay above the valley floor — the mountain shoulder is not soft.',
  ];
  const PAUSED_LINES = ['The valley will wait for you.'];
  const OVER_LINES = ['', '', ''];

  function draw(state, screen, best, now) {
    bestShown = best;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    drawSky(state, now);
    drawGround(state);
    drawRunway(state);
    drawRing(state, now);
    drawClouds(state);
    drawPlane(state, now);
    drawHud(state, now);
    drawInstruments(state);
    if (screen === SCREEN_TITLE) {
      drawPanel('RIDGE RUNNER', TITLE_LINES, 'Press Space or click to start', best);
      return;
    }
    if (screen === SCREEN_PAUSED) drawPanel('Paused', PAUSED_LINES, 'Press P to resume', best);
    else if (screen === SCREEN_OVER) {
      const crashed = state.status === 'crashed';
      OVER_LINES[0] = crashed ? state.crashReason : 'Ninety seconds over the valley — nicely flown.';
      OVER_LINES[1] = `Score ${state.score.toLocaleString('en-US')}   ·   Rings ${state.ringsHit}/${state.ringsSeen}   ·   Distance ${(state.distance / 1000).toFixed(1)} km`;
      OVER_LINES[2] = state.ringsHit >= 8 ? 'Rating: ACE OF THE VALLEY' : state.ringsHit >= 5 ? 'Rating: VALLEY PILOT' : state.ringsHit >= 2 ? 'Rating: STEADY HANDS' : 'Rating: STUDENT PILOT';
      drawPanel(crashed ? 'CRASHED' : 'FLIGHT COMPLETE', OVER_LINES, 'Press Space or click to fly again', best);
    }
    void bestShown;
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}
