import { W, H, ROAD, LANE_X, SLOTS, slotPos, drawBase } from './board.js';
import { sfx, unlockAudio, isMuted, toggleMute } from './audio.js';
import {
  lbEnabled, getName, submitScore, renamePlayer, fetchTop, monthLabel, playerId,
} from './leaderboard.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const ctx = canvas.getContext('2d');

// ------------------------------------------------------------ sizing

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const vw = window.innerWidth, vh = window.innerHeight;
  const fit = Math.min(vw / W, vh / H);
  canvas.style.width = `${W * fit}px`;
  canvas.style.height = `${H * fit}px`;
  canvas.width = Math.round(W * fit * dpr);
  canvas.height = Math.round(H * fit * dpr);
  ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
  baseScale = canvas.width / W;
}
let baseScale = 1;
window.addEventListener('resize', resize);

// ------------------------------------------------------------ tuning

const FRESH_POINTS = 10;
const TAMP_POINTS = 5;
const CRATER_POINTS = 25;
const SYRUP_POINTS = 40;
const PLOW_TAP_POINTS = 20;
const PLOW_FILL_POINTS = 5;
const WAVE_SECONDS = 20;
const COMBO_WINDOW = 2.8;      // s between fills to keep the chain alive
const MAX_MULT = 5;
const HIT_RADIUS = 46;         // generous tap target (logical px)

function waveTuning(w) {
  return {
    spawnEvery: Math.max(1.65 * Math.pow(0.92, w - 1), 0.55),
    maxOpen: Math.min(2 + Math.floor((w - 1) / 2), 6),
    freshLife: Math.max(4.4 - 0.28 * (w - 1), 2.1),   // s before it grows into a crater
    carSpeed: Math.min(95 + 11 * (w - 1), 235),
    carDwell: Math.max(1.5 - 0.11 * (w - 1), 0.45),
  };
}

const WAVE_TOASTS = [
  '', 'MUD SEASON BEGINS',
  'THE MUD THICKENS', 'FROST HEAVES!', 'DPW IS SWAMPED',
  'THAW ACCELERATES', 'FULL MUD', 'TOWN MEETING CALLED',
  'ROADS "IMPASSABLE"', 'PEAK MUD', 'LEGENDARY MUD',
];

// ------------------------------------------------------------ state

let state = 'menu'; // menu | playing | over
let score = 0, wave = 1, filled = 0, hubcaps = 3;
let best = Number(localStorage.getItem('pothole-patrol-best') || 0);
let chain = 0, lastFillAt = -99, mult = 1;
let waveT = 0, spawnT = 0, syrupT = 0, plowSpawnT = 0;
let time = 0;
let shakeT = 0, shakeAmp = 0;
let scoreSubmitted = false;

const potholes = [];   // { slot, x, y, stage:'fresh'|'crater', hp, age, animT, hitFlash }
const patches = [];    // cosmetic filled spots { x, y, r, age }
const bonuses = [];    // { kind:'syrup'|'plow', x, y, ttl, age }
const particles = [];
const floaters = [];   // floating score text
const hubcapFx = [];   // hubcaps rolling away

const car = {
  dist: 0, speed: 100, pause: 0, x: LANE_X[1], y: H - 130, angle: -Math.PI / 2,
  lane: 1, seg: 0, hitCooldown: 0, bump: 0,
};
const plow = { active: false, y: 0 };

// car loop geometry: up the right lane, U-turn, down the left, U-turn
const CAR_TOP = 140, CAR_BOT = H - 96, TURN_R = ROAD.laneGap / 2;
const LEG = CAR_BOT - CAR_TOP, ARC = Math.PI * TURN_R;
const LOOP = 2 * LEG + 2 * ARC;
function carPosAt(d) {
  d = ((d % LOOP) + LOOP) % LOOP;
  if (d < LEG) return { x: LANE_X[1], y: CAR_BOT - d, seg: 0 };
  d -= LEG;
  if (d < ARC) {
    const phi = d / TURN_R;
    return { x: ROAD.cx + TURN_R * Math.cos(phi), y: CAR_TOP - TURN_R * Math.sin(phi), seg: 1 };
  }
  d -= ARC;
  if (d < LEG) return { x: LANE_X[0], y: CAR_TOP + d, seg: 2 };
  d -= LEG;
  const phi = d / TURN_R;
  return { x: ROAD.cx - TURN_R * Math.cos(phi), y: CAR_BOT + TURN_R * Math.sin(phi), seg: 3 };
}

// ------------------------------------------------------------ dom refs

const startPanel = $('start'), overPanel = $('gameover'), hud = $('hud');
const scoreEl = $('score'), waveEl = $('waveNum'), capsEl = $('caps'), comboEl = $('comboBadge');
const bestEl = $('bestHud'), toastEl = $('toast');
const finalScoreEl = $('finalScore'), bestLineEl = $('bestLine'), statLineEl = $('statLine'), overTitleEl = $('overTitle');

// ------------------------------------------------------------ game flow

function startGame() {
  unlockAudio();
  sfx.click();
  state = 'playing';
  score = 0; wave = 1; filled = 0; hubcaps = 3;
  chain = 0; mult = 1; lastFillAt = -99;
  waveT = 0; spawnT = 0.8; time = 0;
  syrupT = rand(9, 15); plowSpawnT = rand(35, 55);
  scoreSubmitted = false;
  potholes.length = patches.length = bonuses.length = 0;
  particles.length = floaters.length = hubcapFx.length = 0;
  car.dist = 0; car.pause = 0; car.hitCooldown = 0; car.bump = 0;
  plow.active = false;
  startPanel.classList.add('hidden');
  overPanel.classList.add('hidden');
  hud.classList.remove('hidden');
  paintHud();
  toast(`WAVE 1 · ${WAVE_TOASTS[1]}`);
  sfx.wave();
}

function gameOver() {
  state = 'over';
  sfx.gameover();
  shake(14, 0.6);
  hud.classList.add('hidden');
  const s = Math.floor(score);
  const isBest = s > best;
  if (isBest) { best = s; localStorage.setItem('pothole-patrol-best', String(best)); }
  finalScoreEl.textContent = s.toLocaleString();
  bestLineEl.textContent = isBest ? '★ NEW PERSONAL BEST ★' : `Personal best: ${best.toLocaleString()}`;
  bestLineEl.classList.toggle('new-best', isBest);
  statLineEl.textContent = `${filled} pothole${filled === 1 ? '' : 's'} patched · survived to wave ${wave}`;
  overTitleEl.textContent = 'OUT OF HUBCAPS!';
  setTimeout(() => overPanel.classList.remove('hidden'), 650);
  updateLeaderboard(s);
}

// ------------------------------------------------------------ helpers

function rand(a, b) { return a + Math.random() * (b - a); }
function shake(amp, t) { shakeAmp = Math.max(shakeAmp, amp); shakeT = Math.max(shakeT, t); }

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.remove('show');
  void toastEl.offsetWidth; // restart the CSS animation
  toastEl.classList.add('show');
}

function paintHud() {
  scoreEl.textContent = Math.floor(score).toLocaleString();
  waveEl.textContent = wave;
  capsEl.textContent = hubcaps > 0 ? '🛞'.repeat(hubcaps) : '—';
  bestEl.textContent = best > 0 ? `best ${best.toLocaleString()}` : '';
  if (mult > 1) {
    comboEl.textContent = `x${mult} COMBO`;
    comboEl.classList.remove('hidden');
  } else {
    comboEl.classList.add('hidden');
  }
}

function addFloater(x, y, text, cls = '') {
  floaters.push({ x, y, text, cls, age: 0 });
}

function award(points, x, y, label) {
  score += points;
  addFloater(x, y, `+${points}${label ? ' ' + label : ''}`, mult > 1 ? 'hot' : '');
}

// ------------------------------------------------------------ potholes

function freeSlots() {
  const used = new Set(potholes.map((p) => p.slot));
  bonuses.forEach((b) => { if (b.slot != null) used.add(b.slot); });
  return SLOTS.map((s, i) => i).filter((i) => {
    if (used.has(i)) return false;
    const { x, y } = slotPos(SLOTS[i]);
    if (Math.hypot(car.x - x, car.y - y) < 90) return false; // never erupt under the car
    return !patches.some((p) => p.age < 2 && Math.hypot(p.x - x, p.y - y) < 10);
  });
}

function spawnPothole() {
  const free = freeSlots();
  if (!free.length) return;
  const i = free[Math.floor(Math.random() * free.length)];
  const { x, y } = slotPos(SLOTS[i]);
  potholes.push({ slot: i, x, y, stage: 'fresh', hp: 1, age: 0, animT: 0, flash: 0 });
  sfx.pop();
  burst(x, y, 7, '#5c4326', 2.4);
}

function fillPothole(p, byPlow = false) {
  potholes.splice(potholes.indexOf(p), 1);
  patches.push({ x: p.x, y: p.y, r: p.stage === 'crater' ? 26 : 18, age: 0 });
  filled++;
  burst(p.x, p.y, 12, '#1d2024', 3);
  steam(p.x, p.y, p.stage === 'crater' ? 10 : 6);
  if (byPlow) {
    award(PLOW_FILL_POINTS, p.x, p.y);
  } else {
    bumpCombo();
    const pts = (p.stage === 'crater' ? CRATER_POINTS : FRESH_POINTS) * mult;
    award(pts, p.x, p.y, mult > 1 ? `x${mult}` : '');
    sfx.splat(mult);
  }
}

function bumpCombo() {
  chain = (time - lastFillAt <= COMBO_WINDOW) ? chain + 1 : 0;
  lastFillAt = time;
  mult = Math.min(1 + chain, MAX_MULT);
}
function breakCombo() {
  chain = 0; mult = 1; lastFillAt = -99;
}

// ------------------------------------------------------------ bonuses

function spawnBonus(kind) {
  const free = freeSlots();
  if (!free.length) return;
  const i = free[Math.floor(Math.random() * free.length)];
  const { x, y } = slotPos(SLOTS[i]);
  bonuses.push({ kind, slot: i, x, y, ttl: kind === 'syrup' ? 3.2 : 4.5, age: 0 });
}

function triggerPlow() {
  plow.active = true;
  plow.y = H + 80;
  sfx.plow();
  toast('🚜 PLOW! FILLS EVERYTHING');
}

// ------------------------------------------------------------ particles

function burst(x, y, n, color, speed) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = rand(0.4, 1) * speed * 60;
    particles.push({
      x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40,
      r: rand(1.6, 4), color, age: 0, life: rand(0.35, 0.7), grav: 260,
    });
  }
}
function steam(x, y, n) {
  for (let i = 0; i < n; i++) {
    particles.push({
      x: x + rand(-8, 8), y: y + rand(-4, 4),
      vx: rand(-12, 12), vy: rand(-70, -30),
      r: rand(3, 7), color: 'steam', age: 0, life: rand(0.5, 1), grav: -30,
    });
  }
}
function mudSplash(x, y) {
  burst(x, y, 14, '#4a3823', 3.4);
  burst(x, y, 6, '#6b5636', 2.6);
}

// ------------------------------------------------------------ input

canvas.addEventListener('pointerdown', (e) => {
  if (e.target.closest?.('button, a, input, .lb')) return;
  unlockAudio();
  if (state !== 'playing') return;
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) / (rect.width / W);
  const y = (e.clientY - rect.top) / (rect.height / H);
  whack(x, y);
}, { passive: false });

function whack(x, y) {
  // bonuses first (they sit on top and expire fast)
  for (const b of bonuses) {
    if (Math.hypot(b.x - x, b.y - y) <= HIT_RADIUS) {
      bonuses.splice(bonuses.indexOf(b), 1);
      if (b.kind === 'syrup') {
        bumpCombo();
        award(SYRUP_POINTS * mult, b.x, b.y, '🍁');
        sfx.syrup();
        burst(b.x, b.y, 10, '#b06f22', 2.6);
      } else {
        award(PLOW_TAP_POINTS, b.x, b.y);
        triggerPlow();
      }
      paintHud();
      return;
    }
  }
  // nearest open pothole within reach
  let bestP = null, bestD = Infinity;
  for (const p of potholes) {
    const d = Math.hypot(p.x - x, p.y - y);
    if (d <= HIT_RADIUS && d < bestD) { bestP = p; bestD = d; }
  }
  if (bestP) {
    bestP.hp--;
    bestP.flash = 0.18;
    if (bestP.hp <= 0) {
      fillPothole(bestP);
    } else {
      award(TAMP_POINTS, bestP.x, bestP.y - 14);
      sfx.tamp();
      burst(bestP.x, bestP.y, 5, '#1d2024', 2);
    }
    paintHud();
  } else {
    // a whiff breaks your combo — aim matters
    if (mult > 1) addFloater(x, y, 'combo lost', 'miss');
    breakCombo();
    sfx.whiff();
    burst(x, y, 3, '#6b5636', 1.4);
    paintHud();
  }
}

window.addEventListener('keydown', (e) => {
  const t = e.target;
  if (t.closest?.('input, textarea') || document.activeElement?.tagName === 'INPUT') return;
  if (e.key === ' ' || e.key === 'Enter') {
    if (t.closest?.('button, a')) return; // let focused buttons behave normally
    if (state === 'menu') { e.preventDefault(); startGame(); }
    else if (state === 'over' && !overPanel.classList.contains('hidden')) { e.preventDefault(); startGame(); }
  }
  if (e.key === 'm' || e.key === 'M') paintMute(toggleMute());
});

// ------------------------------------------------------------ update

function update(dt) {
  time += dt;

  // waves
  waveT += dt;
  if (waveT >= WAVE_SECONDS) {
    waveT = 0;
    wave++;
    score += 25 * wave;
    addFloater(ROAD.cx, 200, `WAVE ${wave} · +${25 * wave}`, 'wavepts');
    toast(`WAVE ${wave} · ${WAVE_TOASTS[Math.min(wave, WAVE_TOASTS.length - 1)]}`);
    sfx.wave();
  }
  const tune = waveTuning(wave);

  // combo expiry
  if (mult > 1 && time - lastFillAt > COMBO_WINDOW) { breakCombo(); paintHud(); }

  // pothole spawning
  spawnT -= dt;
  if (spawnT <= 0) {
    spawnT = tune.spawnEvery * rand(0.75, 1.25);
    if (potholes.length < tune.maxOpen) spawnPothole();
  }

  // pothole aging: fresh → crater
  for (const p of potholes) {
    p.age += dt;
    p.animT += dt;
    if (p.flash > 0) p.flash -= dt;
    if (p.stage === 'fresh' && p.age >= tune.freshLife) {
      p.stage = 'crater';
      p.hp = 2;
      p.animT = 0;
      sfx.crack();
      burst(p.x, p.y, 9, '#2a241c', 2.8);
      shake(3, 0.15);
    }
  }

  patches.forEach((p) => { p.age += dt; });
  for (let i = patches.length - 1; i >= 0; i--) if (patches[i].age > 7) patches.splice(i, 1);

  // bonuses
  syrupT -= dt;
  if (syrupT <= 0) { syrupT = rand(11, 19); spawnBonus('syrup'); }
  plowSpawnT -= dt;
  if (plowSpawnT <= 0) { plowSpawnT = rand(42, 70); if (!plow.active) spawnBonus('plow'); }
  for (const b of bonuses) b.age += dt;
  for (let i = bonuses.length - 1; i >= 0; i--) {
    if (bonuses[i].age > bonuses[i].ttl) bonuses.splice(i, 1);
  }

  // plow sweep
  if (plow.active) {
    plow.y -= 340 * dt;
    for (let i = potholes.length - 1; i >= 0; i--) {
      if (Math.abs(potholes[i].y - plow.y) < 26) fillPothole(potholes[i], true);
    }
    if (plow.y < -100) plow.active = false;
    paintHud();
  }

  // the Subaru
  if (car.pause > 0) {
    car.pause -= dt;
  } else {
    const prev = car.dist;
    car.dist += tune.carSpeed * dt;
    // brief dwell before each U-turn ("checking the mirrors")
    for (const stop of [LEG, 2 * LEG + ARC]) {
      const a = ((prev % LOOP) + LOOP) % LOOP, b2 = ((car.dist % LOOP) + LOOP) % LOOP;
      if (a < stop && b2 >= stop) { car.dist = stop; car.pause = tune.carDwell; }
    }
  }
  const pos = carPosAt(car.dist);
  const ahead = carPosAt(car.dist + 2);
  car.x = pos.x; car.y = pos.y; car.seg = pos.seg;
  car.angle = Math.atan2(ahead.y - pos.y, ahead.x - pos.x);
  car.lane = pos.seg === 0 ? 1 : pos.seg === 2 ? 0 : -1;
  if (car.hitCooldown > 0) car.hitCooldown -= dt;
  if (car.bump > 0) car.bump -= dt * 3;

  // car vs open potholes
  if (car.lane >= 0 && car.hitCooldown <= 0 && state === 'playing') {
    for (const p of potholes) {
      if (SLOTS[p.slot].lane !== car.lane) continue;
      if (Math.abs(p.y - car.y) < 24) {
        carHit(p);
        break;
      }
    }
  }

  // particles / floaters / hubcaps
  for (const pt of particles) {
    pt.age += dt;
    pt.x += pt.vx * dt; pt.y += pt.vy * dt;
    pt.vy += pt.grav * dt;
  }
  for (let i = particles.length - 1; i >= 0; i--) if (particles[i].age > particles[i].life) particles.splice(i, 1);
  for (const f of floaters) f.age += dt;
  for (let i = floaters.length - 1; i >= 0; i--) if (floaters[i].age > 1.1) floaters.splice(i, 1);
  for (const hcap of hubcapFx) {
    hcap.age += dt;
    hcap.x += hcap.vx * dt; hcap.y += hcap.vy * dt;
    hcap.rot += dt * 9;
    hcap.vx *= 0.985;
  }
  for (let i = hubcapFx.length - 1; i >= 0; i--) if (hubcapFx[i].age > 1.6) hubcapFx.splice(i, 1);

  if (shakeT > 0) shakeT -= dt;
}

function carHit(p) {
  car.hitCooldown = 1.3;
  car.bump = 1;
  hubcaps--;
  breakCombo();
  sfx.thunk();
  sfx.hubcap();
  mudSplash(p.x, p.y);
  shake(9, 0.35);
  addFloater(car.x, car.y - 40, '-1 🛞', 'ouch');
  const dir = SLOTS[p.slot].lane === 0 ? -1 : 1;
  hubcapFx.push({ x: car.x + dir * 16, y: car.y, vx: dir * rand(90, 150), vy: rand(-30, 20), rot: 0, age: 0 });
  paintHud();
  if (hubcaps <= 0) gameOver();
}

// ------------------------------------------------------------ draw

function draw() {
  ctx.save();
  if (shakeT > 0) {
    const a = shakeAmp * (shakeT / 0.6);
    ctx.translate(rand(-a, a), rand(-a, a));
  } else {
    shakeAmp = 0;
  }

  drawBase(ctx, baseScale);

  // cured patches
  for (const p of patches) {
    const alpha = p.age > 5 ? 1 - (p.age - 5) / 2 : 1;
    ctx.globalAlpha = 0.9 * alpha;
    ctx.fillStyle = '#23262b';
    ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r, p.r * 0.8, 0, 0, 7); ctx.fill();
    ctx.globalAlpha = alpha * 0.5;
    ctx.strokeStyle = '#15171a';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  for (const p of potholes) drawPothole(p);
  for (const b of bonuses) drawBonus(b);
  if (plow.active) drawPlow();
  drawCar();
  for (const hcap of hubcapFx) drawHubcap(hcap);
  drawParticles();
  drawFloaters();

  ctx.restore();
}

function drawPothole(p) {
  const grow = Math.min(p.animT / 0.25, 1);
  const pulse = 1 + Math.sin(time * 5 + p.slot) * 0.03;
  const r = (p.stage === 'crater' ? 27 : 17) * grow * pulse;
  const danger = car.lane >= 0 && SLOTS[p.slot].lane === car.lane &&
    ((car.lane === 1 && p.y < car.y && car.y - p.y < 170) ||
     (car.lane === 0 && p.y > car.y && p.y - car.y < 170));

  // warning ring when the Subaru is bearing down on it
  if (danger) {
    const ph = (time * 2.2) % 1;
    ctx.globalAlpha = 0.65 * (1 - ph);
    ctx.strokeStyle = '#ff5638';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(p.x, p.y, r + 6 + ph * 14, (r + 6 + ph * 14) * 0.85, 0, 0, 7); ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // cracked rim
  ctx.strokeStyle = 'rgba(15,16,18,0.8)';
  ctx.lineWidth = 2;
  for (let i = 0; i < (p.stage === 'crater' ? 7 : 4); i++) {
    const a = (i / 7) * Math.PI * 2 + p.slot;
    ctx.beginPath();
    ctx.moveTo(p.x + Math.cos(a) * r * 0.9, p.y + Math.sin(a) * r * 0.75);
    ctx.lineTo(p.x + Math.cos(a) * (r + 8), p.y + Math.sin(a) * (r * 0.85 + 7));
    ctx.stroke();
  }
  // hole
  const g = ctx.createRadialGradient(p.x - r * 0.25, p.y - r * 0.25, r * 0.1, p.x, p.y, r);
  g.addColorStop(0, p.stage === 'crater' ? '#0b0c0e' : '#17181c');
  g.addColorStop(0.75, '#232227');
  g.addColorStop(1, '#33302f');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(p.x, p.y, r, r * 0.85, 0, 0, 7); ctx.fill();
  // muddy water glint
  ctx.fillStyle = 'rgba(94,78,52,0.5)';
  ctx.beginPath(); ctx.ellipse(p.x + r * 0.2, p.y + r * 0.25, r * 0.45, r * 0.28, 0.3, 0, 7); ctx.fill();
  ctx.fillStyle = 'rgba(180,190,205,0.18)';
  ctx.beginPath(); ctx.ellipse(p.x + r * 0.28, p.y + r * 0.18, r * 0.16, r * 0.09, 0.3, 0, 7); ctx.fill();

  // crater: half-tamped marker after first tap
  if (p.stage === 'crater' && p.hp === 1) {
    ctx.fillStyle = 'rgba(35,38,43,0.95)';
    ctx.beginPath(); ctx.ellipse(p.x - r * 0.25, p.y - r * 0.2, r * 0.5, r * 0.38, -0.3, 0, 7); ctx.fill();
  }
  if (p.flash > 0) {
    ctx.globalAlpha = p.flash / 0.18 * 0.5;
    ctx.fillStyle = '#ffe9c9';
    ctx.beginPath(); ctx.ellipse(p.x, p.y, r + 4, (r + 4) * 0.85, 0, 0, 7); ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function drawBonus(b) {
  const blink = b.ttl - b.age < 1 && Math.floor(b.age * 6) % 2 === 0;
  if (blink) return;
  const bob = Math.sin(b.age * 4) * 3;
  ctx.save();
  ctx.translate(b.x, b.y + bob);
  ctx.font = '30px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // soft ring so it reads as tappable
  ctx.fillStyle = b.kind === 'syrup' ? 'rgba(176,111,34,0.25)' : 'rgba(90,140,200,0.25)';
  ctx.beginPath(); ctx.arc(0, 0, 26, 0, 7); ctx.fill();
  ctx.strokeStyle = b.kind === 'syrup' ? 'rgba(240,180,90,0.8)' : 'rgba(160,200,255,0.8)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, 26, 0, 7); ctx.stroke();
  ctx.fillText(b.kind === 'syrup' ? '🍁' : '🚜', 0, 2);
  ctx.restore();
}

function drawPlow() {
  ctx.save();
  ctx.translate(ROAD.cx, plow.y);
  // blade spans the whole road
  ctx.fillStyle = '#f2b12e';
  ctx.beginPath();
  ctx.moveTo(-ROAD.width / 2 + 4, -34);
  ctx.lineTo(ROAD.width / 2 - 4, -26);
  ctx.lineTo(ROAD.width / 2 - 4, -14);
  ctx.lineTo(-ROAD.width / 2 + 4, -22);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#a8770e'; ctx.lineWidth = 2; ctx.stroke();
  // truck body
  ctx.fillStyle = '#d96c1e';
  ctx.beginPath(); ctx.roundRect(-26, -12, 52, 74, 8); ctx.fill();
  ctx.fillStyle = '#87451a';
  ctx.beginPath(); ctx.roundRect(-22, 4, 44, 26, 5); ctx.fill();
  ctx.fillStyle = '#f6e9d0';
  ctx.beginPath(); ctx.roundRect(-18, -8, 36, 10, 3); ctx.fill();
  // strobes
  ctx.fillStyle = Math.floor(time * 8) % 2 ? '#ffd24a' : '#ff9c2e';
  ctx.fillRect(-20, 34, 8, 6); ctx.fillRect(12, 34, 8, 6);
  ctx.restore();
  // spray behind the blade
  if (Math.random() < 0.7) burst(ROAD.cx + rand(-55, 55), plow.y - 20, 2, '#5a4a30', 2.5);
}

function drawCar() {
  const squish = car.bump > 0 ? 1 + Math.sin(car.bump * Math.PI) * 0.08 : 1;
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle + Math.PI / 2); // sprite is drawn nose-up
  ctx.scale(squish, 2 - squish);
  // shadow
  ctx.fillStyle = 'rgba(10,10,12,0.35)';
  ctx.beginPath(); ctx.ellipse(2, 4, 22, 34, 0, 0, 7); ctx.fill();
  // wheels
  ctx.fillStyle = '#17181a';
  [[-19, -20], [13, -20], [-19, 16], [13, 16]].forEach(([wx, wy]) => {
    ctx.beginPath(); ctx.roundRect(wx, wy, 6, 12, 2); ctx.fill();
  });
  // body — forest-green Outback
  const g = ctx.createLinearGradient(-20, 0, 20, 0);
  g.addColorStop(0, '#2c5238');
  g.addColorStop(0.5, '#3f7050');
  g.addColorStop(1, '#2c5238');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.roundRect(-18, -32, 36, 64, 12); ctx.fill();
  ctx.strokeStyle = '#1e3a27'; ctx.lineWidth = 1.5; ctx.stroke();
  // windshield + rear glass
  ctx.fillStyle = '#a9c4cf';
  ctx.beginPath(); ctx.roundRect(-13, -22, 26, 12, [3, 3, 6, 6]); ctx.fill();
  ctx.beginPath(); ctx.roundRect(-13, 14, 26, 10, [6, 6, 3, 3]); ctx.fill();
  // roof + rails
  ctx.fillStyle = '#35603f';
  ctx.beginPath(); ctx.roundRect(-12, -10, 24, 24, 4); ctx.fill();
  ctx.strokeStyle = '#20241f'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-10, -9); ctx.lineTo(-10, 13); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(10, -9); ctx.lineTo(10, 13); ctx.stroke();
  // the kayak (peak Vermont)
  ctx.fillStyle = '#d96a2b';
  ctx.beginPath(); ctx.ellipse(0, 1, 5.5, 22, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#8f3f14';
  ctx.beginPath(); ctx.ellipse(0, -3, 2.6, 7, 0, 0, 7); ctx.fill();
  // headlights / brake lights
  if (car.pause > 0) {
    ctx.fillStyle = '#ff5148';
    ctx.fillRect(-14, 29, 8, 4); ctx.fillRect(6, 29, 8, 4);
  }
  ctx.fillStyle = '#f7f3d8';
  ctx.fillRect(-14, -33, 8, 4); ctx.fillRect(6, -33, 8, 4);
  // mud season plate
  ctx.fillStyle = '#2f5233';
  ctx.fillRect(-8, 26, 16, 7);
  ctx.fillStyle = '#f5ead6';
  ctx.font = '700 5px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText('VT', 0, 31.5);
  ctx.restore();
}

function drawHubcap(h) {
  const alpha = h.age > 1.1 ? 1 - (h.age - 1.1) / 0.5 : 1;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(h.x, h.y);
  ctx.rotate(h.rot);
  ctx.fillStyle = '#c9ccd2';
  ctx.beginPath(); ctx.arc(0, 0, 7, 0, 7); ctx.fill();
  ctx.strokeStyle = '#7c8087'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, 4, 0, 7); ctx.stroke();
  ctx.strokeStyle = '#989ca3';
  ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(6, 0); ctx.stroke();
  ctx.restore();
}

function drawParticles() {
  for (const p of particles) {
    const t = p.age / p.life;
    if (p.color === 'steam') {
      ctx.globalAlpha = 0.35 * (1 - t);
      ctx.fillStyle = '#e8ebe8';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1 + t * 1.6), 0, 7); ctx.fill();
    } else {
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function drawFloaters() {
  for (const f of floaters) {
    const t = f.age / 1.1;
    ctx.globalAlpha = 1 - t * t;
    ctx.font = f.cls === 'wavepts' ? '800 22px system-ui' : '800 17px system-ui';
    ctx.textAlign = 'center';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(15,12,8,0.75)';
    ctx.fillStyle = f.cls === 'ouch' ? '#ff8a70' : f.cls === 'miss' ? '#c9b790' : f.cls === 'hot' ? '#ffc65c' : '#f5ead6';
    const y = f.y - 10 - t * 34;
    ctx.strokeText(f.text, f.x, y);
    ctx.fillText(f.text, f.x, y);
  }
  ctx.globalAlpha = 1;
}

// ------------------------------------------------------------ loop

let last = performance.now();
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.045);
  last = now;
  if (state === 'playing') update(dt);
  else time += dt; // keep ambient motion on menus
  draw();
  requestAnimationFrame(frame);
}

// ------------------------------------------------------------ leaderboard

const lbBox = $('lb'), lbList = $('lbList'), lbStatus = $('lbStatus');
const lbForm = $('lbForm'), lbNameInput = $('lbNameInput');
const lbThisBtn = $('lbThisBtn'), lbLastBtn = $('lbLastBtn'), lbRenameBtn = $('lbRenameBtn');
let lbMonthOffset = 0;

if (lbEnabled()) {
  lbBox.classList.remove('hidden');
  lbThisBtn.textContent = `🏆 ${monthLabel(0)}`;
  lbLastBtn.textContent = monthLabel(-1);
}

async function updateLeaderboard(s) {
  if (!lbEnabled()) return;
  if (!getName()) {
    // first run: hold the score pending until a name is saved
    lbForm.classList.remove('hidden');
    lbRenameBtn.classList.add('hidden');
    lbStatus.textContent = 'Pick a name to join the monthly leaderboard!';
    lbList.innerHTML = '';
    lbForm.dataset.pendingScore = String(s);
    return;
  }
  try {
    if (!scoreSubmitted) {
      scoreSubmitted = true;
      await submitScore(s);
    }
  } catch { /* offline — still try to show the board */ }
  renderBoard();
}

async function renderBoard() {
  lbForm.classList.add('hidden');
  lbRenameBtn.classList.remove('hidden');
  lbStatus.textContent = 'Loading…';
  try {
    const rows = await fetchTop(lbMonthOffset);
    const me = playerId();
    lbList.innerHTML = '';
    rows.slice(0, 10).forEach((r, i) => {
      const li = document.createElement('li');
      if (r.player_id === me) li.className = 'me';
      const medal = ['🥇', '🥈', '🥉'][i];
      li.innerHTML = `<span class="rank">${medal || i + 1}</span><span class="nm"></span><span class="sc"></span>`;
      li.querySelector('.nm').textContent = r.name;
      li.querySelector('.sc').textContent = r.score;
      lbList.appendChild(li);
    });
    const myRank = rows.findIndex((r) => r.player_id === me);
    lbStatus.textContent = rows.length === 0
      ? 'No scores yet this month — be the first!'
      : myRank >= 0 && lbMonthOffset === 0 ? `You're #${myRank + 1} of ${rows.length} this month` : '';
  } catch {
    lbStatus.textContent = 'Leaderboard unavailable (offline?)';
  }
}

$('lbSaveBtn').addEventListener('click', async () => {
  const name = lbNameInput.value.trim();
  if (!name) { lbNameInput.focus(); return; }
  sfx.click();
  const pending = Number(lbForm.dataset.pendingScore || 0);
  lbForm.dataset.pendingScore = '';
  try {
    await renamePlayer(name); // saves locally + updates any existing rows
    if (pending > 0 && !scoreSubmitted) {
      scoreSubmitted = true;
      await submitScore(pending);
    }
  } catch { /* offline */ }
  renderBoard();
});
lbNameInput.addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.key === 'Enter') $('lbSaveBtn').click();
});
lbRenameBtn.addEventListener('click', () => {
  sfx.click();
  lbNameInput.value = getName();
  lbForm.classList.remove('hidden');
  lbRenameBtn.classList.add('hidden');
  lbNameInput.focus();
});
lbThisBtn.addEventListener('click', () => {
  lbMonthOffset = 0;
  lbThisBtn.classList.add('sel');
  lbLastBtn.classList.remove('sel');
  renderBoard();
});
lbLastBtn.addEventListener('click', () => {
  lbMonthOffset = -1;
  lbLastBtn.classList.add('sel');
  lbThisBtn.classList.remove('sel');
  renderBoard();
});

// ------------------------------------------------------------ buttons

$('startBtn').addEventListener('click', startGame);
$('restartBtn').addEventListener('click', startGame);

const muteBtn = $('mute');
function paintMute(m = isMuted()) {
  muteBtn.textContent = m ? '🔇' : '🔊';
}
paintMute();
muteBtn.addEventListener('click', () => { unlockAudio(); paintMute(toggleMute()); });

// ------------------------------------------------------------ go

resize();
bestEl.textContent = best > 0 ? `best ${best.toLocaleString()}` : '';
requestAnimationFrame(frame);
