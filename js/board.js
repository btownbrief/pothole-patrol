// The board: a stylized top-down slice of North Ave in Burlington's New
// North End during mud season. South (Battery Park) is at the bottom,
// north (Plattsburgh Ave / the 127 end) at the top. Landmarks are placed
// loosely where locals expect them: Burlington High School and the lake
// parks (Leddy, Starr Farm) on the west/left, Ethan Allen Park and its
// tower on the east/right.

export const W = 480;
export const H = 820;

export const ROAD = {
  cx: 252,          // road centerline x
  width: 132,       // full paved width
  laneGap: 58,      // distance between the two lane centerlines
};
export const LANE_X = [ROAD.cx - ROAD.laneGap / 2, ROAD.cx + ROAD.laneGap / 2]; // [south-bound(left), north-bound(right)]

// Fixed eruption spots. lane 0 = left/southbound, 1 = right/northbound.
export const SLOTS = [
  { lane: 1, y: 152 },
  { lane: 0, y: 196 },
  { lane: 1, y: 268 },
  { lane: 0, y: 318 },
  { lane: 1, y: 388 },
  { lane: 0, y: 440 },
  { lane: 1, y: 506 },
  { lane: 0, y: 558 },
  { lane: 1, y: 624 },
  { lane: 0, y: 676 },
  { lane: 1, y: 730 },
  { lane: 0, y: 770 },
];
export function slotPos(slot) {
  return { x: LANE_X[slot.lane], y: slot.y };
}

// ------------------------------------------------------------ base painting

let base = null;
let baseScale = 0;

export function drawBase(ctx, scale) {
  if (!base || baseScale !== scale) {
    base = document.createElement('canvas');
    base.width = Math.ceil(W * scale);
    base.height = Math.ceil(H * scale);
    baseScale = scale;
    const b = base.getContext('2d');
    b.scale(scale, scale);
    paintBase(b);
  }
  ctx.drawImage(base, 0, 0, W, H);
}

function rr(c, x, y, w, h, r) {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
}

function paintBase(c) {
  // mud-season ground: dead grass, thawing mud, stubborn snow patches
  c.fillStyle = '#4a4030';
  c.fillRect(0, 0, W, H);
  const rnd = mulberry(7);
  for (let i = 0; i < 170; i++) {
    const x = rnd() * W, y = rnd() * H, r = 4 + rnd() * 16;
    c.fillStyle = rnd() < 0.55 ? 'rgba(74,58,38,0.5)' : 'rgba(96,84,56,0.45)';
    c.beginPath(); c.ellipse(x, y, r * 1.5, r, rnd() * 3, 0, 7); c.fill();
  }
  // gritty leftover snow patches
  for (let i = 0; i < 26; i++) {
    const x = rnd() * W, y = rnd() * H, r = 5 + rnd() * 13;
    c.fillStyle = 'rgba(222,224,222,0.28)';
    c.beginPath(); c.ellipse(x, y, r * 1.6, r * 0.7, rnd() * 3, 0, 7); c.fill();
  }

  // Lake Champlain sliver along the far west edge
  c.fillStyle = '#39566b';
  c.beginPath();
  c.moveTo(0, 0);
  c.lineTo(34, 0);
  c.bezierCurveTo(20, 200, 44, 420, 24, 620);
  c.bezierCurveTo(16, 700, 30, 780, 22, H);
  c.lineTo(0, H);
  c.closePath();
  c.fill();
  c.strokeStyle = 'rgba(226,230,226,0.5)';
  c.lineWidth = 2.5;
  c.beginPath();
  c.moveTo(34, 0);
  c.bezierCurveTo(20, 200, 44, 420, 24, 620);
  c.bezierCurveTo(16, 700, 30, 780, 22, H);
  c.stroke();

  // side streets heading toward the lake
  sideStreet(c, 344, 'left', 'Starr Farm Rd');
  sideStreet(c, 470, 'left', 'Shore Rd');
  sideStreet(c, 236, 'right', 'Ethan Allen Pkwy');
  sideStreet(c, 640, 'right', 'Institute Rd');

  // ---- the road itself
  const rx = ROAD.cx - ROAD.width / 2;
  // muddy shoulders + crusty snowbanks
  c.fillStyle = '#3d3123';
  c.fillRect(rx - 16, 0, ROAD.width + 32, H);
  for (let i = 0; i < 46; i++) {
    const side = rnd() < 0.5 ? rx - 12 : rx + ROAD.width + 2;
    c.fillStyle = 'rgba(210,212,210,0.35)';
    c.beginPath();
    c.ellipse(side + rnd() * 10, rnd() * H, 7 + rnd() * 8, 3.5 + rnd() * 3, 0, 0, 7);
    c.fill();
  }
  // asphalt
  const g = c.createLinearGradient(rx, 0, rx + ROAD.width, 0);
  g.addColorStop(0, '#3c4046');
  g.addColorStop(0.5, '#474c53');
  g.addColorStop(1, '#3c4046');
  c.fillStyle = g;
  c.fillRect(rx, 0, ROAD.width, H);
  // asphalt speckle + cracks
  for (let i = 0; i < 240; i++) {
    c.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.09)';
    c.fillRect(rx + rnd() * ROAD.width, rnd() * H, 1.6, 1.6);
  }
  c.strokeStyle = 'rgba(20,22,25,0.5)';
  c.lineWidth = 1;
  for (let i = 0; i < 14; i++) {
    const x = rx + 8 + rnd() * (ROAD.width - 16), y = rnd() * H;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + (rnd() - 0.5) * 26, y + 10 + rnd() * 22);
    c.stroke();
  }
  // edge lines
  c.strokeStyle = 'rgba(233,229,210,0.55)';
  c.lineWidth = 3;
  c.beginPath(); c.moveTo(rx + 6, 0); c.lineTo(rx + 6, H); c.stroke();
  c.beginPath(); c.moveTo(rx + ROAD.width - 6, 0); c.lineTo(rx + ROAD.width - 6, H); c.stroke();
  // dashed yellow center line, weathered
  c.strokeStyle = 'rgba(226,183,74,0.8)';
  c.lineWidth = 4;
  c.setLineDash([22, 20]);
  c.beginPath(); c.moveTo(ROAD.cx, 0); c.lineTo(ROAD.cx, H); c.stroke();
  c.setLineDash([]);
  // mud tracked onto the pavement
  for (let i = 0; i < 22; i++) {
    c.fillStyle = 'rgba(74,58,36,0.22)';
    c.beginPath();
    c.ellipse(rx + rnd() * ROAD.width, rnd() * H, 8 + rnd() * 14, 4 + rnd() * 5, rnd(), 0, 7);
    c.fill();
  }

  // ---- landmarks
  batteryPark(c, rnd);
  school(c, 96, 636);
  park(c, 74, 300, 96, 'LEDDY PARK', rnd, true);
  park(c, 60, 168, 62, 'STARR FARM', rnd, true);
  ethanAllen(c, 402, 300, rnd);
  houses(c, rnd);
  topSign(c);
}

function sideStreet(c, y, dir, name) {
  const rx = ROAD.cx - ROAD.width / 2;
  const from = dir === 'left' ? 0 : ROAD.cx + ROAD.width / 2;
  const to = dir === 'left' ? rx : W;
  c.fillStyle = '#4a4e54';
  c.fillRect(from, y - 13, to - from, 26);
  c.strokeStyle = 'rgba(233,229,210,0.3)';
  c.lineWidth = 2;
  c.beginPath(); c.moveTo(from, y - 11); c.lineTo(to, y - 11); c.stroke();
  c.beginPath(); c.moveTo(from, y + 11); c.lineTo(to, y + 11); c.stroke();
  c.fillStyle = 'rgba(240,232,210,0.75)';
  c.font = '600 9px system-ui, sans-serif';
  c.textAlign = dir === 'left' ? 'left' : 'right';
  c.fillText(name, dir === 'left' ? from + 8 : W - 8, y - 17);
}

function label(c, x, y, text) {
  c.font = '800 10px system-ui, sans-serif';
  c.textAlign = 'center';
  c.fillStyle = 'rgba(12,10,6,0.55)';
  rr(c, x - c.measureText(text).width / 2 - 5, y - 9, c.measureText(text).width + 10, 14, 7);
  c.fill();
  c.fillStyle = 'rgba(245,234,214,0.92)';
  c.fillText(text, x, y + 2);
}

function pine(c, x, y, s) {
  c.fillStyle = '#31463156';
  c.beginPath(); c.ellipse(x + 2, y + 3, s * 1.1, s * 0.5, 0, 0, 7); c.fill();
  c.fillStyle = '#3d5a3b';
  c.beginPath(); c.arc(x, y, s, 0, 7); c.fill();
  c.fillStyle = '#2f4a30';
  c.beginPath(); c.arc(x - s * 0.3, y + s * 0.25, s * 0.55, 0, 7); c.fill();
}
function bareTree(c, x, y, s) {
  c.strokeStyle = '#5d4a35';
  c.lineWidth = 2;
  c.beginPath(); c.moveTo(x, y + s); c.lineTo(x, y - s * 0.4); c.stroke();
  c.lineWidth = 1.2;
  c.beginPath();
  c.moveTo(x, y); c.lineTo(x - s * 0.7, y - s * 0.8);
  c.moveTo(x, y - s * 0.2); c.lineTo(x + s * 0.7, y - s);
  c.stroke();
}

function park(c, x, y, r, name, rnd, sandy) {
  c.fillStyle = '#4c5b3a';
  c.beginPath(); c.ellipse(x, y, r, r * 0.72, 0, 0, 7); c.fill();
  c.fillStyle = 'rgba(74,64,48,0.5)';
  for (let i = 0; i < 6; i++) {
    c.beginPath();
    c.ellipse(x + (rnd() - 0.5) * r * 1.4, y + (rnd() - 0.5) * r, 8 + rnd() * 10, 5, rnd(), 0, 7);
    c.fill();
  }
  if (sandy) { // a hint of beach on the lake side
    c.fillStyle = '#b9a274';
    c.beginPath(); c.ellipse(x - r * 0.8, y, r * 0.28, r * 0.5, 0.3, 0, 7); c.fill();
  }
  for (let i = 0; i < 5; i++) pine(c, x + (rnd() - 0.4) * r, y + (rnd() - 0.5) * r * 0.9, 7 + rnd() * 5);
  bareTree(c, x + r * 0.5, y - r * 0.3, 9);
  label(c, x, y + r * 0.72 + 12, name);
}

function school(c, x, y) {
  c.fillStyle = '#31463156';
  c.beginPath(); c.ellipse(x + 4, y + 44, 70, 26, 0, 0, 7); c.fill();
  // main building
  c.fillStyle = '#8c5a3c';
  rr(c, x - 58, y - 4, 116, 46, 5); c.fill();
  c.fillStyle = '#a06a48';
  rr(c, x - 58, y - 12, 116, 12, 4); c.fill();
  // windows
  c.fillStyle = '#e8dfc8';
  for (let i = 0; i < 6; i++) c.fillRect(x - 50 + i * 18, y + 6, 10, 12);
  // door + walk
  c.fillStyle = '#4a3423';
  c.fillRect(x - 7, y + 24, 14, 18);
  // track oval out back
  c.strokeStyle = '#a0522d';
  c.lineWidth = 5;
  c.beginPath(); c.ellipse(x - 6, y + 66, 42, 15, 0, 0, 7); c.stroke();
  c.fillStyle = '#4c5b3a';
  c.beginPath(); c.ellipse(x - 6, y + 66, 30, 9, 0, 0, 7); c.fill();
  label(c, x, y - 24, 'BURLINGTON HS');
}

function ethanAllen(c, x, y, rnd) {
  // wooded hill with the stone tower
  c.fillStyle = '#4c5b3a';
  c.beginPath(); c.ellipse(x, y, 84, 118, 0, 0, 7); c.fill();
  c.fillStyle = '#435236';
  c.beginPath(); c.ellipse(x + 14, y - 14, 52, 74, 0, 0, 7); c.fill();
  for (let i = 0; i < 16; i++) {
    pine(c, x + (rnd() - 0.45) * 130, y + (rnd() - 0.5) * 200, 6 + rnd() * 7);
  }
  // Ethan Allen Tower
  const tx = x + 26, ty = y - 30;
  c.fillStyle = 'rgba(20,16,10,0.4)';
  c.beginPath(); c.ellipse(tx + 3, ty + 26, 16, 6, 0, 0, 7); c.fill();
  c.fillStyle = '#8a8578';
  rr(c, tx - 11, ty - 18, 22, 44, 3); c.fill();
  c.fillStyle = '#6f6a5e';
  rr(c, tx - 13, ty - 26, 26, 10, 3); c.fill();
  c.fillStyle = '#2b2620';
  c.fillRect(tx - 3, ty + 8, 6, 9); // slit window
  label(c, tx - 4, ty + 44, 'ETHAN ALLEN TOWER');
  label(c, x - 6, y + 104, 'ETHAN ALLEN PARK');
}

function batteryPark(c, rnd) {
  c.fillStyle = '#4c5b3a';
  c.beginPath(); c.ellipse(ROAD.cx, H + 26, 230, 68, 0, 0, 7); c.fill();
  for (let i = 0; i < 8; i++) pine(c, 60 + rnd() * 360, H - 22 + rnd() * 18, 7 + rnd() * 5);
  label(c, ROAD.cx - 118, H - 34, 'BATTERY PARK ↓');
}

function houses(c, rnd) {
  // modest New North End ranches along the east side
  const hx = ROAD.cx + ROAD.width / 2 + 44;
  const roofs = ['#7d4f3a', '#5d6b7a', '#6d7a55', '#8a6a4a', '#75564b'];
  const ys = [96, 448, 528, 596, 700, 760];
  ys.forEach((y, i) => {
    c.fillStyle = 'rgba(20,16,10,0.35)';
    rr(c, hx - 15 + (i % 2) * 8, y - 11, 36, 28, 3); c.fill();
    c.fillStyle = roofs[i % roofs.length];
    rr(c, hx - 18 + (i % 2) * 8, y - 14, 36, 28, 3); c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.25)';
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(hx - 18 + (i % 2) * 8, y); c.lineTo(hx + 18 + (i % 2) * 8, y);
    c.stroke();
    // driveway
    c.fillStyle = '#4a4e54';
    c.fillRect(ROAD.cx + ROAD.width / 2 + 10, y - 4 + (i % 2) * 4, hx - 24 - (ROAD.cx + ROAD.width / 2) + (i % 2) * 8, 9);
  });
  // a couple on the west side too, between the parks
  const wx = 96;
  [388, 520].forEach((y, i) => {
    c.fillStyle = roofs[(i + 2) % roofs.length];
    rr(c, wx - 18, y - 14, 36, 28, 3); c.fill();
  });
}

function topSign(c) {
  c.fillStyle = 'rgba(12,10,6,0.55)';
  rr(c, ROAD.cx - 118, 12, 236, 22, 8); c.fill();
  c.fillStyle = 'rgba(245,234,214,0.95)';
  c.font = '800 12px system-ui, sans-serif';
  c.textAlign = 'center';
  c.fillText('↑ NORTH AVE · NEW NORTH END', ROAD.cx, 27);
}

// tiny deterministic PRNG so the base map is stable between repaints
function mulberry(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
