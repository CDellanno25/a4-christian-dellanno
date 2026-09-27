/* ------------------------------------------------------------------
   Flow Field Theremin
   - Canvas 2D generative particle system driven by a noise flow field
   - Pointer position bends the field and drives a Web Audio synth
   - At least 6 user-controllable parameters exposed via <input type=range>
------------------------------------------------------------------- */

// ---------- Tiny value-noise implementation (no external libs) ----------
const NoiseGen = (() => {
  const perm = new Uint8Array(512);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];

  function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  function lerp(a, b, t) { return a + t * (b - a); }
  function grad(hash, x, y) {
    const h = hash & 7;
    const u = h < 4 ? x : y;
    const v = h < 4 ? y : x;
    return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
  }

  function noise2D(x, y) {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    x -= Math.floor(x);
    y -= Math.floor(y);
    const u = fade(x);
    const v = fade(y);
    const a = perm[X] + Y;
    const b = perm[X + 1] + Y;
    return lerp(
      lerp(grad(perm[a], x, y), grad(perm[b], x - 1, y), u),
      lerp(grad(perm[a + 1], x, y - 1), grad(perm[b + 1], x - 1, y - 1), u),
      v
    );
  }

  return { noise2D };
})();

// ---------- Canvas setup ----------
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
let width, height;

function resize() {
  width = canvas.width = window.innerWidth;
  height = canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// ---------- Parameters (bound to UI) ----------
const params = {
  particleCount: 1500,
  noiseScale: 12,   // higher = finer swirls
  flowSpeed: 1.5,
  trailFade: 8,     // % opacity of the fade-out rectangle each frame
  hue: 190,
  volume: 0.35,
  audioEnabled: true
};

// ---------- Pointer state ----------
const pointer = { x: width / 2, y: height / 2, active: false, down: false };

function updatePointer(e) {
  const rect = canvas.getBoundingClientRect();
  const cx = (e.clientX !== undefined) ? e.clientX : (e.touches && e.touches[0].clientX);
  const cy = (e.clientY !== undefined) ? e.clientY : (e.touches && e.touches[0].clientY);
  if (cx === undefined) return;
  pointer.x = cx - rect.left;
  pointer.y = cy - rect.top;
  pointer.active = true;
}

canvas.addEventListener('pointermove', updatePointer);
canvas.addEventListener('pointerdown', (e) => {
  pointer.down = true;
  updatePointer(e);
  burst(pointer.x, pointer.y, 60);
  pluckNote();
});
window.addEventListener('pointerup', () => (pointer.down = false));
canvas.addEventListener('pointerleave', () => (pointer.active = false));

// ---------- Particle system ----------
let particles = [];

function makeParticle() {
  return {
    x: Math.random() * width,
    y: Math.random() * height,
    vx: 0,
    vy: 0,
    life: Math.random() * 200 + 100
  };
}

function initParticles() {
  particles = [];
  for (let i = 0; i < params.particleCount; i++) particles.push(makeParticle());
}
initParticles();

function burst(x, y, count) {
  for (let i = 0; i < count; i++) {
    if (particles.length >= params.particleCount * 1.3) break;
    particles.push({
      x: x + (Math.random() - 0.5) * 20,
      y: y + (Math.random() - 0.5) * 20,
      vx: (Math.random() - 0.5) * 4,
      vy: (Math.random() - 0.5) * 4,
      life: 120
    });
  }
}

function syncParticleCount() {
  if (particles.length < params.particleCount) {
    while (particles.length < params.particleCount) particles.push(makeParticle());
  } else if (particles.length > params.particleCount) {
    particles.length = params.particleCount;
  }
}

// ---------- Web Audio setup (theremin-style continuous tone + pluck) ----------
let audioCtx = null;
let masterGain = null;
let oscillator = null;
let filterNode = null;
let audioStarted = false;

function initAudio() {
  if (audioStarted) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  masterGain = audioCtx.createGain();
  masterGain.gain.value = params.audioEnabled ? params.volume : 0;
  masterGain.connect(audioCtx.destination);

  filterNode = audioCtx.createBiquadFilter();
  filterNode.type = 'lowpass';
  filterNode.frequency.value = 800;
  filterNode.connect(masterGain);

  oscillator = audioCtx.createOscillator();
  oscillator.type = 'sine';
  oscillator.frequency.value = 220;
  oscillator.connect(filterNode);
  oscillator.start();

  audioStarted = true;
}

function updateAudioFromPointer() {
  if (!audioStarted || !audioCtx) return;
  const now = audioCtx.currentTime;

  // Horizontal -> pitch (pentatonic-ish mapping across 2 octaves)
  const minFreq = 130.81; // C3
  const maxFreq = 987.77; // B5
  const xNorm = Math.min(Math.max(pointer.x / width, 0), 1);
  const targetFreq = minFreq * Math.pow(maxFreq / minFreq, xNorm);
  oscillator.frequency.setTargetAtTime(targetFreq, now, 0.05);

  // Vertical -> filter brightness (inverted: top = bright)
  const yNorm = Math.min(Math.max(pointer.y / height, 0), 1);
  const cutoff = 200 + (1 - yNorm) * 4000;
  filterNode.frequency.setTargetAtTime(cutoff, now, 0.08);

  const targetGain = pointer.active && pointer.down ? params.volume : (pointer.active ? params.volume * 0.35 : 0);
  masterGain.gain.setTargetAtTime(params.audioEnabled ? targetGain : 0, now, 0.06);
}

function pluckNote() {
  if (!audioStarted || !audioCtx || !params.audioEnabled) return;
  const now = audioCtx.currentTime;
  const pluck = audioCtx.createOscillator();
  const pluckGain = audioCtx.createGain();
  pluck.type = 'triangle';
  const xNorm = Math.min(Math.max(pointer.x / width, 0), 1);
  pluck.frequency.value = 130.81 * Math.pow(8, xNorm);
  pluckGain.gain.value = 0;
  pluck.connect(pluckGain);
  pluckGain.connect(masterGain);
  pluck.start(now);
  pluckGain.gain.setValueAtTime(0, now);
  pluckGain.gain.linearRampToValueAtTime(params.volume * 1.2, now + 0.01);
  pluckGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
  pluck.stop(now + 0.55);
}

// ---------- Animation loop ----------
function step(px, py, t) {
  const n = NoiseGen.noise2D(px / (400 / params.noiseScale), py / (400 / params.noiseScale) + t * 0.0003);
  return n * Math.PI * 4; // angle
}

let frame = 0;
function animate() {
  frame++;

  // Fade previous frame for trailing effect
  ctx.fillStyle = `rgba(5, 5, 10, ${params.trailFade / 100})`;
  ctx.fillRect(0, 0, width, height);

  const hue = params.hue;

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    const angle = step(p.x, p.y, frame);

    // Pointer influence: gently curls the field near the cursor
    if (pointer.active) {
      const dx = p.x - pointer.x;
      const dy = p.y - pointer.y;
      const dist = Math.sqrt(dx * dx + dy * dy) + 0.001;
      if (dist < 220) {
        const pull = (220 - dist) / 220;
        const swirl = Math.atan2(dy, dx) + Math.PI / 2;
        p.vx += Math.cos(swirl) * pull * 0.6;
        p.vy += Math.sin(swirl) * pull * 0.6;
      }
    }

    p.vx += Math.cos(angle) * 0.12;
    p.vy += Math.sin(angle) * 0.12;
    p.vx *= 0.92;
    p.vy *= 0.92;

    const speed = params.flowSpeed;
    p.x += p.vx * speed;
    p.y += p.vy * speed;
    p.life--;

    if (p.x < 0) p.x = width;
    if (p.x > width) p.x = 0;
    if (p.y < 0) p.y = height;
    if (p.y > height) p.y = 0;
    if (p.life <= 0) {
      p.x = Math.random() * width;
      p.y = Math.random() * height;
      p.vx = 0;
      p.vy = 0;
      p.life = Math.random() * 200 + 100;
    }

    const speedMag = Math.min(Math.hypot(p.vx, p.vy) * 40, 1);
    ctx.fillStyle = `hsla(${(hue + speedMag * 60) % 360}, 90%, ${55 + speedMag * 20}%, 0.85)`;
    ctx.fillRect(p.x, p.y, 1.6, 1.6);
  }

  // trim excess burst particles back toward target count smoothly
  if (particles.length > params.particleCount) {
    particles.splice(params.particleCount, Math.min(5, particles.length - params.particleCount));
  }

  updateAudioFromPointer();
  requestAnimationFrame(animate);
}
animate();

// ---------- UI wiring ----------
const el = (id) => document.getElementById(id);

function bindRange(id, valId, onChange, format = (v) => v) {
  const input = el(id);
  const label = el(valId);
  const update = () => {
    const v = parseFloat(input.value);
    label.textContent = format(v);
    onChange(v);
  };
  input.addEventListener('input', update);
  update();
}

bindRange('particleCount', 'particleCountVal', (v) => {
  params.particleCount = v;
  syncParticleCount();
});

bindRange('noiseScale', 'noiseScaleVal', (v) => (params.noiseScale = v));

bindRange('flowSpeed', 'flowSpeedVal', (v) => (params.flowSpeed = v), (v) => v.toFixed(1));

bindRange('trailFade', 'trailFadeVal', (v) => (params.trailFade = v));

bindRange('hue', 'hueVal', (v) => (params.hue = v), (v) => `${v}°`);

bindRange('volume', 'volumeVal', (v) => {
  params.volume = v / 100;
}, (v) => `${v}%`);

el('audioToggle').addEventListener('change', (e) => {
  params.audioEnabled = e.target.checked;
});

el('resetBtn').addEventListener('click', initParticles);

el('helpBtn').addEventListener('click', () => {
  el('instructions').classList.remove('hidden');
});

el('startBtn').addEventListener('click', () => {
  initAudio();
  el('instructions').classList.add('hidden');
  el('controls').classList.remove('hidden');
});
