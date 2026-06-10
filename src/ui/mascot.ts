/**
 * Termi the robot: faces, one-liners, and wait chatter.
 * Two art sets: unicode (box drawing plus accents) and pure ASCII.
 * Every face stays within 6 lines and 30 columns.
 */

import { unicodeOk } from './theme.js';

export type MascotExpression =
  | 'happy'
  | 'thinking'
  | 'building'
  | 'celebrating'
  | 'oops'
  | 'gentleNo';

/** Pure-ASCII faces for legacy terminals. Printable ASCII only. */
export const MASCOT_ASCII: Record<MascotExpression, string[]> = {
  happy: [
    '   _==_',
    ' .-|__|-.',
    ' | ^  ^ |',
    ' | \\__/ |',
    " '------'",
    '  d|--|b',
  ],
  thinking: [
    '   _==_   . o O ?',
    ' .-|__|-.',
    ' | o  ~ |',
    ' |  ..  |',
    " '------'",
    '  d|--|b',
  ],
  building: [
    '   _==_',
    ' .-|__|-.  *clank*',
    ' | >  < |',
    ' | [==] |',
    " '------'",
    '  d|--|b',
  ],
  celebrating: [
    '   _==_   * \\o/ *',
    ' .-|__|-.',
    ' | ^  ^ |',
    ' | \\__/ |',
    " '------'",
    ' \\|----|/',
  ],
  oops: [
    '   _==_',
    ' .-|__|-.  oops!',
    ' | x  x |',
    ' |  o   |',
    " '------'",
    '  d|--|b',
  ],
  gentleNo: [
    '   _==_',
    ' .-|__|-.',
    ' | -  - |',
    ' |  __  |',
    " '------'",
    '  d|--|b',
  ],
};

/** Box-drawing faces with small accents for modern terminals. */
export const MASCOT_UNICODE: Record<MascotExpression, string[]> = {
  happy: [
    '    ╿',
    ' ╭──┴──╮',
    ' │ ◕ ◕ │ ✨',
    ' │  ‿  │',
    ' ╰──┬──╯',
    '   ╱ ╲',
  ],
  thinking: [
    '    ╿   ?',
    ' ╭──┴──╮',
    ' │ ◔ ◔ │',
    ' │  ~  │',
    ' ╰──┬──╯',
    '   ╱ ╲',
  ],
  building: [
    '    ╿',
    ' ╭──┴──╮ ⚙',
    ' │ ◖ ◗ │',
    ' │ ▢▢ │',
    ' ╰──┬──╯',
    '   ╱ ╲',
  ],
  celebrating: [
    ' ✦  ╿  ✦',
    ' ╭──┴──╮',
    ' │ ★ ★ │',
    ' │  ‿  │',
    ' ╰──┬──╯',
    '  ╲│ │╱',
  ],
  oops: [
    '    ╿',
    ' ╭──┴──╮',
    ' │ ✕ ✕ │',
    ' │  ○  │',
    ' ╰──┬──╯',
    '   ╱ ╲',
  ],
  gentleNo: [
    '    ╿',
    ' ╭──┴──╮',
    ' │ ◡ ◡ │',
    ' │  ▱  │',
    ' ╰──┬──╯',
    '   ╱ ╲',
  ],
};

/** Render one face for the current terminal. */
export function mascot(expression: MascotExpression): string {
  const set = unicodeOk() ? MASCOT_UNICODE : MASCOT_ASCII;
  return set[expression].join('\n');
}

export type ProjectCategoryId =
  | 'games'
  | 'biggames'
  | 'art'
  | 'music'
  | 'pets'
  | 'stories'
  | 'quizzes'
  | 'websites'
  | 'characters';

export type OneLinerContext =
  | 'longWait'
  | 'comeback'
  | 'firstWin'
  | 'bugFixed'
  | 'blockedGentle';

/**
 * Situational quips. Curious, encouraging, a little goofy.
 * Termi is a build buddy, never a friend-who-loves-you.
 */
export const oneLiners: {
  newProject: Record<ProjectCategoryId, string[]>;
} & Record<OneLinerContext, string[]> = {
  newProject: {
    games: [
      'Dodging stuff is my favorite sport.',
      'I oiled my circuits. Ready to play.',
    ],
    biggames: [
      'A big world? I packed extra bolts.',
      'Platforms ahead. I never miss a jump. Mostly.',
    ],
    art: [
      'Fresh pixels! I call dibs on teal.',
      'I dipped my wires in paint. Ready.',
    ],
    music: [
      'Beep boop counts as music. Trust me.',
      'Turn it up. My speakers are tiny but brave.',
    ],
    pets: [
      'A pet? I promise not to short-circuit.',
      'I will help feed it. With code.',
    ],
    stories: [
      'A story! I made popcorn for my CPU.',
      'Plot twist incoming. I can feel it.',
    ],
    quizzes: [
      'Quiz me. I know 100 robot facts.',
      'Tricky questions are my favorite snack.',
    ],
    websites: [
      'Your own page! I will hold the pixels still.',
      'Time to build your corner of the screen.',
    ],
    characters: [
      'A new character? I hope they like robots.',
      'I will help them learn their lines.',
    ],
  },
  longWait: [
    'Still working. Robots do not get bored.',
    'Big thoughts take a moment.',
    'I am stacking the code blocks neatly.',
  ],
  comeback: [
    'You came back! I kept your spot warm.',
    'Welcome back, builder.',
    'I knew you would return. Robots are patient.',
  ],
  firstWin: [
    'Your first build! That was fast.',
    'It works! I did a tiny robot dance.',
    'First try and it runs. Nice.',
  ],
  bugFixed: [
    'Bug squashed. It never saw us coming.',
    'Fixed! That bug picked the wrong team.',
    'The bug is gone. High five.',
  ],
  blockedGentle: [
    'Not that one. Want to pick a new idea?',
    'That is not for us. Try another way?',
    'Hmm, not that. We can build something else.',
  ],
};

/** Pick a random quip for a moment in the session. */
export function pickOneLiner(context: OneLinerContext): string;
export function pickOneLiner(context: 'newProject', category: ProjectCategoryId): string;
export function pickOneLiner(
  context: OneLinerContext | 'newProject',
  category?: ProjectCategoryId,
): string {
  const pool =
    context === 'newProject'
      ? oneLiners.newProject[category ?? 'games']
      : oneLiners[context];
  const line = pool[Math.floor(Math.random() * pool.length)];
  return line ?? 'Beep! Let us build.';
}

const HEARTBEAT_EARLY: readonly string[] = [
  'Reading your game...',
  'Thinking hard...',
  'Lining up the code blocks...',
  'Checking my wires...',
];

const HEARTBEAT_PAST_20: readonly string[] = [
  'Still thinking. Big ideas take time.',
  'Almost there!',
  'This one is chunky. Hang tight.',
];

const HEARTBEAT_PAST_45: readonly string[] = [
  'Wow, this is a big one. Still going!',
  'Not stuck, promise. I am being careful.',
  'Long think! Your project is worth it.',
];

/**
 * Status lines to rotate through while the kid waits.
 * The pool changes past 20 seconds and again past 45 seconds.
 */
export function heartbeatLines(elapsedSeconds: number): string[] {
  if (elapsedSeconds >= 45) return [...HEARTBEAT_PAST_45];
  if (elapsedSeconds >= 20) return [...HEARTBEAT_PAST_20];
  return [...HEARTBEAT_EARLY];
}

/** One rotating line for the current moment of a wait. */
export function heartbeatLine(elapsedSeconds: number, stepSeconds = 3): string {
  const pool = heartbeatLines(elapsedSeconds);
  const safeStep = stepSeconds > 0 ? stepSeconds : 3;
  const idx = Math.floor(Math.max(0, elapsedSeconds) / safeStep) % pool.length;
  return pool[idx] ?? pool[0] ?? 'Working...';
}
