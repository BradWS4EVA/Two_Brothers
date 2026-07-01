'use strict';
/* ============================================================
   TWO BROTHERS — It's Just Called Two Brothers
   A two-thumb endless runner. Left thumb jumps the far brother,
   right thumb jumps the near brother. Survive the meteor, the
   giant cat monsters, the tornado, and the Mexican armada with
   weapons made from tomatoes. In: Alaska.
   ============================================================ */

// ---------- Canvas / scaling ----------
const W = 480, H = 854;
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const vw = window.innerWidth, vh = window.innerHeight;
  const scale = Math.min(vw / W, vh / H);
  canvas.style.width = (W * scale) + 'px';
  canvas.style.height = (H * scale) + 'px';
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize);
resize();

// ---------- Utils ----------
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function overlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function vibrate(ms) {
  if (navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) {} }
}

// ---------- Persistence ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem('tb_' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('tb_' + k, JSON.stringify(v)); } catch (e) {} }
};

// ---------- Audio (all procedural WebAudio, no assets) ----------
const SND = {
  ac: null, master: null, musicGain: null,
  muted: store.get('muted', false),
  musicTimer: null, step: 0,
  init() {
    if (this.ac) return;
    try {
      this.ac = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ac.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ac.destination);
      this.musicGain = this.ac.createGain();
      this.musicGain.gain.value = 0.35;
      this.musicGain.connect(this.master);
    } catch (e) { this.ac = null; }
  },
  resume() { if (this.ac && this.ac.state === 'suspended') this.ac.resume(); },
  toggle() {
    this.muted = !this.muted;
    store.set('muted', this.muted);
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
  },
  tone(freq, dur, type, vol, slideTo, delay) {
    if (!this.ac || this.muted) return;
    const t0 = this.ac.currentTime + (delay || 0);
    const o = this.ac.createOscillator(), g = this.ac.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t0 + dur);
    g.gain.setValueAtTime(vol || 0.2, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  },
  noise(dur, vol, freq, delay) {
    if (!this.ac || this.muted) return;
    const t0 = this.ac.currentTime + (delay || 0);
    const n = Math.floor(this.ac.sampleRate * dur);
    const buf = this.ac.createBuffer(1, n, this.ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ac.createBufferSource(); src.buffer = buf;
    const f = this.ac.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = freq || 1200;
    const g = this.ac.createGain(); g.gain.value = vol || 0.3;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t0);
  },
  jump()   { this.tone(300, 0.14, 'square', 0.12, 620); },
  djump()  { this.tone(420, 0.16, 'square', 0.12, 880); },
  hit()    { this.noise(0.25, 0.4, 900); this.tone(220, 0.3, 'sawtooth', 0.2, 60); },
  splat()  { this.noise(0.12, 0.35, 500); this.tone(140, 0.12, 'sine', 0.25, 70); },
  pickup() { this.tone(520, 0.09, 'square', 0.15); this.tone(780, 0.12, 'square', 0.15, null, 0.09); },
  throwT() { this.tone(700, 0.08, 'triangle', 0.1, 400); },
  meteor() { this.tone(1400, 0.7, 'sawtooth', 0.08, 120); },
  boom()   { this.noise(0.6, 0.55, 400); this.tone(90, 0.55, 'sine', 0.35, 35); },
  card()   { this.tone(70, 0.7, 'sawtooth', 0.25, 55); this.noise(0.4, 0.15, 300); },
  honk()   { this.tone(370, 0.18, 'square', 0.2); this.tone(466, 0.22, 'square', 0.2, null, 0.16); },
  roar()   { this.tone(110, 0.7, 'sawtooth', 0.3, 60); this.noise(0.6, 0.25, 500); },
  gameover() {
    [392, 370, 349, 330].forEach((f, i) => this.tone(f, 0.32, 'triangle', 0.2, null, i * 0.28));
  },
  // Tiny driving music loop
  BASS: [110, 110, 131, 110, 147, 147, 131, 98],
  startMusic() {
    if (!this.ac || this.musicTimer) return;
    const stepDur = 0.22;
    this.musicTimer = setInterval(() => {
      if (this.muted || !running || game.state === 'over') return;
      const s = this.step % 8;
      const t0 = this.ac.currentTime;
      // bass
      const o = this.ac.createOscillator(), g = this.ac.createGain();
      o.type = 'square';
      o.frequency.value = this.BASS[s] * (game.gear >= 12 ? 1.5 : 1);
      g.gain.setValueAtTime(0.09, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + stepDur * 0.9);
      o.connect(g); g.connect(this.musicGain);
      o.start(t0); o.stop(t0 + stepDur);
      // hat
      if (s % 2 === 0) {
        const n = Math.floor(this.ac.sampleRate * 0.04);
        const buf = this.ac.createBuffer(1, n, this.ac.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
        const src = this.ac.createBufferSource(); src.buffer = buf;
        const f = this.ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 6000;
        const hg = this.ac.createGain(); hg.gain.value = 0.05;
        src.connect(f); f.connect(hg); hg.connect(this.musicGain);
        src.start(t0);
      }
      this.step++;
    }, 220);
  }
};

// ---------- Lanes ----------
const LANES = [
  { groundY: 608, scale: 0.86, trackTop: 566 },  // far brother (left thumb)
  { groundY: 762, scale: 1.0,  trackTop: 700 }   // near brother (right thumb)
];
const BRO_X = 118;

// ---------- Game state ----------
const game = {};
let running = true;

function resetGame() {
  game.state = 'title';        // title | intro | play | dying | over
  game.t = 0;                  // global time
  game.worldX = 0;             // distance in px
  game.speed = 330;
  game.baseSpeed = 330;
  game.gear = 1;               // hits 12 at the tornado
  game.hearts = 4;
  game.maxHearts = 4;
  game.score = 0;
  game.splats = 0;
  game.ammo = 0;
  game.mult = 1;               // score multiplier (gear pickup)
  game.multT = 0;
  game.shake = 0;
  game.flash = 0;
  game.timescale = 1;
  game.phase = -1;             // index into PHASES
  game.phaseShown = -1;
  game.loop = 0;               // how many times the script has looped
  game.introT = 0;
  game.introBoom = false;
  game.vanT = 0;               // >0 while riding pickup van
  game.inv = 0;                // invulnerability seconds
  game.dieT = 0;
  game.catRoarT = 0;
  game.gustT = 0;
  game.twelveShown = false;
  game.bros = [makeBro(0), makeBro(1)];
  game.obstacles = [];
  game.pickups = [];
  game.tomatoes = [];          // thrown by brothers
  game.shots = [];             // armada tomato cannonballs
  game.particles = [];
  game.cards = [];
  game.cardT = 0;
  game.spawnT = 1.2;
  game.pickupT = 7;
  game.throwCD = [0, 0];
  game.best = store.get('best', 0);
  game.bestWave = store.get('bestWave', '');
}

function makeBro(lane) {
  return {
    lane, y: 0, vy: 0, grounded: true, jumps: 0,
    animT: rand(0, 1), hitT: 0, w: 34, h: 62
  };
}

// ---------- The trailer script (phases by meters) ----------
const M = 50; // px per meter
const PHASES = [
  { name: 'THE METEOR', at: 0,
    cards: [['AND THEN...', ''], ['A METEOR HIT.', '']] },
  { name: 'GIANT CAT MONSTERS', at: 320,
    cards: [['THEY RAN AS FAST', 'AS THEY COULD...'], ['...FROM GIANT', 'CAT MONSTERS.']] },
  { name: 'THE GIANT TORNADO', at: 700,
    cards: [['AND THEN A GIANT', 'TORNADO CAME.']] },
  { name: 'THE MEXICAN ARMADA', at: 1150,
    cards: [['A MEXICAN ARMADA', 'SHOWS UP...'], ['...WITH WEAPONS MADE', 'FROM TOMATOES.']] },
  { name: 'HANDLING BUSINESS', at: 1600,
    cards: [['YOU BETTER BET YOUR', 'BOTTOM DOLLAR...'], ['...THAT THESE TWO BROTHERS', 'KNOW HOW TO HANDLE BUSINESS.']] }
];
const LOOP_LEN = 2100; // after HANDLING BUSINESS runs 500m, script loops harder

function currentMeters() { return Math.floor(game.worldX / M); }

function phaseAt(meters) {
  const m = meters % LOOP_LEN;
  let p = 0;
  for (let i = 0; i < PHASES.length; i++) if (m >= PHASES[i].at) p = i;
  return p;
}

// ---------- Cards (trailer narrator) ----------
function queueCards(cards, big) {
  for (const c of cards) game.cards.push({ line1: c[0], line2: c[1], dur: 1.7, big: !!big });
}

function updateCards(dt) {
  if (game.cards.length === 0) { game.cardT = 0; return; }
  if (game.cardT === 0) SND.card();
  game.cardT += dt;
  if (game.cardT >= game.cards[0].dur) {
    game.cards.shift();
    game.cardT = 0;
  }
}

// ---------- Input ----------
let pointerDown = {};
function press(side) {
  SND.init(); SND.resume(); SND.startMusic();
  if (game.state === 'title') { startIntro(); return; }
  if (game.state === 'over') { if (game.dieT > 1.2) { resetGame(); startIntro(); } return; }
  if (game.state === 'intro') return;
  if (game.state !== 'play') return;
  jump(game.bros[side]);
}

function jump(b) {
  if (game.vanT > 0) return;
  if (b.grounded) {
    b.vy = -900; b.grounded = false; b.jumps = 1;
    SND.jump(); spawnPuff(BRO_X, LANES[b.lane].groundY, b.lane);
  } else if (b.jumps === 1) {
    b.vy = -820; b.jumps = 2;
    SND.djump();
    for (let i = 0; i < 5; i++) addPart(BRO_X, LANES[b.lane].groundY + b.y + 50, rand(-60, 60), rand(20, 90), rand(0.2, 0.4), '#cfe6ff', 3);
  }
}

canvas.addEventListener('pointerdown', e => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width * W;
  const y = (e.clientY - rect.top) / rect.height * H;
  // sound toggle hotspot (top-right)
  if (y < 64 && x > W - 64) { SND.init(); SND.toggle(); return; }
  press(x < W / 2 ? 0 : 1);
});
window.addEventListener('keydown', e => {
  if (e.repeat) return;
  if (e.code === 'KeyA' || e.code === 'KeyW' || e.code === 'ShiftLeft') press(0);
  else if (e.code === 'KeyL' || e.code === 'ArrowUp' || e.code === 'Enter') press(1);
  else if (e.code === 'Space') { press(game.state === 'play' ? 1 : 0); }
  else if (e.code === 'KeyM') { SND.init(); SND.toggle(); }
});
document.addEventListener('visibilitychange', () => { running = !document.hidden; if (running) { last = performance.now(); loop(last); } });

// ---------- Intro ----------
function startIntro() {
  game.state = 'intro';
  game.introT = 0;
  game.inv = 999;
  queueCards([['TWO BROTHERS...', ''], ['...IN A VAN.', '']], true);
  SND.honk();
}

// ---------- Particles ----------
function addPart(x, y, vx, vy, life, color, size, grav) {
  game.particles.push({ x, y, vx, vy, life, maxLife: life, color, size, grav: grav || 0 });
}
function spawnPuff(x, y, lane) {
  for (let i = 0; i < 4; i++) addPart(x + rand(-8, 8), y + rand(-4, 2), rand(-90, -30), rand(-30, 10), rand(0.25, 0.5), 'rgba(240,248,255,0.8)', rand(3, 6));
}
function splatBurst(x, y, color) {
  for (let i = 0; i < 12; i++) {
    const a = rand(0, TAU), sp = rand(40, 260);
    addPart(x, y, Math.cos(a) * sp, Math.sin(a) * sp - 60, rand(0.3, 0.7), color, rand(3, 7), 600);
  }
}
function explosion(x, y, big) {
  const n = big ? 26 : 14;
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU), sp = rand(60, big ? 420 : 260);
    addPart(x, y, Math.cos(a) * sp, Math.sin(a) * sp - 80, rand(0.3, 0.9),
      ['#ffd166', '#ff7733', '#ff4422', '#aaa'][randi(0, 3)], rand(4, big ? 12 : 8), 500);
  }
  game.shake = Math.max(game.shake, big ? 16 : 8);
}

// ---------- Spawning ----------
// kinds: rock, spike, paw, debris(air), barrel, firepatch
function spawnObstacle(kind, lane, opts) {
  const L = LANES[lane];
  const o = Object.assign({
    kind, lane, x: W + 90, y: 0, t: 0,
    destructible: true, dead: false
  }, opts || {});
  switch (kind) {
    case 'rock':   o.w = 44; o.h = 40; break;
    case 'spike':  o.w = 38; o.h = 52; break;
    case 'barrel': o.w = 42; o.h = 42; o.spin = 0; break;
    case 'debris': o.w = 52; o.h = 30; o.fly = LANES[lane].groundY - rand(78, 120); o.destructible = true; break;
    case 'paw':    o.w = 74; o.h = 96; o.state = 'warn'; o.warnT = 0.85; o.holdT = 0.55; o.x = W * rand(0.55, 0.8); break;
    case 'fire':   o.w = 64; o.h = 30; o.life = 1.6; o.destructible = false; break;
  }
  game.obstacles.push(o);
  return o;
}

function spawnMeteor(lane) {
  const targetX = W * rand(0.62, 0.85);
  game.obstacles.push({
    kind: 'meteor', lane, state: 'warn', warnT: 0.9,
    x: targetX, y: -80, w: 52, h: 52, t: 0, destructible: false, dead: false
  });
  SND.meteor();
}

function spawnShot(lane) {
  const L = LANES[lane];
  const targetX = W * rand(0.5, 0.8);
  const t = 1.15; // flight time
  const sx = W + 60, sy = 180 + lane * 60;
  const gx = targetX, gy = L.groundY + 6;
  game.shots.push({
    lane, x: sx, y: sy, t: 0, dur: t,
    sx, sy, gx, gy, apex: 120 + lane * 40, dead: false
  });
  // muzzle flash from the armada
  addPart(W - 30, 150 + lane * 50, -80, -20, 0.3, '#ffd166', 8);
}

function spawnPickup() {
  const lane = randi(0, 1);
  const L = LANES[lane];
  const roll = Math.random();
  let kind = 'tomato';
  if (roll > 0.86) kind = 'heart';
  else if (roll > 0.72) kind = 'van';
  else if (roll > 0.55) kind = 'gear';
  game.pickups.push({
    kind, lane, x: W + 60, y: L.groundY - rand(60, 130),
    w: 40, h: 40, bob: rand(0, TAU), dead: false
  });
}

// Director: what to spawn per phase
function director(dt) {
  if (game.state !== 'play' || game.cards.length > 0) return;
  game.spawnT -= dt;
  game.pickupT -= dt;
  if (game.pickupT <= 0) { spawnPickup(); game.pickupT = rand(6, 11); }
  if (game.spawnT > 0) return;

  const p = game.phase;
  const lane = randi(0, 1);
  const other = 1 - lane;
  const hard = Math.min(game.loop * 0.15 + currentMeters() / 4000, 0.5); // difficulty creep
  const gapBase = lerp(1.35, 0.8, hard) * (330 / game.speed);

  const groundKind = () => Math.random() < 0.5 ? 'rock' : (Math.random() < 0.5 ? 'spike' : 'barrel');

  switch (p) {
    case 0: // METEORS
      if (Math.random() < 0.55) spawnMeteor(lane);
      else spawnObstacle(groundKind(), lane);
      if (Math.random() < 0.35) spawnMeteor(other);
      break;
    case 1: // CATS
      if (Math.random() < 0.5) spawnObstacle('paw', lane);
      else spawnObstacle(groundKind(), lane);
      if (Math.random() < 0.3) spawnObstacle(groundKind(), other);
      break;
    case 2: // TORNADO
      if (Math.random() < 0.45) spawnObstacle('debris', lane);
      else spawnObstacle('barrel', lane);
      if (Math.random() < 0.35) spawnObstacle('debris', other);
      break;
    case 3: // ARMADA
      if (Math.random() < 0.6) spawnShot(lane);
      else spawnObstacle(groundKind(), lane);
      if (Math.random() < 0.35) spawnShot(other);
      break;
    default: { // HANDLING BUSINESS — everything
      const r = Math.random();
      if (r < 0.22) spawnMeteor(lane);
      else if (r < 0.42) spawnObstacle('paw', lane);
      else if (r < 0.62) spawnObstacle('debris', lane);
      else if (r < 0.8) spawnShot(lane);
      else spawnObstacle(groundKind(), lane);
      if (Math.random() < 0.4) {
        const r2 = Math.random();
        if (r2 < 0.33) spawnShot(other);
        else if (r2 < 0.66) spawnObstacle('debris', other);
        else spawnObstacle(groundKind(), other);
      }
    }
  }
  game.spawnT = rand(gapBase * 0.85, gapBase * 1.5);
}

// ---------- Damage / scoring ----------
function hurt(brother) {
  if (game.inv > 0 || game.vanT > 0) return;
  game.hearts--;
  game.inv = 1.4;
  game.flash = 0.25;
  game.shake = Math.max(game.shake, 10);
  if (brother) brother.hitT = 0.5;
  SND.hit(); vibrate(80);
  if (game.hearts <= 0) startDeath();
}

function startDeath() {
  game.state = 'dying';
  game.dieT = 0;
  game.timescale = 0.3;
  SND.gameover();
  const meters = currentMeters();
  if (game.score > game.best) {
    game.best = game.score;
    game.bestWave = PHASES[game.phase] ? PHASES[game.phase].name : '';
    store.set('best', game.best);
    store.set('bestWave', game.bestWave);
  }
}

function killObstacle(o, byTomato) {
  o.dead = true;
  const L = LANES[o.lane];
  const y = o.kind === 'debris' ? o.fly : (o.kind === 'paw' ? L.groundY - 60 : L.groundY - o.h / 2);
  splatBurst(o.x + (o.w || 40) / 2, y, byTomato ? '#e63946' : '#ffd166');
  game.splats++;
  game.score += 25 * game.mult;
  SND.splat(); vibrate(20);
}

// ---------- Update ----------
let last = performance.now();

function update(dt) {
  game.t += dt;
  if (game.shake > 0) game.shake = Math.max(0, game.shake - dt * 40);
  if (game.flash > 0) game.flash -= dt;
  if (game.catRoarT > 0) game.catRoarT -= dt;

  // particles always update
  for (const pt of game.particles) {
    pt.life -= dt;
    pt.x += pt.vx * dt; pt.y += pt.vy * dt;
    pt.vy += (pt.grav || 0) * dt;
  }
  game.particles = game.particles.filter(p => p.life > 0);

  if (game.state === 'title') return;

  updateCards(dt);
  const cardSlow = game.cards.length > 0 ? 0.45 : 1;
  const ts = (game.state === 'dying' ? 0.3 : 1) * cardSlow;
  const d = dt * ts;

  if (game.state === 'intro') {
    game.introT += dt;
    game.worldX += game.speed * d;
    if (game.introT > 3.4 && !game.introBoom) {
      game.introBoom = true;
      explosion(W * 0.72, LANES[1].groundY - 60, true);
      explosion(W * 0.6, LANES[0].groundY - 40, true);
      SND.boom(); vibrate([60, 40, 80]);
      queueCards(PHASES[0].cards, true);
      game.phaseShown = 0;
    }
    if (game.introT > 4.2) {
      game.state = 'play';
      game.inv = 1.2;
      game.phase = 0;
    }
    return;
  }

  if (game.state === 'dying') {
    game.dieT += dt;
    if (game.dieT > 1.5) { game.state = 'over'; game.dieT = 0; }
    return;
  }
  if (game.state === 'over') { game.dieT += dt; return; }

  // ---- PLAY ----
  if (game.inv > 0) game.inv -= d;
  if (game.vanT > 0) {
    game.vanT -= d;
    if (game.vanT <= 0) { spawnPuff(BRO_X, LANES[1].groundY, 1); SND.honk(); }
  }
  if (game.multT > 0) { game.multT -= d; if (game.multT <= 0) game.mult = 1; }

  // distance & speed
  const meters = currentMeters();
  const loopN = Math.floor(meters / LOOP_LEN);
  game.loop = loopN;
  game.baseSpeed = 330 + Math.min(meters, 4000) * 0.03 + loopN * 40;
  const gearMult = game.gear >= 12 ? 1.35 : 1;
  const vanMult = game.vanT > 0 ? 1.15 : 1;
  game.speed = game.baseSpeed * gearMult * vanMult;
  game.worldX += game.speed * d;
  game.score += game.speed * d / M * game.mult;

  // phase progression
  const p = phaseAt(meters);
  if (p !== game.phase) {
    game.phase = p;
    const key = loopN * 10 + p;
    if (key !== game.phaseShown) {
      game.phaseShown = key;
      queueCards(PHASES[p].cards, true);
      if (p === 1) { SND.roar(); game.catRoarT = 1.2; }
      if (p === 4 && loopN > 0) queueCards([['IN: ALASKA.', '']]);
    }
  }
  // 12th gear moment: partway through the tornado
  if (game.phase === 2 && !game.twelveShown && (meters % LOOP_LEN) > PHASES[2].at + 140) {
    game.twelveShown = true;
    game.gear = 12;
    queueCards([["AND THAT'S WHEN THINGS GOT", 'KNOCKED INTO 12TH GEAR.']], true);
    game.flash = 0.2;
    SND.boom();
  }

  // brothers physics
  for (const b of game.bros) {
    b.animT += d * (game.speed / 330);
    if (b.hitT > 0) b.hitT -= dt;
    if (!b.grounded) {
      b.vy += 2600 * d;
      b.y += b.vy * d;
      if (b.y >= 0) {
        b.y = 0; b.vy = 0; b.grounded = true; b.jumps = 0;
        spawnPuff(BRO_X, LANES[b.lane].groundY, b.lane);
      }
    }
  }

  director(dt * cardSlow);

  // wind gusts (tornado phase) — pushes snow, cosmetic pressure
  if (game.phase === 2) {
    game.gustT -= d;
    if (game.gustT <= 0) { game.gustT = rand(0.8, 2); }
  }

  // ---- obstacles ----
  for (const o of game.obstacles) {
    o.t += d;
    switch (o.kind) {
      case 'rock': case 'spike':
        o.x -= game.speed * d;
        break;
      case 'barrel':
        o.x -= game.speed * 1.12 * d;
        o.spin = (o.spin || 0) + d * 9;
        break;
      case 'debris':
        o.x -= game.speed * 1.35 * d;
        o.wob = Math.sin(o.t * 10) * 6;
        break;
      case 'fire':
        o.x -= game.speed * d;
        o.life -= d;
        if (o.life <= 0) o.dead = true;
        if (Math.random() < 0.3) addPart(o.x + rand(0, o.w), LANES[o.lane].groundY - rand(0, 20), rand(-20, 20), rand(-90, -40), rand(0.2, 0.45), ['#ffd166', '#ff7733'][randi(0, 1)], rand(3, 6));
        break;
      case 'paw':
        o.x -= game.speed * d * 0.25; // paw mostly holds screen position
        if (o.state === 'warn') {
          o.warnT -= d;
          if (o.warnT <= 0) { o.state = 'slam'; game.shake = Math.max(game.shake, 7); SND.boom(); }
        } else if (o.state === 'slam') {
          o.holdT -= d;
          if (o.holdT <= 0) o.state = 'lift';
        } else if (o.state === 'lift') {
          o.liftT = (o.liftT || 0) + d;
          if (o.liftT > 0.4) o.dead = true;
        }
        break;
      case 'meteor':
        if (o.state === 'warn') {
          o.x -= game.speed * d * 0.55;
          o.warnT -= d;
          if (o.warnT <= 0) { o.state = 'fall'; o.fy = -80; o.fx = o.x + 260; }
        } else if (o.state === 'fall') {
          const L = LANES[o.lane];
          o.fx -= (game.speed * 0.35 + 180) * d;
          o.fy += 780 * d;
          if (o.fy >= L.groundY - 40) {
            o.state = 'done'; o.dead = true;
            explosion(o.fx, L.groundY - 20, false);
            SND.boom();
            spawnObstacle('fire', o.lane, { x: o.fx - 26 });
          }
        }
        break;
    }
    if (o.x + (o.w || 60) < -40) o.dead = true;
  }

  // ---- armada shots (tomato cannonballs) ----
  for (const s of game.shots) {
    s.t += d;
    const k = clamp(s.t / s.dur, 0, 1);
    s.x = lerp(s.sx, s.gx, k);
    s.y = lerp(s.sy, s.gy, k) - Math.sin(k * Math.PI) * s.apex;
    s.gx -= game.speed * d; s.sx -= game.speed * d;
    if (k >= 1) {
      s.dead = true;
      splatBurst(s.x, s.y, '#e63946');
      SND.splat();
      spawnObstacle('fire', s.lane, { x: s.x - 26, splat: true, life: 1.0 });
    }
  }

  // ---- pickups ----
  for (const pk of game.pickups) {
    pk.x -= game.speed * d;
    pk.bob += d * 4;
    if (pk.x < -50) pk.dead = true;
  }

  // ---- brother tomatoes ----
  game.throwCD[0] -= d; game.throwCD[1] -= d;
  if (game.ammo > 0) {
    for (const b of game.bros) {
      if (game.throwCD[b.lane] > 0) continue;
      // nearest destructible threat ahead in lane
      let target = null;
      for (const o of game.obstacles) {
        if (o.dead || o.lane !== b.lane || !o.destructible) continue;
        if (o.kind === 'meteor') continue;
        const ox = o.x;
        if (ox > BRO_X + 20 && ox < BRO_X + 340) { target = o; break; }
      }
      if (!target) {
        for (const s of game.shots) {
          if (!s.dead && s.lane === b.lane && s.x > BRO_X + 20 && s.x < BRO_X + 320 && s.t / s.dur > 0.35) { target = s; break; }
        }
      }
      if (target && game.ammo > 0) {
        game.ammo--;
        game.throwCD[b.lane] = 0.38;
        const L = LANES[b.lane];
        game.tomatoes.push({ lane: b.lane, x: BRO_X + 24, y: L.groundY + b.y - 44, vx: 620, vy: -60, dead: false });
        SND.throwT();
      }
    }
  }
  for (const t of game.tomatoes) {
    t.x += (t.vx + game.speed * 0.2) * d;
    t.y += t.vy * d; t.vy += 160 * d;
    if (t.x > W + 40) t.dead = true;
    // hit obstacles
    for (const o of game.obstacles) {
      if (o.dead || o.lane !== t.lane || !o.destructible) continue;
      const L = LANES[o.lane];
      const box = obstacleBox(o, L);
      if (box && t.x > box.x && t.x < box.x + box.w && t.y > box.y - 20 && t.y < box.y + box.h + 20) {
        t.dead = true; killObstacle(o, true); break;
      }
    }
    if (!t.dead) {
      for (const s of game.shots) {
        if (s.dead || s.lane !== t.lane) continue;
        if (Math.abs(t.x - s.x) < 26 && Math.abs(t.y - s.y) < 26) {
          t.dead = true; s.dead = true;
          splatBurst(s.x, s.y, '#e63946');
          game.splats++; game.score += 40 * game.mult;
          SND.splat();
        }
      }
    }
  }

  // ---- collisions with brothers ----
  for (const b of game.bros) {
    const L = LANES[b.lane];
    const bb = {
      x: BRO_X - 12, y: L.groundY + b.y - 56, w: 26, h: 54
    };
    if (game.vanT > 0) { bb.x = BRO_X - 40; bb.w = 110; bb.y = L.groundY - 54; bb.h = 50; }
    for (const o of game.obstacles) {
      if (o.dead || o.lane !== b.lane) continue;
      const box = obstacleBox(o, L);
      if (!box) continue;
      if (overlap(bb, box)) {
        if (game.vanT > 0 && o.destructible) { killObstacle(o, false); continue; }
        if (o.kind === 'fire' && o.splat) { /* splat puddle: lighter */ }
        hurt(b);
        if (o.destructible) o.dead = true;
      }
    }
    for (const s of game.shots) {
      if (s.dead || s.lane !== b.lane) continue;
      if (Math.abs(s.x - BRO_X) < 26 && Math.abs(s.y - (L.groundY + b.y - 30)) < 34) {
        s.dead = true;
        if (game.vanT > 0) { splatBurst(s.x, s.y, '#e63946'); game.splats++; continue; }
        splatBurst(s.x, s.y, '#e63946');
        hurt(b);
      }
    }
    for (const pk of game.pickups) {
      if (pk.dead || pk.lane !== b.lane) continue;
      const py = pk.y + Math.sin(pk.bob) * 8;
      if (Math.abs(pk.x - BRO_X) < 34 && (L.groundY + b.y - 30) - py < 60 && py - (L.groundY + b.y - 30) < 60) {
        pk.dead = true;
        collectPickup(pk);
      }
    }
  }

  // cleanup
  game.obstacles = game.obstacles.filter(o => !o.dead);
  game.shots = game.shots.filter(s => !s.dead);
  game.pickups = game.pickups.filter(p => !p.dead);
  game.tomatoes = game.tomatoes.filter(t => !t.dead);
}

function obstacleBox(o, L) {
  switch (o.kind) {
    case 'rock':   return { x: o.x + 5, y: L.groundY - o.h + 6, w: o.w - 10, h: o.h - 6 };
    case 'spike':  return { x: o.x + 6, y: L.groundY - o.h + 8, w: o.w - 12, h: o.h - 8 };
    case 'barrel': return { x: o.x + 4, y: L.groundY - o.h + 4, w: o.w - 8, h: o.h - 4 };
    case 'debris': return { x: o.x + 4, y: o.fly - 12 + (o.wob || 0), w: o.w - 8, h: o.h };
    case 'fire':   return { x: o.x + 6, y: L.groundY - 22, w: o.w - 12, h: 22 };
    case 'paw':    return o.state === 'slam' ? { x: o.x + 8, y: L.groundY - o.h + 6, w: o.w - 16, h: o.h - 6 } : null;
    case 'meteor': return o.state === 'fall' ? { x: o.fx - 22, y: o.fy - 22, w: 44, h: 44 } : null;
  }
  return null;
}

function collectPickup(pk) {
  SND.pickup(); vibrate(15);
  const L = LANES[pk.lane];
  splatBurst(pk.x, pk.y, '#8ecae6');
  switch (pk.kind) {
    case 'tomato': game.ammo = Math.min(game.ammo + 6, 12); break;
    case 'heart':  game.hearts = Math.min(game.hearts + 1, game.maxHearts); break;
    case 'gear':   game.mult = 2; game.multT = 9; break;
    case 'van':    game.vanT = 4.5; game.inv = Math.max(game.inv, 0.3); SND.honk(); break;
  }
}

// ============================================================
// RENDERING
// ============================================================

function draw() {
  ctx.save();
  // screen shake
  if (game.shake > 0.5) ctx.translate(rand(-game.shake, game.shake) * 0.5, rand(-game.shake, game.shake) * 0.5);

  drawSky();
  drawBackdrop();
  drawGround();

  // far lane content, then near lane (painter's order)
  drawLaneContent(0);
  drawLaneContent(1);

  drawParticles();
  drawWeatherFront();

  if (game.flash > 0) {
    ctx.fillStyle = `rgba(255,60,60,${game.flash * 1.2})`;
    ctx.fillRect(0, 0, W, H);
  }

  if (game.state === 'title') drawTitle();
  else drawHUD();

  if (game.cards.length > 0) drawCard();
  if (game.state === 'over') drawGameOver();

  ctx.restore();
}

// ---- sky, aurora, snow ----
let snowflakes = [];
for (let i = 0; i < 70; i++) snowflakes.push({ x: rand(0, W), y: rand(0, H), s: rand(1, 3.2), v: rand(20, 60) });

function drawSky() {
  const g = ctx.createLinearGradient(0, 0, 0, H * 0.62);
  g.addColorStop(0, '#070b1e');
  g.addColorStop(0.55, '#0e1b3a');
  g.addColorStop(1, '#1b2f52');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H * 0.62);

  // stars
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  for (let i = 0; i < 40; i++) {
    const sx = (i * 137.5) % W;
    const sy = (i * 89.7) % (H * 0.4);
    const tw = 0.4 + 0.6 * Math.abs(Math.sin(game.t * 1.5 + i));
    ctx.globalAlpha = tw * 0.8;
    ctx.fillRect(sx, sy, 2, 2);
  }
  ctx.globalAlpha = 1;

  // aurora borealis — IN: ALASKA
  for (let band = 0; band < 3; band++) {
    ctx.beginPath();
    const baseY = 70 + band * 46;
    for (let x = 0; x <= W; x += 12) {
      const y = baseY + Math.sin(x * 0.013 + game.t * (0.7 + band * 0.23) + band * 2) * 26
        + Math.sin(x * 0.03 - game.t * 0.5) * 10;
      if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    for (let x = W; x >= 0; x -= 12) {
      const y = baseY + 54 + Math.sin(x * 0.013 + game.t * (0.7 + band * 0.23) + band * 2) * 26;
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    const hue = 130 + band * 30 + Math.sin(game.t * 0.4) * 20;
    ctx.fillStyle = `hsla(${hue}, 85%, 55%, 0.14)`;
    ctx.fill();
  }

  // moon
  ctx.fillStyle = '#f4f1de';
  ctx.beginPath(); ctx.arc(W - 80, 88, 26, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(11,16,38,0.25)';
  ctx.beginPath(); ctx.arc(W - 90, 82, 22, 0, TAU); ctx.fill();
}

function drawBackdrop() {
  const horizon = H * 0.62;
  // far mountains
  ctx.fillStyle = '#22355e';
  drawRidge(horizon, 120, 0.09, 0.004, 0);
  ctx.fillStyle = '#2c4470';
  drawRidge(horizon, 70, 0.22, 0.007, 100);

  // pine trees strip
  const treeScroll = (game.worldX * 0.45) % 90;
  ctx.fillStyle = '#16263f';
  for (let i = -1; i < 7; i++) {
    const tx = i * 90 - treeScroll + 20;
    drawPine(tx, horizon + 4, 34 + ((i * 37) % 3) * 8);
  }

  // phase set-dressing behind the action
  if (game.state !== 'title') {
    if (game.phase === 1 || game.catRoarT > 0) drawCatMonster();
    if (game.phase === 2) drawTornado();
    if (game.phase === 3) drawArmada();
    if (game.phase >= 4) { drawTornado(true); drawArmada(true); drawCatMonster(true); }
  }
}

function drawRidge(baseY, amp, scrollMult, freq, seed) {
  const off = game.worldX * scrollMult;
  ctx.beginPath();
  ctx.moveTo(0, baseY);
  for (let x = 0; x <= W; x += 16) {
    const wx = x + off;
    const y = baseY - amp * (0.5 + 0.5 * Math.sin(wx * freq + seed) * Math.sin(wx * freq * 2.7 + seed * 2));
    ctx.lineTo(x, y);
  }
  ctx.lineTo(W, baseY);
  ctx.closePath();
  ctx.fill();
  // snow caps hinted
  ctx.save();
  ctx.clip();
  ctx.fillStyle = 'rgba(230,240,255,0.10)';
  ctx.fillRect(0, baseY - amp, W, amp * 0.4);
  ctx.restore();
}

function drawPine(x, baseY, h) {
  ctx.beginPath();
  ctx.moveTo(x, baseY);
  ctx.lineTo(x + 12, baseY - h);
  ctx.lineTo(x + 24, baseY);
  ctx.closePath();
  ctx.fill();
}

function drawGround() {
  const horizon = H * 0.62;
  const g = ctx.createLinearGradient(0, horizon, 0, H);
  g.addColorStop(0, '#b8cde8');
  g.addColorStop(0.5, '#dae7f7');
  g.addColorStop(1, '#eef4fc');
  ctx.fillStyle = g;
  ctx.fillRect(0, horizon, W, H - horizon);

  // two running tracks
  for (const L of LANES) {
    ctx.fillStyle = 'rgba(120,150,190,0.18)';
    roundRect(ctx, -10, L.groundY - 6, W + 20, 30, 8);
    ctx.fill();
    // scrolling track marks
    const seg = 70;
    const off = (game.worldX * 1) % seg;
    ctx.fillStyle = 'rgba(90,120,160,0.25)';
    for (let i = -1; i < 9; i++) {
      ctx.fillRect(i * seg - off, L.groundY + 8, 26, 4);
    }
  }
}

// ---- backdrop monsters ----
function drawCatMonster(small) {
  const s = small ? 0.55 : 1;
  const bounce = Math.sin(game.t * 6) * 6 * s;
  const cx = small ? -30 : -14;
  const cy = H * 0.62 - 10 + bounce;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  // body looming from the left edge
  ctx.fillStyle = '#3a3f52';
  ctx.beginPath(); ctx.ellipse(10, -60, 95, 85, 0, 0, TAU); ctx.fill();
  // ears
  ctx.beginPath();
  ctx.moveTo(-40, -128); ctx.lineTo(-18, -180); ctx.lineTo(8, -132); ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(38, -132); ctx.lineTo(66, -178); ctx.lineTo(84, -122); ctx.closePath(); ctx.fill();
  // eyes glow
  const blink = Math.abs(Math.sin(game.t * 0.9)) > 0.08 ? 1 : 0.15;
  ctx.fillStyle = `rgba(255,210,60,${blink})`;
  ctx.beginPath(); ctx.ellipse(8, -84, 14, 17 * blink, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(58, -82, 14, 17 * blink, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#111';
  ctx.beginPath(); ctx.ellipse(8, -84, 4, 12 * blink, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(58, -82, 4, 12 * blink, 0, 0, TAU); ctx.fill();
  // whiskers
  ctx.strokeStyle = 'rgba(220,230,255,0.5)'; ctx.lineWidth = 2;
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath(); ctx.moveTo(70, -58 + i * 8); ctx.lineTo(120, -64 + i * 14); ctx.stroke();
  }
  // fangs
  ctx.fillStyle = '#eef4fc';
  ctx.beginPath(); ctx.moveTo(26, -48); ctx.lineTo(34, -28); ctx.lineTo(42, -48); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(50, -48); ctx.lineTo(58, -28); ctx.lineTo(66, -48); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawTornado(small) {
  const s = small ? 0.5 : 1;
  const baseX = W * 0.68 + Math.sin(game.t * 0.7) * 40 * s;
  const baseY = H * 0.62;
  const hgt = 300 * s;
  ctx.save();
  ctx.globalAlpha = small ? 0.5 : 0.75;
  for (let i = 0; i < 9; i++) {
    const k = i / 8;
    const y = baseY - k * hgt;
    const wdt = lerp(26, 130, k) * s;
    const wob = Math.sin(game.t * 5 + i * 1.2) * (10 + k * 26);
    ctx.fillStyle = `rgba(160,175,200,${0.5 - k * 0.28})`;
    ctx.beginPath();
    ctx.ellipse(baseX + wob, y, wdt, 15 * s, 0, 0, TAU);
    ctx.fill();
  }
  // debris circling
  ctx.fillStyle = 'rgba(90,70,50,0.7)';
  for (let i = 0; i < 5; i++) {
    const a = game.t * 3 + i * 1.3;
    const k = (Math.sin(a * 0.6 + i) + 1) / 2;
    const y = baseY - k * hgt;
    const r = lerp(30, 120, k) * s;
    ctx.save();
    ctx.translate(baseX + Math.cos(a) * r, y);
    ctx.rotate(a);
    ctx.fillRect(-6, -3, 12, 6);
    ctx.restore();
  }
  ctx.restore();
}

function drawArmada(small) {
  const s = small ? 0.6 : 1;
  for (let i = 0; i < (small ? 1 : 2); i++) {
    const bx = W - 90 - i * 130 * s + Math.sin(game.t * 0.8 + i) * 8;
    const by = 150 + i * 62 + Math.sin(game.t * 1.1 + i * 2) * 7;
    ctx.save();
    ctx.translate(bx, by);
    ctx.scale(s, s);
    // floating galleon silhouette
    ctx.fillStyle = '#5d4037';
    ctx.beginPath();
    ctx.moveTo(-55, 0); ctx.quadraticCurveTo(-40, 26, 0, 26);
    ctx.quadraticCurveTo(48, 26, 60, -4);
    ctx.lineTo(44, 0); ctx.closePath(); ctx.fill();
    // masts + sails
    ctx.fillStyle = '#4e342e';
    ctx.fillRect(-18, -52, 4, 54);
    ctx.fillRect(16, -44, 4, 46);
    ctx.fillStyle = '#f4f1de';
    ctx.beginPath(); ctx.moveTo(-16, -50); ctx.quadraticCurveTo(6, -34, -16, -12); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(18, -42); ctx.quadraticCurveTo(38, -28, 18, -8); ctx.closePath(); ctx.fill();
    // flag
    ctx.fillStyle = '#2e7d32'; ctx.fillRect(-18, -60, 10, 4);
    ctx.fillStyle = '#fff';    ctx.fillRect(-8, -60, 10, 4);
    ctx.fillStyle = '#c62828'; ctx.fillRect(2, -60, 10, 4);
    // tomato cannon
    ctx.fillStyle = '#37474f';
    ctx.save(); ctx.translate(-38, 6); ctx.rotate(-0.5); ctx.fillRect(0, -5, 26, 10); ctx.restore();
    ctx.restore();
  }
}

// ---- lane content ----
function drawLaneContent(lane) {
  const L = LANES[lane];

  // shadows & obstacles
  for (const o of game.obstacles) if (o.lane === lane) drawObstacle(o, L);
  for (const s of game.shots) if (s.lane === lane) drawShot(s, L);
  for (const pk of game.pickups) if (pk.lane === lane) drawPickup(pk, L);
  for (const t of game.tomatoes) if (t.lane === lane) {
    ctx.fillStyle = '#e63946';
    ctx.beginPath(); ctx.arc(t.x, t.y, 8 * L.scale, 0, TAU); ctx.fill();
    ctx.fillStyle = '#2e7d32';
    ctx.fillRect(t.x - 2, t.y - 11 * L.scale, 4, 5);
  }

  // brother (or the van in intro / van powerup)
  const b = game.bros[lane];
  const showVan = game.state === 'intro' || (game.state === 'title') || game.vanT > 0;
  if (game.state === 'intro' || game.state === 'title') {
    if (lane === 1) drawVan(BRO_X, LANES[1].groundY, 1, true);
  } else if (game.vanT > 0) {
    if (lane === 1) drawVan(BRO_X, LANES[1].groundY, 1, true);
  } else {
    const dead = game.state === 'dying' || game.state === 'over';
    drawBrother(b, L, dead);
  }
}

function drawObstacle(o, L) {
  const gy = L.groundY;
  ctx.save();
  switch (o.kind) {
    case 'rock': {
      ctx.fillStyle = 'rgba(40,60,90,0.18)';
      ctx.beginPath(); ctx.ellipse(o.x + o.w / 2, gy + 4, o.w * 0.55, 7, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#5c6b80';
      ctx.beginPath();
      ctx.moveTo(o.x, gy);
      ctx.lineTo(o.x + 8, gy - o.h + 12);
      ctx.lineTo(o.x + o.w * 0.5, gy - o.h);
      ctx.lineTo(o.x + o.w - 6, gy - o.h + 16);
      ctx.lineTo(o.x + o.w, gy);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(235,245,255,0.8)';
      ctx.beginPath();
      ctx.moveTo(o.x + 8, gy - o.h + 12);
      ctx.lineTo(o.x + o.w * 0.5, gy - o.h);
      ctx.lineTo(o.x + o.w - 6, gy - o.h + 16);
      ctx.lineTo(o.x + o.w * 0.5, gy - o.h + 20);
      ctx.closePath(); ctx.fill();
      break;
    }
    case 'spike': {
      ctx.fillStyle = 'rgba(40,60,90,0.18)';
      ctx.beginPath(); ctx.ellipse(o.x + o.w / 2, gy + 4, o.w * 0.5, 6, 0, 0, TAU); ctx.fill();
      const grad = ctx.createLinearGradient(o.x, gy - o.h, o.x, gy);
      grad.addColorStop(0, '#cfe8ff'); grad.addColorStop(1, '#7fb3e0');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(o.x, gy); ctx.lineTo(o.x + o.w * 0.3, gy - o.h);
      ctx.lineTo(o.x + o.w * 0.5, gy - o.h * 0.5); ctx.lineTo(o.x + o.w * 0.72, gy - o.h * 0.85);
      ctx.lineTo(o.x + o.w, gy); ctx.closePath(); ctx.fill();
      break;
    }
    case 'barrel': {
      const cx = o.x + o.w / 2, cy = gy - o.h / 2;
      ctx.fillStyle = 'rgba(40,60,90,0.18)';
      ctx.beginPath(); ctx.ellipse(cx, gy + 4, o.w * 0.5, 6, 0, 0, TAU); ctx.fill();
      ctx.translate(cx, cy); ctx.rotate(-(o.spin || 0));
      ctx.fillStyle = '#8d6e63';
      ctx.beginPath(); ctx.arc(0, 0, o.w / 2, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#5d4037'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(0, 0, o.w / 2 - 4, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-o.w / 2 + 4, 0); ctx.lineTo(o.w / 2 - 4, 0); ctx.stroke();
      break;
    }
    case 'debris': {
      const y = o.fly + (o.wob || 0);
      ctx.translate(o.x + o.w / 2, y);
      ctx.rotate(Math.sin(o.t * 8) * 0.5);
      ctx.fillStyle = '#795548';
      ctx.fillRect(-o.w / 2, -8, o.w, 16);
      ctx.fillStyle = '#a1887f';
      ctx.fillRect(-o.w / 2, -8, o.w, 5);
      // motion streaks
      ctx.strokeStyle = 'rgba(200,215,235,0.5)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(o.w / 2 + 6, -4); ctx.lineTo(o.w / 2 + 30, -6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(o.w / 2 + 6, 4); ctx.lineTo(o.w / 2 + 26, 7); ctx.stroke();
      break;
    }
    case 'fire': {
      const flick = Math.sin(game.t * 20 + o.x) * 4;
      ctx.fillStyle = o.splat ? 'rgba(230,57,70,0.85)' : '#ff7733';
      if (o.splat) {
        ctx.beginPath(); ctx.ellipse(o.x + o.w / 2, gy - 4, o.w / 2, 9, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(180,30,40,0.9)';
        ctx.beginPath(); ctx.ellipse(o.x + o.w / 2 - 8, gy - 6, 10, 5, 0, 0, TAU); ctx.fill();
      } else {
        for (let i = 0; i < 4; i++) {
          const fx = o.x + 8 + i * (o.w - 16) / 3;
          ctx.beginPath();
          ctx.moveTo(fx - 8, gy);
          ctx.quadraticCurveTo(fx, gy - 26 - flick - i * 3, fx + 8, gy);
          ctx.closePath(); ctx.fill();
        }
        ctx.fillStyle = '#ffd166';
        for (let i = 0; i < 3; i++) {
          const fx = o.x + 14 + i * (o.w - 28) / 2;
          ctx.beginPath();
          ctx.moveTo(fx - 4, gy);
          ctx.quadraticCurveTo(fx, gy - 14 - flick, fx + 4, gy);
          ctx.closePath(); ctx.fill();
        }
      }
      break;
    }
    case 'paw': {
      if (o.state === 'warn') {
        // shadow telegraph grows
        const k = 1 - o.warnT / 0.85;
        ctx.fillStyle = `rgba(20,25,40,${0.15 + k * 0.25})`;
        ctx.beginPath(); ctx.ellipse(o.x + o.w / 2, gy, o.w * 0.6 * k + 8, 10 * k + 3, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#ffcf33';
        ctx.font = 'bold 30px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('!', o.x + o.w / 2, gy - 60 - k * 20);
      } else {
        const lift = o.state === 'lift' ? (o.liftT || 0) * 300 : 0;
        const py = gy - o.h + lift * -1;
        // giant grey paw slamming from above
        ctx.fillStyle = '#3a3f52';
        roundRect(ctx, o.x, gy - o.h - 400 - lift, o.w, 400, 6); ctx.fill(); // leg up offscreen
        roundRect(ctx, o.x - 8, gy - o.h - lift, o.w + 16, o.h, 20); ctx.fill();
        // toe beans
        ctx.fillStyle = '#e8a0bf';
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.ellipse(o.x + 12 + i * (o.w - 20) / 2, gy - 16 - lift, 8, 10, 0, 0, TAU);
          ctx.fill();
        }
        ctx.beginPath();
        ctx.ellipse(o.x + o.w / 2, gy - 44 - lift, 16, 13, 0, 0, TAU); ctx.fill();
        // claws
        ctx.fillStyle = '#eef4fc';
        for (let i = 0; i < 3; i++) {
          const cx2 = o.x + 10 + i * (o.w - 18) / 2;
          ctx.beginPath();
          ctx.moveTo(cx2 - 4, gy - 4 - lift); ctx.lineTo(cx2, gy + 6 - lift); ctx.lineTo(cx2 + 4, gy - 4 - lift);
          ctx.closePath(); ctx.fill();
        }
      }
      break;
    }
    case 'meteor': {
      if (o.state === 'warn') {
        const k = 1 - o.warnT / 0.9;
        ctx.fillStyle = `rgba(255,80,40,${0.2 + k * 0.3})`;
        ctx.beginPath(); ctx.ellipse(o.x + 20, gy, 34 * k + 6, 8 * k + 2, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#ff5533';
        ctx.font = 'bold 30px system-ui, sans-serif';
        ctx.textAlign = 'center';
        const bob2 = Math.sin(game.t * 10) * 4;
        ctx.fillText('☄', o.x + 20, gy - 70 + bob2);
      } else if (o.state === 'fall') {
        // flaming rock
        ctx.save();
        ctx.translate(o.fx, o.fy);
        ctx.rotate(game.t * 4);
        ctx.fillStyle = '#6d4c41';
        ctx.beginPath(); ctx.arc(0, 0, 20, 0, TAU); ctx.fill();
        ctx.fillStyle = '#4e342e';
        ctx.beginPath(); ctx.arc(-6, -4, 6, 0, TAU); ctx.fill();
        ctx.restore();
        // fire trail
        for (let i = 1; i <= 4; i++) {
          ctx.fillStyle = `rgba(255,${140 - i * 20},40,${0.6 - i * 0.13})`;
          ctx.beginPath();
          ctx.arc(o.fx + i * 14, o.fy - i * 16, 18 - i * 3, 0, TAU);
          ctx.fill();
        }
      }
      break;
    }
  }
  ctx.restore();
}

function drawShot(s, L) {
  // target marker
  const k = s.t / s.dur;
  ctx.fillStyle = `rgba(230,57,70,${0.25 + k * 0.4})`;
  ctx.beginPath(); ctx.ellipse(s.gx, s.gy, 26 * (0.4 + k * 0.6), 7, 0, 0, TAU); ctx.fill();
  // tomato ball
  ctx.fillStyle = '#e63946';
  ctx.beginPath(); ctx.arc(s.x, s.y, 12 * L.scale, 0, TAU); ctx.fill();
  ctx.fillStyle = '#2e7d32';
  ctx.beginPath(); ctx.arc(s.x, s.y - 10 * L.scale, 4, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath(); ctx.arc(s.x - 4, s.y - 4, 4, 0, TAU); ctx.fill();
}

function drawPickup(pk, L) {
  const y = pk.y + Math.sin(pk.bob) * 8;
  ctx.save();
  ctx.translate(pk.x, y);
  // glow
  ctx.fillStyle = 'rgba(142,202,230,0.18)';
  ctx.beginPath(); ctx.arc(0, 0, 30, 0, TAU); ctx.fill();
  switch (pk.kind) {
    case 'tomato':
      ctx.fillStyle = '#e63946';
      ctx.beginPath(); ctx.arc(0, 2, 15, 0, TAU); ctx.fill();
      ctx.fillStyle = '#2e7d32';
      ctx.beginPath();
      ctx.moveTo(0, -12); ctx.lineTo(-7, -18); ctx.lineTo(-2, -12);
      ctx.lineTo(0, -20) ; ctx.lineTo(2, -12); ctx.lineTo(7, -18);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.beginPath(); ctx.arc(-5, -3, 4, 0, TAU); ctx.fill();
      break;
    case 'heart':
      ctx.fillStyle = '#ff4d6d';
      ctx.beginPath();
      ctx.moveTo(0, 14);
      ctx.bezierCurveTo(-20, -2, -12, -18, 0, -8);
      ctx.bezierCurveTo(12, -18, 20, -2, 0, 14);
      ctx.fill();
      break;
    case 'gear':
      ctx.fillStyle = '#ffcf33';
      ctx.font = 'bold 15px system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.strokeStyle = '#ffcf33'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, 16, 0, TAU); ctx.stroke();
      ctx.fillText('x2', 0, 1);
      break;
    case 'van':
      drawVan(0, 14, 0.42, false);
      break;
  }
  ctx.restore();
}

// ---- the van ----
function drawVan(x, groundY, s, wheels) {
  ctx.save();
  ctx.translate(x, groundY);
  ctx.scale(s, s);
  const bounce = wheels ? Math.sin(game.t * 18) * 2 : 0;
  ctx.translate(0, bounce);
  // shadow
  ctx.fillStyle = 'rgba(40,60,90,0.2)';
  ctx.beginPath(); ctx.ellipse(10, 2 - bounce, 78, 10, 0, 0, TAU); ctx.fill();
  // body
  ctx.fillStyle = '#b56742';
  roundRect(ctx, -64, -78, 148, 62, 10); ctx.fill();
  ctx.fillStyle = '#8d4a2e';
  roundRect(ctx, -64, -34, 148, 18, 6); ctx.fill();
  // windshield + window
  ctx.fillStyle = '#9fd0e8';
  roundRect(ctx, 42, -72, 36, 26, 5); ctx.fill();
  roundRect(ctx, -48, -72, 34, 26, 5); ctx.fill();
  // the two brothers inside
  drawHead(-31, -62, 0, 0.9);
  drawHead(60, -62, 1, 0.9);
  // stripe
  ctx.fillStyle = '#ffcf33';
  ctx.fillRect(-64, -50, 148, 7);
  // wheels
  ctx.fillStyle = '#20242e';
  ctx.beginPath(); ctx.arc(-36, -8, 15, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(52, -8, 15, 0, TAU); ctx.fill();
  ctx.fillStyle = '#aab4c4';
  const spin = wheels ? game.worldX * 0.05 : 0;
  for (const wx of [-36, 52]) {
    ctx.save(); ctx.translate(wx, -8); ctx.rotate(spin);
    ctx.fillRect(-10, -2, 20, 4); ctx.fillRect(-2, -10, 4, 20);
    ctx.restore();
  }
  // headlight beam
  if (wheels) {
    ctx.fillStyle = 'rgba(255,240,180,0.18)';
    ctx.beginPath();
    ctx.moveTo(84, -46); ctx.lineTo(150, -60); ctx.lineTo(150, -26); ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

// ---- brothers ----
// bro 0: red beanie + beard + orange jacket. bro 1: green cap + blue hoodie.
function drawHead(x, y, which, s) {
  ctx.save();
  ctx.translate(x, y); ctx.scale(s, s);
  ctx.fillStyle = '#eab892';
  ctx.beginPath(); ctx.arc(0, 0, 11, 0, TAU); ctx.fill();
  if (which === 0) {
    ctx.fillStyle = '#c1272d';
    ctx.beginPath(); ctx.arc(0, -4, 11, Math.PI, 0); ctx.fill();
    ctx.fillRect(-11, -6, 22, 4);
    ctx.fillStyle = '#6d4c41'; // beard
    ctx.beginPath(); ctx.arc(1, 6, 8, 0, Math.PI); ctx.fill();
  } else {
    ctx.fillStyle = '#2e7d32';
    ctx.beginPath(); ctx.arc(0, -4, 11, Math.PI, 0); ctx.fill();
    ctx.fillRect(-16, -6, 16, 4); // backwards brim
  }
  ctx.fillStyle = '#222';
  ctx.fillRect(4, -2, 3, 3); // eye
  ctx.restore();
}

function drawBrother(b, L, dead) {
  const s = L.scale;
  const gy = L.groundY;
  const x = BRO_X, y = gy + b.y;
  ctx.save();

  // shadow
  const airK = clamp(1 + b.y / 160, 0.4, 1);
  ctx.fillStyle = `rgba(40,60,90,${0.22 * airK})`;
  ctx.beginPath(); ctx.ellipse(x, gy + 3, 22 * airK * s, 6 * airK * s, 0, 0, TAU); ctx.fill();

  ctx.translate(x, y);
  ctx.scale(s, s);

  if (dead) {
    // face-down in the snow
    ctx.rotate(Math.PI / 2);
    ctx.translate(-20, 10);
  }

  // hit flash
  if (b.hitT > 0 && Math.sin(game.t * 40) > 0) ctx.globalAlpha = 0.35;
  if (game.inv > 0 && game.state === 'play' && Math.sin(game.t * 30) > 0.3) ctx.globalAlpha = 0.55;

  const run = b.animT * 11;
  const legA = b.grounded ? Math.sin(run) * 0.9 : 0.5;
  const legB = b.grounded ? Math.sin(run + Math.PI) * 0.9 : -0.7;
  const armA = Math.sin(run + Math.PI) * 0.7;
  const bodBob = b.grounded ? Math.abs(Math.sin(run)) * 3 : 0;
  const jacket = b.lane === 0 ? '#e07020' : '#2a6db5';
  const pants = b.lane === 0 ? '#4a3f35' : '#33425e';

  // legs
  ctx.strokeStyle = pants; ctx.lineWidth = 9; ctx.lineCap = 'round';
  for (const la of [legA, legB]) {
    ctx.beginPath();
    ctx.moveTo(0, -26 - bodBob);
    const kx = Math.sin(la) * 14, ky = -26 + Math.cos(la) * 0 + 12;
    ctx.lineTo(kx, ky - bodBob * 0.5);
    ctx.lineTo(kx + Math.sin(la + 0.6) * 10, -2);
    ctx.stroke();
    // boot
    ctx.fillStyle = '#20242e';
    ctx.beginPath(); ctx.arc(kx + Math.sin(la + 0.6) * 10 + 3, -3, 5, 0, TAU); ctx.fill();
  }

  // torso
  ctx.fillStyle = jacket;
  roundRect(ctx, -12, -56 - bodBob, 24, 34, 8); ctx.fill();
  // zipper
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, -54 - bodBob); ctx.lineTo(0, -26 - bodBob); ctx.stroke();

  // back arm
  ctx.strokeStyle = jacket; ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(-2, -48 - bodBob);
  ctx.lineTo(-2 + Math.sin(armA) * 13, -36 - bodBob + Math.abs(Math.cos(armA)) * 6);
  ctx.stroke();

  // head
  drawHead(2, -66 - bodBob, b.lane, 1);

  // front arm (throws tomatoes)
  const throwing = game.throwCD[b.lane] > 0.2;
  ctx.strokeStyle = jacket; ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(2, -48 - bodBob);
  if (throwing) ctx.lineTo(16, -56 - bodBob);
  else ctx.lineTo(2 + Math.sin(armA + Math.PI) * 13, -36 - bodBob + Math.abs(Math.cos(armA + Math.PI)) * 6);
  ctx.stroke();
  // mitten
  ctx.fillStyle = '#c1272d';
  if (throwing) { ctx.beginPath(); ctx.arc(17, -57 - bodBob, 5, 0, TAU); ctx.fill(); }

  // scarf trailing in the wind
  ctx.strokeStyle = b.lane === 0 ? '#ffcf33' : '#ff4d6d';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(-4, -58 - bodBob);
  ctx.quadraticCurveTo(-18, -56 - bodBob + Math.sin(game.t * 12) * 3, -30, -52 - bodBob + Math.sin(game.t * 12 + 1) * 5);
  ctx.stroke();

  ctx.restore();
}

// ---- particles / weather ----
function drawParticles() {
  for (const p of game.particles) {
    ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawWeatherFront() {
  // falling snow — heavier sideways during the tornado
  const windX = game.phase === 2 ? -260 : -60;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  for (const f of snowflakes) {
    f.y += (f.v + game.speed * 0.03) * 0.016;
    f.x += windX * 0.016 * (f.s / 2);
    if (f.y > H) { f.y = -8; f.x = rand(0, W); }
    if (f.x < -10) f.x = W + 8;
    ctx.globalAlpha = 0.4 + f.s * 0.15;
    ctx.beginPath(); ctx.arc(f.x, f.y, f.s, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ---- HUD ----
function drawHUD() {
  ctx.textBaseline = 'alphabetic';
  // hearts
  for (let i = 0; i < game.maxHearts; i++) {
    const hx = 22 + i * 30, hy = 34;
    ctx.save();
    ctx.translate(hx, hy);
    ctx.scale(0.85, 0.85);
    ctx.fillStyle = i < game.hearts ? '#ff4d6d' : 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.moveTo(0, 10);
    ctx.bezierCurveTo(-15, -2, -9, -14, 0, -6);
    ctx.bezierCurveTo(9, -14, 15, -2, 0, 10);
    ctx.fill();
    ctx.restore();
  }
  // distance
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 30px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(currentMeters() + 'm', W / 2, 44);
  ctx.font = '600 13px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  const pname = PHASES[clamp(game.phase, 0, PHASES.length - 1)];
  ctx.fillText((game.loop > 0 ? 'LOOP ' + (game.loop + 1) + ' — ' : '') + (pname ? pname.name : ''), W / 2, 63);

  // sound toggle
  ctx.font = '20px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillText(SND.muted ? '🔇' : '🔊', W - 18, 38);

  // score
  ctx.textAlign = 'left';
  ctx.font = 'bold 16px system-ui, sans-serif';
  ctx.fillStyle = '#ffcf33';
  ctx.fillText(Math.floor(game.score) + ' pts' + (game.mult > 1 ? '  x2!' : ''), 20, 62);

  // gear indicator
  if (game.gear >= 12) {
    ctx.fillStyle = '#ff7733';
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.fillText('⚙ 12TH GEAR', 20, 82);
  }

  // tomato ammo
  if (game.ammo > 0) {
    ctx.fillStyle = '#e63946';
    ctx.beginPath(); ctx.arc(28, H - 32, 10, 0, TAU); ctx.fill();
    ctx.fillStyle = '#2e7d32'; ctx.fillRect(26, H - 45, 4, 6);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.fillText('x' + game.ammo, 44, H - 26);
  }

  // van timer
  if (game.vanT > 0) {
    ctx.fillStyle = '#ffcf33';
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🚐 ' + game.vanT.toFixed(1) + 's', W / 2, 84);
  }

  // lane hints (first 15s)
  if (game.t < 14 && game.state === 'play') {
    ctx.globalAlpha = clamp(1 - (game.t - 10) / 4, 0, 0.85);
    ctx.fillStyle = '#fff';
    ctx.font = '600 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('← LEFT thumb: top brother', W * 0.27, H - 66);
    ctx.fillText('RIGHT thumb: bottom brother →', W * 0.72, H - 44);
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.fillText('tap = jump · tap again = double jump', W / 2, H - 20);
    ctx.globalAlpha = 1;
  }
}

// ---- cinematic cards ----
function drawCard() {
  const c = game.cards[0];
  const k = game.cardT / c.dur;
  const inK = clamp(k / 0.15, 0, 1);
  const outK = clamp((1 - k) / 0.15, 0, 1);
  const a = Math.min(inK, outK);

  // letterbox
  ctx.fillStyle = `rgba(0,0,0,${0.75 * a})`;
  ctx.fillRect(0, 0, W, 120 * a);
  ctx.fillRect(0, H - 120 * a, W, 120 * a);
  ctx.fillStyle = `rgba(5,7,15,${0.45 * a})`;
  ctx.fillRect(0, 0, W, H);

  const zoom = 1 + k * 0.04;
  ctx.save();
  ctx.translate(W / 2, H / 2 - 40);
  ctx.scale(zoom, zoom);
  ctx.globalAlpha = a;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f4f1de';
  ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 14;
  ctx.font = `900 ${c.big ? 34 : 27}px Impact, 'Arial Black', system-ui, sans-serif`;
  ctx.fillText(c.line1, 0, c.line2 ? -14 : 6);
  if (c.line2) ctx.fillText(c.line2, 0, 30);
  ctx.restore();
  ctx.globalAlpha = 1;
}

// ---- title ----
function drawTitle() {
  ctx.fillStyle = 'rgba(5,7,15,0.35)';
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = 'center';
  // little epigraph
  ctx.fillStyle = 'rgba(244,241,222,0.75)';
  ctx.font = 'italic 600 16px Georgia, serif';
  ctx.fillText('Two brothers...', W / 2, 200);
  ctx.fillText('...in a van.', W / 2, 226);

  // big title
  const wob = Math.sin(game.t * 2) * 3;
  ctx.save();
  ctx.translate(W / 2, 320 + wob);
  ctx.rotate(-0.02);
  ctx.fillStyle = '#ffcf33';
  ctx.shadowColor = '#c1272d'; ctx.shadowOffsetX = 4; ctx.shadowOffsetY = 5; ctx.shadowBlur = 0;
  ctx.font = "900 64px Impact, 'Arial Black', system-ui, sans-serif";
  ctx.fillText('TWO', 0, -30);
  ctx.fillText('BROTHERS', 0, 34);
  ctx.restore();

  ctx.fillStyle = 'rgba(244,241,222,0.85)';
  ctx.font = 'italic 600 15px Georgia, serif';
  ctx.fillText("It's just called: Two Brothers.", W / 2, 396);

  // controls diagram
  ctx.font = '600 15px system-ui, sans-serif';
  ctx.fillStyle = '#8ecae6';
  ctx.fillText('LEFT thumb → top brother jumps', W / 2, 470);
  ctx.fillText('RIGHT thumb → bottom brother jumps', W / 2, 494);
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillText('double-tap to double jump · grab 🍅 to fight back', W / 2, 518);

  // tap to start (pulsing)
  const pulse = 0.6 + 0.4 * Math.abs(Math.sin(game.t * 3));
  ctx.globalAlpha = pulse;
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 26px system-ui, sans-serif';
  ctx.fillText('TAP TO START', W / 2, 600);
  ctx.globalAlpha = 1;

  if (game.best > 0) {
    ctx.fillStyle = '#ffcf33';
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.fillText('BEST: ' + Math.floor(game.best) + ' pts', W / 2, 640);
  }

  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText('a fan-made tribute · sound: tap 🔊 top-right or press M', W / 2, H - 24);

  // sound icon
  ctx.font = '20px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillText(SND.muted ? '🔇' : '🔊', W - 18, 38);
}

// ---- game over ----
function drawGameOver() {
  const a = clamp(game.dieT / 0.6, 0, 1);
  ctx.fillStyle = `rgba(5,7,15,${0.7 * a})`;
  ctx.fillRect(0, 0, W, H);

  ctx.globalAlpha = a;
  ctx.textAlign = 'center';

  ctx.fillStyle = 'rgba(244,241,222,0.8)';
  ctx.font = 'italic 600 17px Georgia, serif';
  ctx.fillText('They were handling business...', W / 2, 250);

  ctx.save();
  ctx.translate(W / 2, 350);
  ctx.rotate(-0.02);
  ctx.fillStyle = '#ffcf33';
  ctx.shadowColor = '#c1272d'; ctx.shadowOffsetX = 3; ctx.shadowOffsetY = 4;
  ctx.font = "900 40px Impact, 'Arial Black', system-ui, sans-serif";
  ctx.fillText("IT'S JUST CALLED:", 0, -26);
  ctx.font = "900 52px Impact, 'Arial Black', system-ui, sans-serif";
  ctx.fillText('TWO BROTHERS', 0, 30);
  ctx.restore();

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 26px system-ui, sans-serif';
  ctx.fillText(Math.floor(game.score) + ' pts · ' + currentMeters() + 'm', W / 2, 440);
  ctx.font = '600 16px system-ui, sans-serif';
  ctx.fillStyle = '#8ecae6';
  ctx.fillText(game.splats + ' things splatted', W / 2, 470);

  if (game.score >= game.best && game.best > 0) {
    ctx.fillStyle = '#ffcf33';
    ctx.font = 'bold 18px system-ui, sans-serif';
    ctx.fillText('★ NEW BEST ★', W / 2, 502);
  } else if (game.best > 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '15px system-ui, sans-serif';
    ctx.fillText('best: ' + Math.floor(game.best) + ' pts', W / 2, 502);
  }

  if (game.dieT > 1.2) {
    const pulse = 0.6 + 0.4 * Math.abs(Math.sin(game.t * 3));
    ctx.globalAlpha = a * pulse;
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 24px system-ui, sans-serif';
    ctx.fillText('TAP TO RUN AGAIN', W / 2, 580);
  }
  ctx.globalAlpha = 1;
}

// ---------- Main loop ----------
function loop(now) {
  if (!running) return;
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

resetGame();
requestAnimationFrame(t => { last = t; loop(t); });
