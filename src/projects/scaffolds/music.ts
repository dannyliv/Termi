/**
 * Dance Party scaffold: a WebAudio step sequencer with a dancing character.
 * All sounds are synthesized with oscillators and noise. No audio files, no network.
 */

import type { ScaffoldDef, ThemeConfig } from '../../types.js';

interface MusicExtras {
  beepFreq: number;
  boopFreq: number;
  startBeat: Record<string, number[]>;
  prompts: string[];
}

const robotDance: ThemeConfig = {
  id: 'robot-dance',
  label: 'Robot Dance',
  emoji: '🤖',
  palette: { bg: '#0d1b2a', fg: '#e0fbfc', accent: '#00f5d4' },
  glyphs: { dancer: '🤖', kick: '🥁', clap: '👏', beep: '✨', boop: '🫧' },
  strings: {
    partyName: 'Robot Dance Lab',
    hint: 'Tap the squares to build your beat.',
    dancerName: 'Bolt',
    kickLabel: 'Kick',
    clapLabel: 'Clap',
    beepLabel: 'Beep',
    boopLabel: 'Boop',
    playMsg: 'Bolt is dancing! Keep the beat going.',
    stopMsg: 'Nice beat! Press play to dance again.',
  },
  narrativeIntro: 'Bolt the robot loves to dance. Build a beat and watch those robot moves.',
  nonViolent: true,
  nonCompetitive: true,
};

const glowDisco: ThemeConfig = {
  id: 'glow-disco',
  label: 'Glow Disco',
  emoji: '🪩',
  palette: { bg: '#10002b', fg: '#fdf0ff', accent: '#ff6ec7' },
  glyphs: { dancer: '🕺', kick: '🥁', clap: '👏', beep: '💫', boop: '🫧' },
  strings: {
    partyName: 'Glow Disco',
    hint: 'Tap the squares to light up your beat.',
    dancerName: 'Neon',
    kickLabel: 'Kick',
    clapLabel: 'Clap',
    beepLabel: 'Beep',
    boopLabel: 'Boop',
    playMsg: 'Neon is dancing! The floor is glowing.',
    stopMsg: 'Great song! Press play for more disco.',
  },
  narrativeIntro: 'The disco floor just lit up. Neon is ready to dance to your beat.',
  nonViolent: true,
  nonCompetitive: true,
};

const EXTRAS: Record<string, MusicExtras> = {
  'robot-dance': {
    beepFreq: 880,
    boopFreq: 330,
    startBeat: { kick: [0, 4], clap: [2, 6], beep: [1, 5], boop: [3, 7] },
    prompts: [
      'Make Bolt spin all the way around on the last beat.',
      'Add a new sound row that goes zap.',
      'Let me make the beat go super fast, like 200.',
      'Add a button that makes a surprise beat for me.',
      'Give Bolt a robot dog that dances along.',
    ],
  },
  'glow-disco': {
    beepFreq: 988,
    boopFreq: 262,
    startBeat: { kick: [0, 4], clap: [2, 6], beep: [3, 7], boop: [1, 5] },
    prompts: [
      'Make the floor lights flash with every kick.',
      'Add a sparkly cymbal sound to the grid.',
      'Make Neon do a big jump every eight beats.',
      'Add a slow motion button for silly dancing.',
      'Make the disco ball spin faster when the music plays.',
    ],
  },
};

function extrasFor(id: string): MusicExtras {
  return EXTRAS[id] ?? (EXTRAS['robot-dance'] as MusicExtras);
}

function s(theme: ThemeConfig, key: string): string {
  return theme.strings[key] ?? '';
}

function g(theme: ThemeConfig, key: string): string {
  return theme.glyphs[key] ?? '';
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildHtml(theme: ThemeConfig, prettyName: string): string {
  const name = escapeHtml(prettyName);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${name} ${theme.emoji}</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <main class="party">
    <header>
      <h1>${theme.emoji} ${name}</h1>
      <p class="subtitle">${escapeHtml(s(theme, 'partyName'))}</p>
      <p class="intro">${escapeHtml(theme.narrativeIntro)}</p>
    </header>

    <section id="stage" class="stage">
      <div class="lights"><span></span><span></span><span></span><span></span><span></span></div>
      <div id="dancer" class="dancer idle">${g(theme, 'dancer')}</div>
      <p class="dancer-name">${escapeHtml(s(theme, 'dancerName'))}</p>
    </section>

    <section class="controls">
      <button id="play" class="play-button">&#9654;&#65039; Play</button>
      <label class="tempo-row">
        🐢
        <input id="tempo" type="range" min="70" max="180" value="110">
        🐇
        <span id="tempo-label">110 BPM</span>
      </label>
    </section>

    <section id="grid" class="grid" aria-label="Beat grid"></section>

    <p id="message" class="message">${escapeHtml(s(theme, 'hint'))}</p>
  </main>
  <script src="game.js"></script>
</body>
</html>
`;
}

function buildCss(theme: ThemeConfig): string {
  return `:root {
  --bg: ${theme.palette.bg};
  --fg: ${theme.palette.fg};
  --accent: ${theme.palette.accent};
}

* { box-sizing: border-box; }

body {
  margin: 0;
  min-height: 100vh;
  background: var(--bg);
  color: var(--fg);
  font-family: "Avenir Next", "Trebuchet MS", Verdana, sans-serif;
}

.party {
  width: min(680px, 94vw);
  margin: 0 auto;
  padding: 18px 0 40px;
  text-align: center;
}

header h1 { margin: 8px 0 2px; font-size: 2rem; }
.subtitle { margin: 0; color: var(--accent); font-weight: bold; }
.intro { margin: 6px 0 14px; opacity: 0.85; }

.stage {
  background: rgba(255, 255, 255, 0.05);
  border: 3px solid var(--accent);
  border-radius: 18px;
  padding: 14px 10px 6px;
  margin-bottom: 16px;
  transition: box-shadow 0.1s ease;
}

.stage.boom { box-shadow: 0 0 40px var(--accent); }

.lights {
  display: flex;
  gap: 14px;
  justify-content: center;
  margin-bottom: 6px;
}

.lights span {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--accent);
  opacity: 0.25;
}

body.partying .lights span { animation: blink 0.5s infinite alternate; }
body.partying .lights span:nth-child(2n) { animation-delay: 0.25s; }

@keyframes blink {
  from { opacity: 0.2; transform: scale(0.8); }
  to { opacity: 1; transform: scale(1.25); }
}

.dancer {
  display: inline-block;
  font-size: 96px;
  line-height: 1.1;
  transition: transform 0.1s ease;
}

.dancer.idle { transform: none; }
.dancer.pose0 { transform: rotate(-12deg) translateY(-10px); }
.dancer.pose1 { transform: rotate(10deg) scale(1.08); }
.dancer.pose2 { transform: rotate(-8deg) scale(0.95) translateY(4px); }
.dancer.pose3 { transform: rotate(14deg) translateY(-14px); }

.dancer-name { margin: 4px 0 8px; font-weight: bold; color: var(--accent); }

.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  justify-content: center;
  align-items: center;
  margin-bottom: 16px;
}

.play-button {
  font: inherit;
  font-size: 1.2rem;
  font-weight: bold;
  color: var(--bg);
  background: var(--accent);
  border: none;
  border-radius: 999px;
  padding: 12px 28px;
  cursor: pointer;
}

.play-button:hover { transform: scale(1.05); }

.tempo-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 1.1rem;
}

#tempo { accent-color: var(--accent); width: 160px; }

.grid {
  display: grid;
  grid-template-columns: minmax(76px, auto) repeat(8, 1fr);
  gap: 6px;
  align-items: center;
}

.row-label {
  text-align: right;
  padding-right: 8px;
  font-weight: bold;
  white-space: nowrap;
}

.step {
  aspect-ratio: 1 / 1;
  border: 2px solid rgba(255, 255, 255, 0.25);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.06);
  cursor: pointer;
  padding: 0;
}

.step.downbeat { border-color: rgba(255, 255, 255, 0.45); }
.step:hover { background: rgba(255, 255, 255, 0.18); }
.step.on { background: var(--accent); border-color: var(--accent); }
.step.now { outline: 3px solid var(--fg); transform: scale(1.08); }

.message {
  min-height: 1.4em;
  margin-top: 14px;
  color: var(--accent);
  font-weight: bold;
}
`;
}

function buildJs(theme: ThemeConfig): string {
  const extra = extrasFor(theme.id);
  const themeData = {
    id: theme.id,
    partyName: s(theme, 'partyName'),
    hint: s(theme, 'hint'),
    dancer: g(theme, 'dancer'),
    dancerName: s(theme, 'dancerName'),
    rows: [
      { id: 'kick', label: s(theme, 'kickLabel'), emoji: g(theme, 'kick') },
      { id: 'clap', label: s(theme, 'clapLabel'), emoji: g(theme, 'clap') },
      { id: 'beep', label: s(theme, 'beepLabel'), emoji: g(theme, 'beep') },
      { id: 'boop', label: s(theme, 'boopLabel'), emoji: g(theme, 'boop') },
    ],
    sound: { beep: extra.beepFreq, boop: extra.boopFreq },
    startBeat: extra.startBeat,
    messages: { play: s(theme, 'playMsg'), stop: s(theme, 'stopMsg') },
  };
  return `// ====================================================
// THEME SETTINGS
// These values set the dancer, sounds, and words.
// Change one, save the file, and reload the page!
// ====================================================
const THEME = ${JSON.stringify(themeData, null, 2)};

const STEPS = 8;

// ----- find the page pieces -----
const grid = document.getElementById("grid");
const playButton = document.getElementById("play");
const tempoSlider = document.getElementById("tempo");
const tempoLabel = document.getElementById("tempo-label");
const dancer = document.getElementById("dancer");
const stageBox = document.getElementById("stage");
const messageBox = document.getElementById("message");

// ----- music state -----
let audio = null;
let playing = false;
let currentStep = 0;
let nextTime = 0;
let timer = null;
let noiseBuffer = null;
const pattern = {};

// Browsers only allow sound after a click.
// So we create the audio engine when it is first needed.
function getAudio() {
  if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
  return audio;
}

// ----- build the beat grid -----
THEME.rows.forEach((row) => {
  pattern[row.id] = new Array(STEPS).fill(false);
  const label = document.createElement("div");
  label.className = "row-label";
  label.textContent = row.emoji + " " + row.label;
  grid.appendChild(label);
  for (let step = 0; step < STEPS; step++) {
    const b = document.createElement("button");
    b.className = "step" + (step % 4 === 0 ? " downbeat" : "");
    b.dataset.row = row.id;
    b.dataset.step = step;
    b.title = row.label + " on beat " + (step + 1);
    b.addEventListener("click", () => {
      pattern[row.id][step] = !pattern[row.id][step];
      b.classList.toggle("on", pattern[row.id][step]);
    });
    grid.appendChild(b);
  }
});

// Load a starter beat so the first play sounds great.
Object.keys(THEME.startBeat).forEach((rowId) => {
  if (!pattern[rowId]) return;
  THEME.startBeat[rowId].forEach((step) => {
    pattern[rowId][step] = true;
  });
});

document.querySelectorAll(".step").forEach((b) => {
  const on = pattern[b.dataset.row][Number(b.dataset.step)];
  b.classList.toggle("on", on);
});

// ----- the four sounds, made from scratch -----
function makeNoise(ctx) {
  if (noiseBuffer) return noiseBuffer;
  const length = Math.floor(ctx.sampleRate * 0.2);
  noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return noiseBuffer;
}

function playKick(ctx, time) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(150, time);
  osc.frequency.exponentialRampToValueAtTime(45, time + 0.22);
  gain.gain.setValueAtTime(0.9, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.25);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(time);
  osc.stop(time + 0.3);
}

function playClap(ctx, time) {
  const noise = ctx.createBufferSource();
  noise.buffer = makeNoise(ctx);
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 1800;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.7, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.18);
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  noise.start(time);
  noise.stop(time + 0.2);
}

function playBeep(ctx, time) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "square";
  osc.frequency.value = THEME.sound.beep;
  gain.gain.setValueAtTime(0.18, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(time);
  osc.stop(time + 0.15);
}

function playBoop(ctx, time) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(THEME.sound.boop, time);
  osc.frequency.exponentialRampToValueAtTime(THEME.sound.boop * 0.7, time + 0.18);
  gain.gain.setValueAtTime(0.3, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.2);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(time);
  osc.stop(time + 0.22);
}

function playSound(rowId, time) {
  const ctx = getAudio();
  if (rowId === "kick") playKick(ctx, time);
  if (rowId === "clap") playClap(ctx, time);
  if (rowId === "beep") playBeep(ctx, time);
  if (rowId === "boop") playBoop(ctx, time);
}

// ----- the beat clock -----
// We schedule sounds a tiny bit early so they land right on time.
function stepLength() {
  const bpm = Number(tempoSlider.value);
  return 60 / bpm / 2;
}

function tick() {
  const ctx = getAudio();
  while (nextTime < ctx.currentTime + 0.12) {
    scheduleStep(currentStep, nextTime);
    nextTime += stepLength();
    currentStep = (currentStep + 1) % STEPS;
  }
}

function scheduleStep(step, time) {
  THEME.rows.forEach((row) => {
    if (pattern[row.id][step]) playSound(row.id, time);
  });
  const wait = Math.max(0, (time - getAudio().currentTime) * 1000);
  setTimeout(() => {
    if (playing) showStep(step);
  }, wait);
}

// ----- dancing in time -----
function showStep(step) {
  document.querySelectorAll(".step").forEach((b) => {
    b.classList.toggle("now", Number(b.dataset.step) === step);
  });
  dancer.className = "dancer pose" + (step % 4);
  const boomRow = THEME.rows[0];
  const boom = boomRow && pattern[boomRow.id][step];
  stageBox.classList.toggle("boom", Boolean(boom));
}

// ----- play and stop -----
function startParty(ctx) {
  playing = true;
  currentStep = 0;
  nextTime = ctx.currentTime + 0.1;
  timer = setInterval(tick, 25);
  playButton.textContent = "⏹️ Stop";
  document.body.classList.add("partying");
  messageBox.textContent = THEME.messages.play;
}

function stopParty() {
  playing = false;
  clearInterval(timer);
  document.querySelectorAll(".step").forEach((b) => b.classList.remove("now"));
  dancer.className = "dancer idle";
  stageBox.classList.remove("boom");
  document.body.classList.remove("partying");
  playButton.textContent = "▶️ Play";
  messageBox.textContent = THEME.messages.stop;
}

playButton.addEventListener("click", () => {
  const ctx = getAudio();
  // resume() wakes the sound engine after the first click.
  ctx.resume().then(() => {
    if (playing) stopParty();
    else startParty(ctx);
  });
});

tempoSlider.addEventListener("input", () => {
  tempoLabel.textContent = tempoSlider.value + " BPM";
});
`;
}

export const musicScaffold: ScaffoldDef = {
  id: 'music',
  label: 'Dance Party',
  emoji: '🎵',
  ageNote: 'Loud and happy. Build a beat in seconds.',
  themes: [robotDance, glowDisco],
  files(theme: ThemeConfig, prettyName: string): Record<string, string> {
    return {
      'index.html': buildHtml(theme, prettyName),
      'style.css': buildCss(theme),
      'game.js': buildJs(theme),
    };
  },
  starterPrompts(theme: ThemeConfig): string[] {
    return [...extrasFor(theme.id).prompts];
  },
};

export default musicScaffold;
