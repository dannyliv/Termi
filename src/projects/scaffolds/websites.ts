/**
 * My Page: a personal homepage scaffold.
 * SAFETY DESIGN: the kid fills name, about, and favorites with editable
 * fields IN THE PAGE ITSELF (contenteditable saved to localStorage),
 * never through the chat. So personal details never reach the model.
 * The page shows a friendly tip: use a nickname, keep real details secret.
 * Photos are an emoji avatar picker. No uploads, no network.
 */

import type { ScaffoldDef, ThemeConfig } from '../../types.js';

interface PageData {
  avatars: string[];
  favorites: string[];
}

function jsData(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const aboutMeTheme: ThemeConfig = {
  id: 'about-me',
  label: 'About Me',
  emoji: '\u{1F31E}',
  palette: { bg: '#fff8ef', fg: '#2b2540', accent: '#ff8a5c' },
  glyphs: { shield: '\u{1F6E1}\u{FE0F}', spark: '\u{2728}', pin: '\u{1F4CC}' },
  strings: {
    heroPlaceholder: 'Your nickname here',
    taglinePlaceholder: 'Add a fun motto here.',
    aboutHeading: 'About me',
    aboutPlaceholder: 'Write three fun facts about you.',
    favoritesHeading: 'My favorites',
    avatarHeading: 'Pick your avatar',
    freshLabel: 'Start fresh',
    freshConfirm: 'Click again to erase everything',
  },
  narrativeIntro: 'Your own corner of the screen. Fill it with the stuff you love.',
  nonViolent: true,
  nonCompetitive: true,
};

const myTeamTheme: ThemeConfig = {
  id: 'my-team',
  label: 'My Team',
  emoji: '\u{1F3C5}',
  palette: { bg: '#0f2557', fg: '#f4f8ff', accent: '#ffd23f' },
  glyphs: { shield: '\u{1F6E1}\u{FE0F}', spark: '\u{26A1}', pin: '\u{1F4CC}' },
  strings: {
    heroPlaceholder: 'Your team name here',
    taglinePlaceholder: 'Add your team motto here.',
    aboutHeading: 'About our team',
    aboutPlaceholder: 'What makes your team great? Write it here.',
    favoritesHeading: 'Team favorites',
    avatarHeading: 'Pick your mascot',
    freshLabel: 'Start fresh',
    freshConfirm: 'Click again to erase everything',
  },
  narrativeIntro: 'Every great team needs a home page. This one is yours.',
  nonViolent: true,
  nonCompetitive: true,
};

const aboutMeData: PageData = {
  avatars: [
    '\u{1F98A}',
    '\u{1F43C}',
    '\u{1F438}',
    '\u{1F984}',
    '\u{1F419}',
    '\u{1F996}',
    '\u{1F431}',
    '\u{1F436}',
    '\u{1F989}',
    '\u{1F422}',
    '\u{1F427}',
    '\u{1F41D}',
  ],
  favorites: [
    'Favorite game',
    'Favorite food',
    'Favorite animal',
    'Favorite color',
    'Favorite song',
    'Favorite place',
  ],
};

const myTeamData: PageData = {
  avatars: [
    '\u{1F985}',
    '\u{1F43A}',
    '\u{1F981}',
    '\u{1F42F}',
    '\u{1F988}',
    '\u{1F409}',
    '\u{1F43B}',
    '\u{1F40E}',
    '\u{1F994}',
    '\u{1F40D}',
    '\u{1F99C}',
    '\u{1F42C}',
  ],
  favorites: [
    'Our sport or game',
    'Team colors',
    'Best win ever',
    'Team snack',
    'Home field',
    'Our team cheer',
  ],
};

const SAFETY_TIP = 'Use your nickname. Keep your real name, school, and address secret.';

function buildHtml(theme: ThemeConfig, prettyName: string): string {
  const s = theme.strings;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(prettyName)}</title>
  <link rel="icon" href="data:,">
  <link rel="stylesheet" href="style.css">
  <script src="game.js" defer></script>
</head>
<body>
  <main class="frame">
    <p class="safety-tip">${theme.glyphs['shield'] ?? ''} Tip: ${SAFETY_TIP}</p>
    <header class="card hero">
      <div id="avatar">${theme.emoji}</div>
      <h1 id="nickname" contenteditable="true" data-save="nickname" data-placeholder="${s['heroPlaceholder'] ?? ''}"></h1>
      <p id="motto" contenteditable="true" data-save="motto" data-placeholder="${s['taglinePlaceholder'] ?? ''}"></p>
    </header>
    <section class="card">
      <h2>${s['avatarHeading'] ?? 'Pick your avatar'}</h2>
      <div id="avatar-picker"></div>
    </section>
    <section class="card">
      <h2>${s['aboutHeading'] ?? 'About me'}</h2>
      <div id="about" class="about" contenteditable="true" data-save="about" data-placeholder="${s['aboutPlaceholder'] ?? ''}"></div>
    </section>
    <section class="card">
      <h2>${s['favoritesHeading'] ?? 'My favorites'}</h2>
      <div id="favorites"></div>
    </section>
    <footer>
      <span id="save-note"></span>
      <button id="fresh" class="ghost" type="button">${s['freshLabel'] ?? 'Start fresh'}</button>
    </footer>
    <p class="tip">Everything you type saves on this computer only. Nothing goes online.</p>
  </main>
</body>
</html>
`;
}

function buildCss(theme: ThemeConfig): string {
  const p = theme.palette;
  return `/* My Page styles. Colors come from your THEME in game.js. */
* { box-sizing: border-box; }
:root {
  --bg: ${p.bg};
  --fg: ${p.fg};
  --accent: ${p.accent};
}
body {
  margin: 0;
  min-height: 100vh;
  background: var(--bg);
  background-image: radial-gradient(circle at 50% 0%, color-mix(in srgb, var(--accent) 16%, var(--bg)), var(--bg) 65%);
  color: var(--fg);
  font-family: system-ui, "Segoe UI", Roboto, Arial, sans-serif;
  display: flex;
  justify-content: center;
  padding: 28px 16px;
}
.frame { width: min(680px, 100%); }
.safety-tip {
  background: color-mix(in srgb, var(--accent) 22%, var(--bg));
  border: 1px solid color-mix(in srgb, var(--accent) 55%, var(--bg));
  border-radius: 12px;
  padding: 10px 14px;
  font-size: 0.92rem;
  font-weight: 600;
  margin: 0 0 16px;
}
.card {
  background: color-mix(in srgb, var(--fg) 6%, var(--bg));
  border: 1px solid color-mix(in srgb, var(--fg) 14%, var(--bg));
  border-radius: 16px;
  padding: 20px;
  margin-bottom: 16px;
}
.hero { text-align: center; }
#avatar { font-size: 4.5rem; line-height: 1.1; }
#nickname { font-size: 2rem; margin: 8px 0 4px; min-height: 1.2em; }
#motto { margin: 0; opacity: 0.85; min-height: 1.2em; }
h2 { margin: 0 0 12px; font-size: 1.1rem; }
[contenteditable] {
  border-radius: 8px;
  padding: 4px 8px;
  white-space: pre-wrap;
  outline: 2px dashed transparent;
  transition: outline-color 0.15s ease;
}
[contenteditable]:hover { outline-color: color-mix(in srgb, var(--accent) 50%, var(--bg)); }
[contenteditable]:focus { outline-color: var(--accent); }
[contenteditable]:empty::before {
  content: attr(data-placeholder);
  opacity: 0.45;
}
.about { min-height: 4em; line-height: 1.55; }
#avatar-picker {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(52px, 1fr));
  gap: 8px;
}
.avatar-btn {
  font-size: 1.7rem;
  background: color-mix(in srgb, var(--fg) 8%, var(--bg));
  border: 2px solid transparent;
  border-radius: 12px;
  padding: 6px 0;
  cursor: pointer;
  transition: transform 0.12s ease;
}
.avatar-btn:hover { transform: translateY(-2px); }
.avatar-btn.selected { border-color: var(--accent); }
.avatar-btn:focus-visible { outline: 3px solid var(--accent); }
#favorites {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
}
.fav-tile {
  background: color-mix(in srgb, var(--fg) 8%, var(--bg));
  border-radius: 12px;
  padding: 12px;
}
.fav-label {
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  opacity: 0.7;
  margin: 0 0 6px;
}
.fav-value { min-height: 1.4em; font-size: 1.02rem; }
footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
#save-note { color: var(--accent); font-weight: 700; font-size: 0.9rem; }
.ghost {
  background: transparent;
  color: var(--fg);
  border: 1px solid color-mix(in srgb, var(--fg) 35%, var(--bg));
  border-radius: 10px;
  padding: 8px 14px;
  cursor: pointer;
}
.ghost:hover { border-color: var(--accent); color: var(--accent); }
.tip { opacity: 0.65; font-size: 0.85rem; margin-top: 14px; }
`;
}

function buildGameJs(theme: ThemeConfig, data: PageData): string {
  return `// My Page: ${theme.label}. Made with Termi.
//
// HOW YOUR PAGE WORKS:
// 1. Click any dotted box on the page and type. It saves on this computer.
// 2. AVATARS below holds your avatar choices. Add more emoji!
// 3. FAVORITES holds the labels for your favorites grid. Rename them!
// Remember the tip on the page: nickname only, real details stay secret.

const THEME = ${jsData({
    id: theme.id,
    label: theme.label,
    emoji: theme.emoji,
    palette: theme.palette,
    glyphs: theme.glyphs,
    strings: theme.strings,
  })};

// === YOUR PAGE SETUP (edit this part!) ===
const AVATARS = ${jsData(data.avatars)};
const FAVORITES = ${jsData(data.favorites)};
// === END OF YOUR PAGE SETUP ===

// ----- The page engine starts here. Curious? Read on! -----
const avatarEl = document.getElementById("avatar");
const pickerEl = document.getElementById("avatar-picker");
const favoritesEl = document.getElementById("favorites");
const saveNoteEl = document.getElementById("save-note");
const freshBtn = document.getElementById("fresh");

const PREFIX = "termi-mypage-" + THEME.id + ":";
let saveNoteTimer = null;
let freshArmed = false;
let freshTimer = null;

function load(field) {
  try {
    return localStorage.getItem(PREFIX + field) || "";
  } catch (err) {
    return "";
  }
}

function save(field, value) {
  try {
    localStorage.setItem(PREFIX + field, value);
  } catch (err) {
    return;
  }
  flashSaved();
}

function flashSaved() {
  saveNoteEl.textContent = "Saved " + THEME.glyphs.spark;
  clearTimeout(saveNoteTimer);
  saveNoteTimer = setTimeout(function () {
    saveNoteEl.textContent = "";
  }, 1400);
}

function wireEditable(el) {
  const field = el.getAttribute("data-save");
  const saved = load(field);
  if (saved) {
    el.textContent = saved;
  }
  el.addEventListener("input", function () {
    if (el.textContent.trim() === "") {
      el.textContent = "";
    }
    save(field, el.innerText);
  });
}

function buildFavorites() {
  FAVORITES.forEach(function (label, i) {
    const tile = document.createElement("div");
    tile.className = "fav-tile";
    const labelEl = document.createElement("p");
    labelEl.className = "fav-label";
    labelEl.textContent = THEME.glyphs.pin + " " + label;
    const valueEl = document.createElement("div");
    valueEl.className = "fav-value";
    valueEl.contentEditable = "true";
    valueEl.setAttribute("data-save", "fav-" + i);
    valueEl.setAttribute("data-placeholder", "Type it here");
    tile.appendChild(labelEl);
    tile.appendChild(valueEl);
    favoritesEl.appendChild(tile);
  });
}

function markSelected(emoji) {
  const buttons = pickerEl.querySelectorAll("button");
  buttons.forEach(function (b) {
    b.classList.toggle("selected", b.textContent === emoji);
  });
}

function buildPicker() {
  AVATARS.forEach(function (emoji) {
    const btn = document.createElement("button");
    btn.className = "avatar-btn";
    btn.type = "button";
    btn.textContent = emoji;
    btn.addEventListener("click", function () {
      avatarEl.textContent = emoji;
      save("avatar", emoji);
      markSelected(emoji);
    });
    pickerEl.appendChild(btn);
  });
}

function initAvatar() {
  const saved = load("avatar");
  if (saved) {
    avatarEl.textContent = saved;
    markSelected(saved);
  }
}

function startFresh() {
  if (!freshArmed) {
    freshArmed = true;
    freshBtn.textContent = THEME.strings.freshConfirm;
    clearTimeout(freshTimer);
    freshTimer = setTimeout(function () {
      freshArmed = false;
      freshBtn.textContent = THEME.strings.freshLabel;
    }, 3000);
    return;
  }
  try {
    const doomed = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.indexOf(PREFIX) === 0) {
        doomed.push(key);
      }
    }
    doomed.forEach(function (key) {
      localStorage.removeItem(key);
    });
  } catch (err) {
    // Storage is off. Nothing to erase.
  }
  window.location.reload();
}

buildFavorites();
buildPicker();
document.querySelectorAll("[data-save]").forEach(wireEditable);
initAvatar();
freshBtn.addEventListener("click", startFresh);
`;
}

function buildTermiMd(theme: ThemeConfig, prettyName: string, data: PageData): string {
  return [
    `# ${prettyName}`,
    '',
    '## What this is',
    `A personal ${theme.label} homepage. The kid types right on the page, and it saves on this computer only.`,
    '',
    '## Files',
    '- index.html: the page and its editable boxes.',
    '- style.css: the colors and look.',
    '- game.js: the avatar and favorites lists, then the page engine.',
    '',
    '## Built so far',
    `- Starter ${theme.label} page with ${data.favorites.length} favorites tiles and ${data.avatars.length} avatars.`,
    '',
    '## Recap line',
    `We built a ${theme.label} page you can fill in right in the browser.`,
    '',
  ].join('\n');
}

function dataFor(theme: ThemeConfig): PageData {
  return theme.id === 'my-team' ? myTeamData : aboutMeData;
}

export const websitesScaffold: ScaffoldDef = {
  id: 'websites',
  label: 'My Page',
  emoji: '\u{1F310}',
  ageNote: 'Great for ages 9 and up. A page about you, saved only on this computer.',
  themes: [aboutMeTheme, myTeamTheme],
  files(theme: ThemeConfig, prettyName: string): Record<string, string> {
    const data = dataFor(theme);
    return {
      'index.html': buildHtml(theme, prettyName),
      'style.css': buildCss(theme),
      'game.js': buildGameJs(theme, data),
      'TERMI.md': buildTermiMd(theme, prettyName, data),
    };
  },
  starterPrompts(theme: ThemeConfig): string[] {
    if (theme.id === 'my-team') {
      return [
        'Add a player list with five spots I can fill in',
        'Add a win counter that goes up when I click it',
        'Make the team name bounce when the page loads',
        'Add a section for our game schedule',
        'Let me pick from more mascot emojis',
      ];
    }
    return [
      'Add a section for my pets',
      'Make the colors change when I click the title',
      'Add more emoji choices for my avatar',
      'Give the favorites cards a rainbow border',
      'Add a jokes corner with spots for three jokes',
    ];
  },
};

export default websitesScaffold;
