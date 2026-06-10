/**
 * My Pet scaffold: a gentle virtual pet that lives in localStorage.
 * Bars drift over real elapsed time (recomputed from timestamps), the pet
 * grows through three stages, can get sad, and never dies.
 */

import type { ScaffoldDef, ThemeConfig } from '../../types.js';

interface PetsExtras {
  prompts: string[];
}

const dragon: ThemeConfig = {
  id: 'dragon',
  label: 'Dragon',
  emoji: '🐉',
  palette: { bg: '#1a1423', fg: '#fff8f0', accent: '#ff7b54' },
  glyphs: { stage0: '🥚', stage1: '🐲', stage2: '🐉', food: '🍖', toy: '⚽', nap: '💤' },
  strings: {
    defaultName: 'Ember',
    stage0Name: 'Mystery Egg',
    stage1Name: 'Baby Dragon',
    stage2Name: 'Grown Dragon',
    fed: 'NAME munches the snack. Yum!',
    played: 'NAME zooms around the cave. Wheee!',
    slept: 'NAME curls up by the warm rocks.',
    firstFed: 'You warm the egg. It wiggles a little!',
    firstPlayed: 'You roll the egg gently. Tap tap from inside!',
    firstSlept: 'The egg rests in its warm nest.',
    tooSleepy: 'NAME is too sleepy to play. Try a nap first.',
    sad: 'NAME feels a little sad. Some care would help.',
    hatched: 'The egg cracked open! Say hi to NAME!',
    grown: 'Wow! NAME grew up big and strong!',
    welcome: 'This is NAME. It lives in a cozy dragon cave.',
  },
  narrativeIntro: 'A warm egg sits in a cozy cave. It needs a kind keeper. That is you.',
  nonViolent: true,
  nonCompetitive: true,
};

const wildHorses: ThemeConfig = {
  id: 'wild-horses',
  label: 'Wild Horses',
  emoji: '🐎',
  palette: { bg: '#1e2a20', fg: '#fdf8ee', accent: '#d4a373' },
  glyphs: { stage0: '🌾', stage1: '🐴', stage2: '🐎', food: '🍎', toy: '🌼', nap: '💤' },
  strings: {
    defaultName: 'Maple',
    stage0Name: 'Rustling Grass',
    stage1Name: 'Young Foal',
    stage2Name: 'Wild Horse',
    fed: 'NAME crunches the apple. So good!',
    played: 'NAME trots through the flowers. Wheee!',
    slept: 'NAME naps under the big oak tree.',
    firstFed: 'You leave a treat in the grass. Something sniffs it!',
    firstPlayed: 'You hum a soft song. The grass sways back!',
    firstSlept: 'The little shape snoozes in the tall grass.',
    tooSleepy: 'NAME is too sleepy to play. Try a nap first.',
    sad: 'NAME feels a little lonely. Some care would help.',
    hatched: 'A foal steps out of the grass! Say hi to NAME!',
    grown: 'Wow! NAME grew into a strong wild horse!',
    welcome: 'This is NAME. It lives in a wide green meadow.',
  },
  narrativeIntro: 'Something small hides in the tall meadow grass. Be gentle and it will trust you.',
  nonViolent: true,
  nonCompetitive: true,
};

const EXTRAS: Record<string, PetsExtras> = {
  dragon: {
    prompts: [
      'Let my dragon puff a tiny smoke ring when it is happy.',
      'Add a treasure pile my dragon can nap on.',
      'Make my dragon flap around the screen after we play.',
      'Add a bath button with bubbles.',
      "Let me pick my dragon's color when it hatches.",
    ],
  },
  'wild-horses': {
    prompts: [
      "Add a brush button to comb my horse's mane.",
      'Make my horse gallop across the screen after we play.',
      'Add an apple tree that drops a free apple sometimes.',
      'Give my horse a bunny friend who hops around.',
      'Add day and night that slowly changes the meadow.',
    ],
  },
};

function extrasFor(id: string): PetsExtras {
  return EXTRAS[id] ?? (EXTRAS['dragon'] as PetsExtras);
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
  <main class="home">
    <header>
      <h1>${theme.emoji} ${name}</h1>
      <p class="intro">${escapeHtml(theme.narrativeIntro)}</p>
    </header>

    <section id="pet-area" class="pet-area">
      <div id="pet-face" class="pet-face">${g(theme, 'stage0')}</div>
      <p id="stage-name" class="stage-name"></p>
    </section>

    <label class="name-row">
      Pet name:
      <input id="pet-name" maxlength="16" autocomplete="off">
    </label>

    <section class="bars" aria-label="How your pet feels">
      <div class="bar-row">
        <span class="bar-label">🍽️ Tummy</span>
        <div class="bar"><div id="bar-tummy" class="fill"></div></div>
      </div>
      <div class="bar-row">
        <span class="bar-label">💖 Happy</span>
        <div class="bar"><div id="bar-happy" class="fill"></div></div>
      </div>
      <div class="bar-row">
        <span class="bar-label">⚡ Energy</span>
        <div class="bar"><div id="bar-energy" class="fill"></div></div>
      </div>
    </section>

    <section class="actions">
      <button id="feed">${g(theme, 'food')} Feed</button>
      <button id="play">${g(theme, 'toy')} Play</button>
      <button id="nap">${g(theme, 'nap')} Nap</button>
    </section>

    <p id="message" class="message"></p>
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

.home {
  width: min(560px, 94vw);
  margin: 0 auto;
  padding: 18px 0 40px;
  text-align: center;
}

header h1 { margin: 8px 0 2px; font-size: 2rem; }
.intro { margin: 6px 0 14px; opacity: 0.85; }

.pet-area {
  position: relative;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.05);
  border: 3px solid var(--accent);
  border-radius: 18px;
  padding: 24px 10px 10px;
  margin-bottom: 14px;
  min-height: 190px;
}

.pet-face {
  display: inline-block;
  font-size: 100px;
  line-height: 1.1;
  transition: transform 0.2s ease, filter 0.3s ease;
}

.pet-area.sad .pet-face {
  filter: saturate(0.6);
  transform: rotate(-8deg);
}

.pet-area.sad::after {
  content: "💧";
  position: absolute;
  top: 24px;
  right: 22%;
  font-size: 28px;
}

.pet-face.bounce { animation: bounce 0.6s ease; }

@keyframes bounce {
  0% { transform: scale(1); }
  40% { transform: scale(1.15) translateY(-12px); }
  100% { transform: scale(1); }
}

.pet-face.grow-pop { animation: growPop 0.9s ease; }

@keyframes growPop {
  0% { transform: scale(0.6) rotate(-10deg); }
  50% { transform: scale(1.3) rotate(8deg); }
  100% { transform: scale(1); }
}

.stage-name { margin: 8px 0 4px; font-weight: bold; color: var(--accent); }

.float {
  position: absolute;
  bottom: 28%;
  font-size: 26px;
  animation: floatUp 1.4s ease-out forwards;
  pointer-events: none;
}

@keyframes floatUp {
  from { opacity: 1; transform: translateY(0); }
  to { opacity: 0; transform: translateY(-90px); }
}

.name-row {
  display: block;
  margin-bottom: 14px;
  font-weight: bold;
}

#pet-name {
  font: inherit;
  color: var(--fg);
  background: rgba(255, 255, 255, 0.08);
  border: 2px solid var(--accent);
  border-radius: 10px;
  padding: 6px 10px;
  width: 160px;
  text-align: center;
}

.bars { margin-bottom: 14px; }

.bar-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 8px 0;
}

.bar-label { width: 110px; text-align: right; font-weight: bold; }

.bar {
  flex: 1;
  height: 18px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 999px;
  overflow: hidden;
}

.fill {
  height: 100%;
  width: 50%;
  background: var(--accent);
  border-radius: 999px;
  transition: width 0.5s ease;
}

.actions {
  display: flex;
  gap: 10px;
  justify-content: center;
  margin-bottom: 10px;
}

.actions button {
  font: inherit;
  font-size: 1.05rem;
  font-weight: bold;
  color: var(--bg);
  background: var(--accent);
  border: none;
  border-radius: 999px;
  padding: 10px 20px;
  cursor: pointer;
}

.actions button:hover { transform: scale(1.06); }

.message {
  min-height: 1.4em;
  margin-top: 10px;
  color: var(--accent);
  font-weight: bold;
}
`;
}

function buildJs(theme: ThemeConfig): string {
  const themeData = {
    id: theme.id,
    defaultName: s(theme, 'defaultName'),
    stages: [
      { glyph: g(theme, 'stage0'), name: s(theme, 'stage0Name'), at: 0 },
      { glyph: g(theme, 'stage1'), name: s(theme, 'stage1Name'), at: 6 },
      { glyph: g(theme, 'stage2'), name: s(theme, 'stage2Name'), at: 16 },
    ],
    food: g(theme, 'food'),
    toy: g(theme, 'toy'),
    nap: g(theme, 'nap'),
    messages: {
      fed: s(theme, 'fed'),
      played: s(theme, 'played'),
      slept: s(theme, 'slept'),
      firstFed: s(theme, 'firstFed'),
      firstPlayed: s(theme, 'firstPlayed'),
      firstSlept: s(theme, 'firstSlept'),
      tooSleepy: s(theme, 'tooSleepy'),
      sad: s(theme, 'sad'),
      hatched: s(theme, 'hatched'),
      grown: s(theme, 'grown'),
      welcome: s(theme, 'welcome'),
    },
  };
  return `// ====================================================
// THEME SETTINGS
// These values set your pet, its stages, and its words.
// Change one, save the file, and reload the page!
// ====================================================
const THEME = ${JSON.stringify(themeData, null, 2)};

const SAVE_KEY = "termi-pet-" + THEME.id;

// How many points each bar loses per minute of real time.
const RATES = { tummy: 2, happy: 1.5, energy: 1 };

// ----- find the page pieces -----
const petArea = document.getElementById("pet-area");
const petFace = document.getElementById("pet-face");
const stageName = document.getElementById("stage-name");
const nameInput = document.getElementById("pet-name");
const barTummy = document.getElementById("bar-tummy");
const barHappy = document.getElementById("bar-happy");
const barEnergy = document.getElementById("bar-energy");
const messageBox = document.getElementById("message");

// ----- pet state, saved in localStorage -----
function freshPet() {
  return {
    name: THEME.defaultName,
    tummy: 80,
    happy: 80,
    energy: 80,
    care: 0,
    updatedAt: Date.now(),
  };
}

function loadPet() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(SAVE_KEY));
  } catch (err) {
    saved = null;
  }
  if (!saved || typeof saved !== "object") return freshPet();
  const base = freshPet();
  return {
    name: typeof saved.name === "string" && saved.name !== "" ? saved.name : base.name,
    tummy: typeof saved.tummy === "number" ? saved.tummy : base.tummy,
    happy: typeof saved.happy === "number" ? saved.happy : base.happy,
    energy: typeof saved.energy === "number" ? saved.energy : base.energy,
    care: typeof saved.care === "number" ? saved.care : base.care,
    updatedAt: typeof saved.updatedAt === "number" ? saved.updatedAt : Date.now(),
  };
}

function savePet() {
  localStorage.setItem(SAVE_KEY, JSON.stringify(pet));
}

let pet = loadPet();
let wasSad = false;
let tickCount = 0;

function clamp(value) {
  return Math.max(0, Math.min(100, value));
}

// Time passes even while the page is closed.
// We always compute from the saved clock time, so nothing drifts.
function applyTime() {
  const now = Date.now();
  let minutes = (now - pet.updatedAt) / 60000;
  if (minutes < 0) minutes = 0;
  // Long trips away are forgiven. Your pet gets sleepy, never worse.
  if (minutes > 600) minutes = 600;
  pet.tummy = clamp(pet.tummy - RATES.tummy * minutes);
  pet.happy = clamp(pet.happy - RATES.happy * minutes);
  pet.energy = clamp(pet.energy - RATES.energy * minutes);
  pet.updatedAt = now;
}

// ----- growth stages -----
function stageIndex() {
  let index = 0;
  THEME.stages.forEach((stage, i) => {
    if (pet.care >= stage.at) index = i;
  });
  return index;
}

function words(key) {
  return THEME.messages[key].split("NAME").join(pet.name);
}

function stageWords(normalKey, firstKey) {
  return stageIndex() === 0 ? words(firstKey) : words(normalKey);
}

function say(text) {
  messageBox.textContent = text;
}

// ----- little animations -----
function bounce() {
  petFace.classList.remove("bounce");
  void petFace.offsetWidth;
  petFace.classList.add("bounce");
}

function burst(glyph) {
  for (let i = 0; i < 6; i++) {
    const bit = document.createElement("span");
    bit.className = "float";
    bit.textContent = glyph;
    bit.style.left = 25 + Math.random() * 50 + "%";
    bit.style.animationDelay = Math.random() * 0.3 + "s";
    petArea.appendChild(bit);
    setTimeout(() => bit.remove(), 1700);
  }
}

function celebrate(newStage) {
  burst("🎉");
  burst("✨");
  petFace.classList.remove("grow-pop");
  void petFace.offsetWidth;
  petFace.classList.add("grow-pop");
  say(newStage === 1 ? words("hatched") : words("grown"));
}

// ----- drawing the screen -----
function render() {
  const stage = THEME.stages[stageIndex()];
  petFace.textContent = stage.glyph;
  stageName.textContent = stage.name;
  barTummy.style.width = Math.round(pet.tummy) + "%";
  barHappy.style.width = Math.round(pet.happy) + "%";
  barEnergy.style.width = Math.round(pet.energy) + "%";
  const lowest = Math.min(pet.tummy, pet.happy, pet.energy);
  const sadNow = lowest < 25;
  petArea.classList.toggle("sad", sadNow);
  if (sadNow && !wasSad) say(words("sad"));
  wasSad = sadNow;
}

// ----- the three care buttons -----
function doAction(kind) {
  applyTime();
  const before = stageIndex();
  if (kind === "feed") {
    if (pet.tummy < 95) pet.care += 1;
    pet.tummy = clamp(pet.tummy + 30);
    burst(THEME.food);
    bounce();
    say(stageWords("fed", "firstFed"));
  }
  if (kind === "play") {
    if (pet.energy < 10) {
      say(words("tooSleepy"));
      savePet();
      render();
      return;
    }
    if (pet.happy < 95) pet.care += 1;
    pet.happy = clamp(pet.happy + 25);
    pet.energy = clamp(pet.energy - 10);
    burst(THEME.toy);
    bounce();
    say(stageWords("played", "firstPlayed"));
  }
  if (kind === "nap") {
    if (pet.energy < 95) pet.care += 1;
    pet.energy = clamp(pet.energy + 35);
    burst(THEME.nap);
    say(stageWords("slept", "firstSlept"));
  }
  const after = stageIndex();
  if (after > before) celebrate(after);
  savePet();
  render();
}

document.getElementById("feed").addEventListener("click", () => doAction("feed"));
document.getElementById("play").addEventListener("click", () => doAction("play"));
document.getElementById("nap").addEventListener("click", () => doAction("nap"));

// ----- naming your pet -----
nameInput.addEventListener("change", () => {
  const newName = nameInput.value.trim();
  pet.name = newName === "" ? THEME.defaultName : newName;
  nameInput.value = pet.name;
  savePet();
  say("Hello, " + pet.name + "!");
});

// ----- the gentle clock -----
setInterval(() => {
  applyTime();
  render();
  tickCount += 1;
  if (tickCount % 15 === 0) savePet();
}, 1000);

window.addEventListener("pagehide", savePet);

// ----- wake up -----
applyTime();
nameInput.value = pet.name;
render();
say(words("welcome"));
savePet();
`;
}

export const petsScaffold: ScaffoldDef = {
  id: 'pets',
  label: 'My Pet',
  emoji: '🐾',
  ageNote: 'A little friend that needs your care each day.',
  themes: [dragon, wildHorses],
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

export default petsScaffold;
