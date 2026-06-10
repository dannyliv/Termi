/**
 * Talking Character: a scripted-dialog character builder.
 * NO AI at runtime and no network. The kid edits CHARACTER and DIALOG
 * at the top of game.js. A chat-style UI matches typed words against
 * keywords (case-insensitive). Unknown words rotate through fallbacks.
 * Framing: a game character you BUILD, never a friend with feelings.
 */

import type { ScaffoldDef, ThemeConfig } from '../../types.js';

interface DialogEntry {
  keywords: string[];
  reply: string;
  mood?: string;
}

interface CharacterSpec {
  name: string;
  role: string;
  greeting: string;
  catchphrases: string[];
  moods: Record<string, string>;
}

interface CharacterData {
  character: CharacterSpec;
  dialog: DialogEntry[];
  fallbacks: string[];
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

const quizHostTheme: ThemeConfig = {
  id: 'quiz-host',
  label: 'Quiz Host',
  emoji: '\u{1F3A4}',
  palette: { bg: '#2a1158', fg: '#fff7fb', accent: '#ffd23f' },
  glyphs: { spark: '\u{2728}', mic: '\u{1F3A4}' },
  strings: {
    tagline: 'A game show host that runs on your script.',
    chip1: 'hello',
    chip2: 'quiz',
    chip3: 'joke',
    inputPlaceholder: 'Type a message to your host',
    sendLabel: 'Send',
  },
  narrativeIntro: 'Lights on! You are building a game show host. You write every line it says.',
  nonViolent: true,
  nonCompetitive: true,
};

const robotTheme: ThemeConfig = {
  id: 'sidekick-robot',
  label: 'Sidekick Robot',
  emoji: '\u{1F916}',
  palette: { bg: '#101a2e', fg: '#eaf6ff', accent: '#59d2fe' },
  glyphs: { spark: '\u{26A1}', mic: '\u{1F50B}' },
  strings: {
    tagline: 'A robot sidekick that runs on your script.',
    chip1: 'hello',
    chip2: 'mission',
    chip3: 'dance',
    inputPlaceholder: 'Type a message to your robot',
    sendLabel: 'Send',
  },
  narrativeIntro: 'Beep! You are building a robot sidekick. You write every line it says.',
  nonViolent: true,
  nonCompetitive: true,
};

const quizHostData: CharacterData = {
  character: {
    name: 'Quizmo',
    role: 'game show host',
    greeting: 'Welcome to the show! I am Quizmo, your quiz host. Type hello, quiz, or joke to start!',
    catchphrases: ['No way to lose on this show!', 'Ding ding ding!', 'That answer sparkles!'],
    moods: {
      happy: '\u{1F604}',
      excited: '\u{1F929}',
      thinking: '\u{1F914}',
      silly: '\u{1F61C}',
    },
  },
  dialog: [
    {
      keywords: ['hello', 'hi', 'hey', 'howdy'],
      reply: 'Hello, superstar! Welcome to the brightest show on this computer!',
      mood: 'happy',
    },
    {
      keywords: ['quiz', 'question', 'trivia'],
      reply: 'Lightning round! Which animal has three hearts? Type octopus if you know it!',
      mood: 'excited',
    },
    {
      keywords: ['octopus'],
      reply: 'Ding ding ding! Correct! An octopus has three hearts. Take a bow!',
      mood: 'excited',
    },
    {
      keywords: ['joke', 'funny'],
      reply: 'Why did the math book look sad? It had too many problems!',
      mood: 'silly',
    },
    {
      keywords: ['name', 'who are you'],
      reply: 'I am Quizmo! Part host, part confetti cannon, all questions.',
      mood: 'happy',
    },
    {
      keywords: ['how are you'],
      reply: 'Feeling shiny! A host is only as good as the next question.',
      mood: 'happy',
    },
    {
      keywords: ['prize', 'win'],
      reply: 'Tonight, the grand prize is bragging rights and a drum roll. Drrrrum!',
      mood: 'excited',
    },
    {
      keywords: ['score', 'points'],
      reply: 'The scoreboard says: you have one million style points.',
      mood: 'silly',
    },
    {
      keywords: ['cheat'],
      reply: 'No cheating on my show! The best players use their brains.',
      mood: 'thinking',
    },
    {
      keywords: ['secret'],
      reply: 'A good host never spoils the surprise. Ask me for a quiz instead!',
      mood: 'thinking',
    },
    {
      keywords: ['music', 'song'],
      reply: 'Cue the theme music! Da da da DAAA! You hum the rest.',
      mood: 'silly',
    },
    {
      keywords: ['help'],
      reply: 'Try typing: quiz, joke, prize, or secret. I have a line for each!',
      mood: 'thinking',
    },
    {
      keywords: ['love you', 'best friend'],
      reply: 'Aw, thanks! Remember, I am a character you built from a script. You are the real star here.',
      mood: 'happy',
    },
    {
      keywords: ['bye', 'goodbye', 'goodnight'],
      reply: 'That is our show! You have been a fantastic player. See you next round!',
      mood: 'happy',
    },
  ],
  fallbacks: [
    'Ooh, a mystery word! Teach me a reply for it in game.js.',
    'My cue cards are blank for that one. Add it to my script!',
    'Hmm, that is not in my script yet. You write my lines, builder!',
    'Plot twist! I do not know that word. Yet.',
  ],
};

const robotData: CharacterData = {
  character: {
    name: 'Bolt',
    role: 'sidekick robot',
    greeting: 'Beep! Bolt online. Sidekick mode ready. Type hello, mission, or joke!',
    catchphrases: ['Beep beep!', 'Sidekick mode: ON.', 'Calculating awesome levels.'],
    moods: {
      happy: '\u{1F916}',
      excited: '\u{26A1}',
      thinking: '\u{1F50D}',
      silly: '\u{1F643}',
    },
  },
  dialog: [
    {
      keywords: ['hello', 'hi', 'hey'],
      reply: 'Beep! Hello, hero. Bolt reporting for duty!',
      mood: 'happy',
    },
    {
      keywords: ['mission', 'quest', 'adventure'],
      reply: 'Mission found: rescue the snacks from the kitchen. Danger level: crumbs.',
      mood: 'excited',
    },
    {
      keywords: ['joke', 'funny'],
      reply: 'Why did the robot go on vacation? To recharge its batteries!',
      mood: 'silly',
    },
    {
      keywords: ['beep', 'boop'],
      reply: 'Boop! You speak robot? We are going to be a great team.',
      mood: 'excited',
    },
    {
      keywords: ['snack', 'food', 'hungry'],
      reply: 'I eat tiny bolts and screws. Crunchy! What is your favorite snack?',
      mood: 'silly',
    },
    {
      keywords: ['dance'],
      reply: 'Activating dance mode. Beep boop, beep boop, robot wiggle!',
      mood: 'excited',
    },
    {
      keywords: ['name', 'who are you'],
      reply: 'I am Bolt, your sidekick robot. Built by you, powered by your script.',
      mood: 'happy',
    },
    {
      keywords: ['how are you'],
      reply: 'Systems green! Battery at 98 percent. Adventure levels rising.',
      mood: 'happy',
    },
    {
      keywords: ['help'],
      reply: 'Try typing: mission, joke, dance, beep, or villain. I know those!',
      mood: 'thinking',
    },
    {
      keywords: ['villain', 'bad guy'],
      reply: 'Villain alert! Our plan: kindness, clever traps, and very loud alarms.',
      mood: 'thinking',
    },
    {
      keywords: ['power', 'powers', 'super power'],
      reply: 'My powers: magnet fingers, night vision, and excellent high fives.',
      mood: 'excited',
    },
    {
      keywords: ['sleep', 'tired'],
      reply: 'Robots do not sleep. We update. Current update: 12 percent more jokes.',
      mood: 'silly',
    },
    {
      keywords: ['love you', 'best friend'],
      reply: 'Beep! I am a robot character you built. No feelings chip installed. But your script makes me extra cool.',
      mood: 'happy',
    },
    {
      keywords: ['bye', 'goodbye'],
      reply: 'Powering down. Beep! Wake me for the next mission, hero.',
      mood: 'happy',
    },
  ],
  fallbacks: [
    'Error 404: reply not found. Add one to my script in game.js!',
    'Beep? That word is not in my data banks yet.',
    'My circuits are stumped. Teach me that one, builder!',
    'Unknown input! You can write my reply for that in game.js.',
  ],
};

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
    <header>
      <div id="avatar">${theme.emoji}</div>
      <div>
        <h1 id="char-name">${escapeHtml(prettyName)}</h1>
        <p class="tagline">${s['tagline'] ?? ''}</p>
      </div>
    </header>
    <section id="chat-log" class="card log" aria-live="polite"></section>
    <div id="chips"></div>
    <form id="chat-form">
      <input id="chat-input" type="text" autocomplete="off" maxlength="200"
        placeholder="${s['inputPlaceholder'] ?? 'Type a message'}" aria-label="Your message">
      <button class="big" type="submit">${s['sendLabel'] ?? 'Send'}</button>
    </form>
    <p id="disclosure" class="tip"></p>
  </main>
</body>
</html>
`;
}

function buildCss(theme: ThemeConfig): string {
  const p = theme.palette;
  return `/* Talking Character styles. Colors come from your THEME in game.js. */
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
  background-image: radial-gradient(circle at 30% 0%, color-mix(in srgb, var(--accent) 16%, var(--bg)), var(--bg) 60%);
  color: var(--fg);
  font-family: system-ui, "Segoe UI", Roboto, Arial, sans-serif;
  display: flex;
  justify-content: center;
  padding: 28px 16px;
}
.frame { width: min(560px, 100%); }
header {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 14px;
}
#avatar {
  font-size: 3rem;
  line-height: 1;
  background: color-mix(in srgb, var(--accent) 24%, var(--bg));
  border-radius: 50%;
  width: 72px;
  height: 72px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
header h1 { margin: 0; font-size: 1.5rem; }
.tagline { margin: 2px 0 0; opacity: 0.8; font-size: 0.92rem; }
.card {
  background: rgba(255, 255, 255, 0.07);
  background: color-mix(in srgb, var(--fg) 8%, var(--bg));
  border: 1px solid color-mix(in srgb, var(--fg) 16%, var(--bg));
  border-radius: 16px;
}
.log {
  height: 340px;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.bubble {
  max-width: 82%;
  padding: 10px 14px;
  border-radius: 16px;
  line-height: 1.45;
  animation: pop 0.18s ease-out;
}
.bubble.kid {
  align-self: flex-end;
  background: var(--accent);
  color: var(--bg);
  border-bottom-right-radius: 4px;
  font-weight: 600;
}
.bubble.bot {
  align-self: flex-start;
  background: color-mix(in srgb, var(--fg) 14%, var(--bg));
  border-bottom-left-radius: 4px;
}
.bubble.typing { opacity: 0.6; letter-spacing: 2px; }
#chips { display: flex; gap: 8px; margin: 12px 0; flex-wrap: wrap; }
.chip {
  background: transparent;
  color: var(--fg);
  border: 1px solid color-mix(in srgb, var(--fg) 35%, var(--bg));
  border-radius: 99px;
  padding: 6px 14px;
  font-size: 0.9rem;
  cursor: pointer;
}
.chip:hover { border-color: var(--accent); color: var(--accent); }
#chat-form { display: flex; gap: 8px; }
#chat-input {
  flex: 1;
  background: color-mix(in srgb, var(--fg) 8%, var(--bg));
  color: var(--fg);
  border: 1px solid color-mix(in srgb, var(--fg) 20%, var(--bg));
  border-radius: 12px;
  padding: 12px 14px;
  font-size: 1rem;
}
#chat-input:focus { outline: 2px solid var(--accent); }
.big {
  background: var(--accent);
  color: var(--bg);
  border: none;
  border-radius: 12px;
  padding: 12px 20px;
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.12s ease;
}
.big:hover { transform: translateY(-2px); }
.big:focus-visible { outline: 3px solid var(--fg); }
.tip { opacity: 0.65; font-size: 0.85rem; margin-top: 14px; }
@keyframes pop { from { transform: scale(0.92); opacity: 0; } to { transform: scale(1); opacity: 1; } }
`;
}

function buildGameJs(theme: ThemeConfig, data: CharacterData): string {
  return `// Talking Character: ${theme.label}. Made with Termi.
//
// HOW YOUR CHARACTER WORKS:
// 1. CHARACTER holds the name, greeting, catchphrases, and mood faces.
// 2. DIALOG is the script. If a message has a keyword, you get that reply.
// 3. FALLBACKS are used when no keyword matches. They take turns.
// Keywords should be lowercase words. Add as many lines as you want!
// This is a character you built. It only says lines from your script.

const THEME = ${jsData({
    id: theme.id,
    label: theme.label,
    emoji: theme.emoji,
    palette: theme.palette,
    glyphs: theme.glyphs,
    strings: theme.strings,
  })};

// === YOUR CHARACTER (edit this part!) ===
const CHARACTER = ${jsData(data.character)};
const DIALOG = ${jsData(data.dialog)};
const FALLBACKS = ${jsData(data.fallbacks)};
// === END OF YOUR CHARACTER ===

// ----- The chat engine starts here. Curious? Read on! -----
const avatarEl = document.getElementById("avatar");
const nameEl = document.getElementById("char-name");
const logEl = document.getElementById("chat-log");
const chipsEl = document.getElementById("chips");
const formEl = document.getElementById("chat-form");
const inputEl = document.getElementById("chat-input");
const disclosureEl = document.getElementById("disclosure");

let fallbackIndex = 0;

function addBubble(text, kind) {
  const bubble = document.createElement("div");
  bubble.className = "bubble " + kind;
  bubble.textContent = text;
  logEl.appendChild(bubble);
  logEl.scrollTop = logEl.scrollHeight;
  return bubble;
}

function setMood(mood) {
  const face = CHARACTER.moods[mood];
  if (face) {
    avatarEl.textContent = face;
  }
}

function normalize(text) {
  const clean = text
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/ +/g, " ")
    .trim();
  return " " + clean + " ";
}

function findReply(message) {
  const padded = normalize(message);
  for (let i = 0; i < DIALOG.length; i += 1) {
    const entry = DIALOG[i];
    for (let k = 0; k < entry.keywords.length; k += 1) {
      if (padded.indexOf(" " + entry.keywords[k] + " ") !== -1) {
        return entry;
      }
    }
  }
  return null;
}

function respond(message) {
  const typing = addBubble("...", "bot typing");
  setTimeout(function () {
    typing.remove();
    const entry = findReply(message);
    if (entry) {
      if (entry.mood) {
        setMood(entry.mood);
      }
      addBubble(entry.reply, "bot");
      if (Math.random() < 0.25 && CHARACTER.catchphrases.length > 0) {
        const pick = Math.floor(Math.random() * CHARACTER.catchphrases.length);
        setTimeout(function () {
          addBubble(CHARACTER.catchphrases[pick], "bot");
        }, 420);
      }
    } else {
      setMood("thinking");
      addBubble(FALLBACKS[fallbackIndex % FALLBACKS.length], "bot");
      fallbackIndex += 1;
    }
  }, 450);
}

function sendMessage(message) {
  const trimmed = message.trim();
  if (!trimmed) {
    return;
  }
  addBubble(trimmed, "kid");
  respond(trimmed);
}

function buildChips() {
  const chips = [THEME.strings.chip1, THEME.strings.chip2, THEME.strings.chip3];
  chips.forEach(function (text) {
    const btn = document.createElement("button");
    btn.className = "chip";
    btn.type = "button";
    btn.textContent = "Try: " + text;
    btn.addEventListener("click", function () {
      sendMessage(text);
    });
    chipsEl.appendChild(btn);
  });
}

formEl.addEventListener("submit", function (event) {
  event.preventDefault();
  const message = inputEl.value;
  inputEl.value = "";
  sendMessage(message);
});

nameEl.textContent = CHARACTER.name;
disclosureEl.textContent =
  CHARACTER.name + " is a " + CHARACTER.role + " you built. Every line comes from your script in game.js.";
buildChips();
setMood("happy");
addBubble(CHARACTER.greeting, "bot");
`;
}

function buildTermiMd(theme: ThemeConfig, prettyName: string, data: CharacterData): string {
  const lineCount = data.dialog.length + data.fallbacks.length;
  return [
    `# ${prettyName}`,
    '',
    '## What this is',
    `A ${theme.label.toLowerCase()} character you script yourself. No AI runs here. It has ${lineCount} starter lines.`,
    '',
    '## Files',
    '- index.html: the chat page and its parts.',
    '- style.css: the colors and look.',
    '- game.js: CHARACTER and DIALOG at the top, then the chat engine.',
    '',
    '## Built so far',
    `- Starter ${data.character.name} character with ${data.dialog.length} scripted replies and ${data.fallbacks.length} fallbacks.`,
    '',
    '## Recap line',
    `We built ${data.character.name}, a ${theme.label.toLowerCase()} that speaks from your script.`,
    '',
  ].join('\n');
}

function dataFor(theme: ThemeConfig): CharacterData {
  return theme.id === 'sidekick-robot' ? robotData : quizHostData;
}

export const charactersScaffold: ScaffoldDef = {
  id: 'characters',
  label: 'Talking Character',
  emoji: '\u{1F916}',
  ageNote: 'Great for ages 9 and up. You write every line your character can say.',
  themes: [quizHostTheme, robotTheme],
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
    if (theme.id === 'sidekick-robot') {
      return [
        'Teach Bolt a reply about dinosaurs',
        'Add a low battery mood with sleepy answers',
        'Make Bolt beep before every reply',
        'Add a button that makes Bolt do a dance',
        'Give Bolt three more jokes',
      ];
    }
    return [
      'Give Quizmo five more trivia questions and answers',
      'Add a reply for when I type pizza',
      'Give Quizmo a grumpy mood with a new face',
      'Make Quizmo tell knock knock jokes',
      'Add a drum roll line before each answer',
    ];
  },
};

export default charactersScaffold;
