/**
 * Story Quest: a choose-your-own-adventure scaffold.
 * The kid edits the STORY object at the top of game.js.
 * Engine: typewriter reveal, choice buttons, one item that unlocks
 * one path, and endings tracked in localStorage.
 */

import type { ScaffoldDef, ThemeConfig } from '../../types.js';

interface StoryChoice {
  label: string;
  goto: string;
  needs?: string;
}

interface StoryScene {
  id: string;
  text: string;
  gives?: string;
  choices: StoryChoice[];
}

interface StoryData {
  start: string;
  scenes: StoryScene[];
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

const dragonTheme: ThemeConfig = {
  id: 'dragon-treasure',
  label: 'Dragon Treasure',
  emoji: '\u{1F432}',
  palette: { bg: '#1c1033', fg: '#fff6e9', accent: '#ffb347' },
  glyphs: { item: '\u{1F5DD}\u{FE0F}', lock: '\u{1F512}', ending: '\u{1F3C1}', spark: '\u{2728}' },
  strings: {
    tagline: 'A mountain of gold. A sleeping dragon. Your choices.',
    theEnd: 'The End',
    playAgain: 'Play again',
    startOver: 'Start over',
    foundAll: 'You found every ending! Amazing.',
    moreLeft: 'More endings are hiding. Try a new path!',
    pickupPrefix: 'You picked up the ',
    tip: 'Tap the story text to show all the words. Edit STORY in game.js to change your tale.',
  },
  narrativeIntro: 'A dragon guards a mountain of gold. Your choices decide how the story ends.',
  nonViolent: true,
  nonCompetitive: true,
};

const mysteryTheme: ThemeConfig = {
  id: 'mystery-school',
  label: 'Mystery at School',
  emoji: '\u{1F575}\u{FE0F}',
  palette: { bg: '#102a43', fg: '#f0f4f8', accent: '#5ad1b3' },
  glyphs: { item: '\u{1F511}', lock: '\u{1F512}', ending: '\u{1F3C6}', spark: '\u{1F50E}' },
  strings: {
    tagline: 'The trophy is gone. You are on the case, detective.',
    theEnd: 'Case Closed',
    playAgain: 'Play again',
    startOver: 'Start over',
    foundAll: 'You found every ending! Super sleuth.',
    moreLeft: 'More endings are hiding. Follow a new clue!',
    pickupPrefix: 'You picked up the ',
    tip: 'Tap the story text to show all the words. Edit STORY in game.js to change the case.',
  },
  narrativeIntro: 'The school trophy vanished overnight. Your choices crack the case.',
  nonViolent: true,
  nonCompetitive: true,
};

const dragonStory: StoryData = {
  start: 'gates',
  scenes: [
    {
      id: 'gates',
      text: 'Ember Mountain rises ahead. Smoke curls from the top. A stone gate stands open, and a cold stream slips past the rocks.',
      choices: [
        { label: 'Step through the dark gate', goto: 'cave' },
        { label: 'Follow the stream', goto: 'stream' },
      ],
    },
    {
      id: 'cave',
      text: 'Inside, glowing moss lights the walls. Two tunnels split ahead. The left one sparkles. The right one smells like old metal.',
      choices: [
        { label: 'Take the sparkling left tunnel', goto: 'moss' },
        { label: 'Take the metal smelling right tunnel', goto: 'mine' },
      ],
    },
    {
      id: 'stream',
      text: "A huge turtle floats by with a map painted on its shell. It blinks slowly. 'Looking for the dragon treasure?' it asks.",
      choices: [
        { label: 'Ask the turtle for help', goto: 'turtle' },
        { label: 'Wade across the cold water', goto: 'waterfall' },
      ],
    },
    {
      id: 'turtle',
      text: "'The vault has a silver lock,' says the turtle. 'Miners hid the key below. Look where the carts sleep.'",
      choices: [
        { label: 'Search the old mine', goto: 'mine' },
        { label: 'Head through the mountain gate', goto: 'cave' },
      ],
    },
    {
      id: 'mine',
      text: 'Dusty mine carts rest on bent rails. Something shines under a wheel. It is a small silver key!',
      gives: 'silver key',
      choices: [
        { label: 'Ride a cart deeper inside', goto: 'hall' },
        { label: 'Squeeze through a glowing crack', goto: 'moss' },
      ],
    },
    {
      id: 'moss',
      text: 'This room hums softly. Sleepy bats hang in rows, like socks on a line.',
      choices: [
        { label: 'Tiptoe past the bats', goto: 'hall' },
        { label: 'Hum your favorite song', goto: 'dragon' },
      ],
    },
    {
      id: 'hall',
      text: 'You reach a giant hall. A snoring dragon sleeps on a hill of gold. Behind it stands a silver door with a tiny keyhole.',
      choices: [
        { label: 'Open the silver door', goto: 'vault', needs: 'silver key' },
        { label: 'Wake the dragon politely', goto: 'dragon' },
        { label: 'Sneak back to the gate', goto: 'gates' },
      ],
    },
    {
      id: 'dragon',
      text: "The dragon lifts its head and looks right at you. 'Few visitors are this polite,' it rumbles. 'I have been alone a long time.'",
      choices: [
        { label: 'Share your sandwich', goto: 'friend' },
        { label: 'Ask for a riddle', goto: 'riddle' },
      ],
    },
    {
      id: 'riddle',
      text: "'Answer this and I will like you even more,' says the dragon. 'What has to be broken before you can use it?'",
      choices: [
        { label: 'Say: an egg', goto: 'friend' },
        { label: 'Say: a secret', goto: 'hall' },
      ],
    },
    {
      id: 'waterfall',
      text: 'The stream speeds up. Whoosh! You slide down a hidden waterfall into a sunny lake. Village kids cheer your giant splash. You did not find gold today. You found the best shortcut in the valley.',
      choices: [],
    },
    {
      id: 'vault',
      text: 'The silver key turns with a soft click. Inside, gold coins glow like little suns. You fill one bag and leave the rest for the dragon. Back home, the whole village celebrates you.',
      choices: [],
    },
    {
      id: 'friend',
      text: "The dragon grins, warm as a campfire. 'Stay for tea,' it says. You talk for hours about maps, gold, and bats. You made a legendary friend. You visit every Saturday.",
      choices: [],
    },
  ],
};

const mysteryStory: StoryData = {
  start: 'hallway',
  scenes: [
    {
      id: 'hallway',
      text: "The glass trophy case is empty! Coach's big gold cup is gone. Muddy footprints lead two ways down the hall.",
      choices: [
        { label: 'Follow the prints to the gym', goto: 'gym' },
        { label: 'Check the library for clues', goto: 'library' },
      ],
    },
    {
      id: 'gym',
      text: 'The gym smells like floor wax. The prints stop near the supply closet. Coach Reyes is stacking cones nearby.',
      choices: [
        { label: 'Ask Coach Reyes', goto: 'coach' },
        { label: 'Peek down the basement stairs', goto: 'basement' },
      ],
    },
    {
      id: 'coach',
      text: "'The trophy? Janitor Lee carried a big box this morning,' says Coach. 'He went toward the music hall.'",
      choices: [
        { label: 'Find Janitor Lee', goto: 'janitor' },
        { label: 'Head to the basement stairs', goto: 'basement' },
      ],
    },
    {
      id: 'library',
      text: "The library is quiet as snow. Ms. Patel whispers, 'Strange things end up in lost and found.' Old yearbooks sit on a cart.",
      choices: [
        { label: 'Dig through lost and found', goto: 'lostfound' },
        { label: 'Open the dusty yearbooks', goto: 'yearbook' },
      ],
    },
    {
      id: 'lostfound',
      text: 'You find one mitten, three whistles, and a small brass key. The tag says BASEMENT.',
      gives: 'brass key',
      choices: [
        { label: 'Take the stairs to the basement', goto: 'basement' },
        { label: 'Check the gym next', goto: 'gym' },
      ],
    },
    {
      id: 'yearbook',
      text: 'A photo from 1989 shows a hidden room behind the music hall curtain. Students called it the Polish Club.',
      choices: [
        { label: 'Go to the music hall', goto: 'music' },
        { label: 'Try the basement instead', goto: 'basement' },
      ],
    },
    {
      id: 'basement',
      text: 'At the bottom of the stairs waits a green door. It is locked tight. You hear soft laughing inside.',
      choices: [
        { label: 'Unlock the green door', goto: 'clubroom', needs: 'brass key' },
        { label: 'Knock three times', goto: 'knock' },
        { label: 'Go back upstairs', goto: 'hallway' },
      ],
    },
    {
      id: 'knock',
      text: "A voice whispers, 'Shh! It is not Friday yet!' Then quiet feet shuffle away inside.",
      choices: [
        { label: 'Press your ear to the door', goto: 'listen' },
        { label: 'Go ask Janitor Lee', goto: 'janitor' },
      ],
    },
    {
      id: 'janitor',
      text: "Janitor Lee smiles. 'My box? Just ribbons for Friday,' he says. 'Funny week. Kids keep sneaking toward the music hall.'",
      choices: [
        { label: 'Search the music hall', goto: 'music' },
        { label: 'Return to the basement door', goto: 'basement' },
      ],
    },
    {
      id: 'music',
      text: 'Behind the heavy curtain, you find them. The student council is polishing the trophy until it shines! It is a surprise for Coach on Friday. You promise to keep the secret. They hand you a polishing cloth. Welcome to the team, detective.',
      choices: [],
    },
    {
      id: 'clubroom',
      text: 'The brass key clicks. Inside the old Polish Club room, the trophy sparkles on a velvet pillow. A banner reads SURPRISE PARTY FOR COACH. You help plan the big reveal. Friday is going to be great.',
      choices: [],
    },
    {
      id: 'listen',
      text: 'You hear the whole plan. A surprise assembly! You tiptoe upstairs and zip your lips. On Friday, you act amazed with everyone else. Best secret ever kept.',
      choices: [],
    },
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
      <h1><span class="emoji">${theme.emoji}</span> ${escapeHtml(prettyName)}</h1>
      <p class="tagline">${s['tagline'] ?? ''}</p>
    </header>
    <section class="card" id="story-card">
      <p id="scene-text"></p>
      <div id="toast" class="toast hidden"></div>
      <div id="choices" class="choices"></div>
    </section>
    <footer>
      <span id="endings-note"></span>
      <button id="restart" class="ghost" type="button">${s['startOver'] ?? 'Start over'}</button>
    </footer>
    <p class="tip">${s['tip'] ?? ''}</p>
  </main>
</body>
</html>
`;
}

function buildCss(theme: ThemeConfig): string {
  const p = theme.palette;
  return `/* Story Quest styles. Colors come from your THEME in game.js. */
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
  background-image: radial-gradient(circle at 18% 0%, color-mix(in srgb, var(--accent) 16%, var(--bg)), var(--bg) 60%);
  color: var(--fg);
  font-family: system-ui, "Segoe UI", Roboto, Arial, sans-serif;
  display: flex;
  justify-content: center;
  padding: 28px 16px;
}
.frame { width: min(680px, 100%); }
header h1 { font-size: 1.7rem; margin: 0 0 4px; }
header .emoji { font-size: 1.6rem; }
.tagline { margin: 0 0 18px; opacity: 0.85; }
.card {
  background: rgba(255, 255, 255, 0.07);
  background: color-mix(in srgb, var(--fg) 8%, var(--bg));
  border: 1px solid color-mix(in srgb, var(--fg) 16%, var(--bg));
  border-radius: 16px;
  padding: 22px;
  cursor: pointer;
}
#scene-text {
  font-family: Georgia, "Iowan Old Style", "Times New Roman", serif;
  font-size: 1.15rem;
  line-height: 1.65;
  min-height: 6.5em;
  margin: 0 0 16px;
  white-space: pre-wrap;
}
.toast {
  background: var(--accent);
  color: var(--bg);
  font-weight: 700;
  border-radius: 10px;
  padding: 8px 12px;
  margin: 0 0 14px;
  animation: pop 0.25s ease-out;
}
.hidden { display: none; }
.choices { display: grid; gap: 10px; }
.choice {
  background: var(--accent);
  color: var(--bg);
  border: none;
  border-radius: 12px;
  padding: 12px 16px;
  font-size: 1rem;
  font-weight: 700;
  text-align: left;
  cursor: pointer;
  transition: transform 0.12s ease;
}
.choice:hover:not(:disabled) { transform: translateY(-2px); }
.choice:focus-visible { outline: 3px solid var(--fg); }
.choice:disabled { opacity: 0.45; cursor: not-allowed; }
.the-end {
  font-family: Georgia, serif;
  font-style: italic;
  font-size: 1.5rem;
  text-align: center;
  margin: 4px 0;
}
.endings-line { text-align: center; margin: 4px 0 10px; opacity: 0.9; }
footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 14px;
}
.ghost {
  background: transparent;
  color: var(--fg);
  border: 1px solid color-mix(in srgb, var(--fg) 40%, var(--bg));
  border-radius: 10px;
  padding: 8px 14px;
  cursor: pointer;
}
.ghost:hover { border-color: var(--accent); color: var(--accent); }
.tip { opacity: 0.65; font-size: 0.85rem; margin-top: 16px; }
@keyframes pop { from { transform: scale(0.9); opacity: 0; } to { transform: scale(1); opacity: 1; } }
`;
}

function buildGameJs(theme: ThemeConfig, story: StoryData): string {
  return `// Story Quest: ${theme.label}. Made with Termi.
//
// HOW YOUR STORY WORKS:
// 1. Every scene lives in the STORY object below. Change any "text"!
// 2. A choice's "goto" must match another scene's "id".
// 3. "gives" hands the player an item. "needs" locks a choice.
// 4. A scene with an empty "choices" list is an ending.
// Save the file and refresh the page to see your changes.

const THEME = ${jsData({
    id: theme.id,
    label: theme.label,
    emoji: theme.emoji,
    palette: theme.palette,
    glyphs: theme.glyphs,
    strings: theme.strings,
  })};

// === YOUR STORY (edit this part!) ===
const STORY = ${jsData(story)};
// === END OF YOUR STORY ===

// ----- The story engine starts here. Curious? Read on! -----
const sceneTextEl = document.getElementById("scene-text");
const choicesEl = document.getElementById("choices");
const toastEl = document.getElementById("toast");
const endingsEl = document.getElementById("endings-note");
const restartBtn = document.getElementById("restart");
const storyCard = document.getElementById("story-card");

const ENDINGS_KEY = "termi-story-endings-" + THEME.id;
let items = [];
let typingTimer = null;
let finishTyping = null;
let toastTimer = null;

function loadEndings() {
  try {
    const raw = localStorage.getItem(ENDINGS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    return [];
  }
}

function saveEndings(list) {
  try {
    localStorage.setItem(ENDINGS_KEY, JSON.stringify(list));
  } catch (err) {
    // Storage is off. The game still plays fine.
  }
}

function allEndings() {
  return STORY.scenes.filter(function (scene) {
    return scene.choices.length === 0;
  });
}

function findScene(id) {
  return STORY.scenes.find(function (scene) {
    return scene.id === id;
  });
}

function hasItem(name) {
  return items.indexOf(name) !== -1;
}

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () {
    toastEl.classList.add("hidden");
  }, 2600);
}

function updateEndingsNote() {
  const found = loadEndings().length;
  const total = allEndings().length;
  endingsEl.textContent = THEME.glyphs.ending + " You found " + found + " of " + total + " endings!";
}

function typeText(text, done) {
  clearInterval(typingTimer);
  sceneTextEl.textContent = "";
  let shown = 0;
  finishTyping = function () {
    clearInterval(typingTimer);
    typingTimer = null;
    finishTyping = null;
    sceneTextEl.textContent = text;
    done();
  };
  typingTimer = setInterval(function () {
    shown += 1;
    sceneTextEl.textContent = text.slice(0, shown);
    if (shown >= text.length && finishTyping) {
      finishTyping();
    }
  }, 18);
}

function makeChoiceButton(choice) {
  const btn = document.createElement("button");
  btn.className = "choice";
  btn.type = "button";
  if (choice.needs && !hasItem(choice.needs)) {
    btn.textContent = THEME.glyphs.lock + " " + choice.label + " (needs the " + choice.needs + ")";
    btn.disabled = true;
  } else {
    let label = choice.label;
    if (choice.needs) {
      label = THEME.glyphs.item + " " + label;
    }
    btn.textContent = label;
    btn.addEventListener("click", function (event) {
      event.stopPropagation();
      showScene(choice.goto);
    });
  }
  return btn;
}

function showEnding(scene) {
  const found = loadEndings();
  if (found.indexOf(scene.id) === -1) {
    found.push(scene.id);
    saveEndings(found);
  }
  updateEndingsNote();
  const banner = document.createElement("p");
  banner.className = "the-end";
  banner.textContent = THEME.glyphs.ending + " " + THEME.strings.theEnd;
  choicesEl.appendChild(banner);
  const note = document.createElement("p");
  note.className = "endings-line";
  const total = allEndings().length;
  note.textContent = found.length >= total ? THEME.strings.foundAll : THEME.strings.moreLeft;
  choicesEl.appendChild(note);
  const again = document.createElement("button");
  again.className = "choice";
  again.type = "button";
  again.textContent = THEME.glyphs.spark + " " + THEME.strings.playAgain;
  again.addEventListener("click", function (event) {
    event.stopPropagation();
    restart();
  });
  choicesEl.appendChild(again);
}

function showScene(id) {
  const scene = findScene(id);
  choicesEl.textContent = "";
  if (!scene) {
    sceneTextEl.textContent = 'Hmm, the scene "' + id + '" is missing. Check the goto spelling in game.js.';
    return;
  }
  if (scene.gives && !hasItem(scene.gives)) {
    items.push(scene.gives);
    showToast(THEME.glyphs.item + " " + THEME.strings.pickupPrefix + scene.gives + "!");
  }
  typeText(scene.text, function () {
    if (scene.choices.length === 0) {
      showEnding(scene);
      return;
    }
    scene.choices.forEach(function (choice) {
      choicesEl.appendChild(makeChoiceButton(choice));
    });
  });
}

function restart() {
  items = [];
  showScene(STORY.start);
}

storyCard.addEventListener("click", function () {
  if (finishTyping) {
    finishTyping();
  }
});
restartBtn.addEventListener("click", restart);

updateEndingsNote();
restart();
`;
}

function buildTermiMd(theme: ThemeConfig, prettyName: string, story: StoryData): string {
  const endings = story.scenes.filter((s) => s.choices.length === 0).length;
  return [
    `# ${prettyName}`,
    '',
    '## What this is',
    `A choose your own adventure game. The ${theme.label} story has ${story.scenes.length} scenes and ${endings} endings.`,
    '',
    '## Files',
    '- index.html: the page and its parts.',
    '- style.css: the colors and look.',
    '- game.js: the STORY scenes at the top, then the story engine.',
    '',
    '## Built so far',
    `- Starter ${theme.label} adventure with ${endings} endings and one hidden item.`,
    '',
    '## Recap line',
    `We started a ${theme.label} adventure with ${endings} endings to find.`,
    '',
  ].join('\n');
}

function storyFor(theme: ThemeConfig): StoryData {
  return theme.id === 'mystery-school' ? mysteryStory : dragonStory;
}

export const storiesScaffold: ScaffoldDef = {
  id: 'stories',
  label: 'Story Quest',
  emoji: '\u{1F4D6}',
  ageNote: 'Great for ages 9 and up. You write the scenes, the code runs the adventure.',
  themes: [dragonTheme, mysteryTheme],
  files(theme: ThemeConfig, prettyName: string): Record<string, string> {
    const story = storyFor(theme);
    return {
      'index.html': buildHtml(theme, prettyName),
      'style.css': buildCss(theme),
      'game.js': buildGameJs(theme, story),
      'TERMI.md': buildTermiMd(theme, prettyName, story),
    };
  },
  starterPrompts(theme: ThemeConfig): string[] {
    if (theme.id === 'mystery-school') {
      return [
        'Add a scene where I question the art teacher',
        'Make a new ending where the principal throws a pizza party',
        'Add a sneaky clue in the gym that tricks me',
        'Let me find a flashlight that unlocks a dark closet',
        'Make the story words show up faster',
      ];
    }
    return [
      'Add a scene where the dragon shows me its egg collection',
      'Make a fourth ending where I become the mountain guard',
      'Add a funny talking squirrel to the stream scene',
      'Make the cave scene sound spookier',
      'Add a magic lantern item that unlocks a new path',
    ];
  },
};

export default storiesScaffold;
