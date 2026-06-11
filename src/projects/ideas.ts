/**
 * Curated prompt ideas for `termi ideas` and /ideas.
 * Each list starts tiny and grows bolder so kids can pick their level.
 * Theme-agnostic on purpose: every idea works for any theme.
 */

const ideasByScaffold: Record<string, string[]> = {
  games: [
    'Make the player move a little faster.',
    'Give the player three lives.',
    'Make the obstacles spin as they fall.',
    'Play a sound when you grab a bonus.',
    'Add a power up that makes you tiny.',
    'Make the game speed up every 20 points.',
    'Add a high score that saves on this computer.',
    'Add a shield that blocks one hit.',
    'Add a boss level with a health bar.',
  ],
  biggames: [
    'Make the player jump a little higher.',
    'Add more things to collect in level one.',
    'Make a platform that moves up and down.',
    'Give the player a double jump.',
    'Add a secret room with a big bonus.',
    'Add a new enemy that walks back and forth.',
    'Add a timer that shows how fast you finish.',
    'Build a whole new level three.',
    'Add a boss level with a health bar.',
  ],
  art: [
    'Add a new bright color to the paint set.',
    'Make the brush bigger when you press B.',
    'Add an eraser button.',
    'Add a rainbow brush that changes color as you draw.',
    'Add a stamp tool with fun shapes.',
    'Add an undo button for the last stroke.',
    'Let me save my picture to the computer.',
    'Add a mirror mode that paints both sides at once.',
    'Add a gallery page that shows all my saved art.',
  ],
  music: [
    'Add one new drum sound.',
    'Make the beat a little faster.',
    'Add a button that plays a funny sound.',
    'Make the lights flash with the beat.',
    'Add a slider that changes the speed.',
    'Let me record a short loop and play it back.',
    'Add a new dance move for the dancer.',
    'Make a song that builds up and then drops.',
    'Add a whole second song with its own lights.',
  ],
  pets: [
    'Give my pet a new snack to eat.',
    'Make my pet blink now and then.',
    'Add a happiness meter with hearts.',
    'Add a play button with a tiny game inside.',
    'Make my pet get sleepy at night.',
    'Add a closet with hats for my pet.',
    'Let my pet learn a trick after ten treats.',
    'Add a friend pet that visits sometimes.',
    'Add levels so my pet grows up over time.',
  ],
  stories: [
    'Add one more choice to the first scene.',
    'Give a character a funny catchphrase.',
    'Add a new scene with a surprise twist.',
    'Add an item you can pick up and use later.',
    'Make a new ending where everyone celebrates.',
    'Add a riddle the reader must answer.',
    'Add a sneaky shortcut that skips a scene.',
    'Add a map screen that shows where you are.',
    'Write a whole second chapter with new places.',
  ],
  quizzes: [
    'Add one new question to the quiz.',
    'Add a silly wrong answer to a question.',
    'Show a happy message for a perfect score.',
    'Add a timer for each question.',
    'Shuffle the questions every time.',
    'Add emoji to the questions.',
    'Count how many right answers in a row you get.',
    'Add easy, medium, and hard levels.',
    'Add a final boss question worth double points.',
  ],
  websites: [
    'Add a new favorite to my list.',
    'Change the page colors to my favorites.',
    'Add a box for my favorite joke.',
    'Add a big welcome banner at the top.',
    'Make the buttons wiggle when you point at them.',
    'Add a day and night switch.',
    'Add a guest book that saves on this computer.',
    'Add a second page about my hobby.',
    'Hide a tiny game somewhere on the page.',
  ],
  characters: [
    'Give your character a new greeting.',
    'Add a joke your character can tell.',
    'Add a new question players can ask.',
    'Give your character a happy mood and a grumpy mood.',
    'Make the character remember your favorite color.',
    'Add sound effects when the character talks.',
    'Add a second character who butts in sometimes.',
    'Add a quiz round your character hosts.',
    'Give your character a secret story to unlock.',
  ],
};

/** Fallback ideas that fit any project. */
const genericIdeas: string[] = [
  'Change the colors to your favorites.',
  'Add a sound effect.',
  'Add a fun title at the top.',
  'Make something move on its own.',
  'Add a surprise that shows up after a while.',
  'Add a score or a counter.',
  'Save something so it is still there tomorrow.',
  'Add a whole new screen or level.',
];

/**
 * Returns prompt ideas for a project type.
 * Unknown ids get the generic list. Always returns a fresh copy.
 */
export function getIdeas(scaffoldId: string): string[] {
  const list = ideasByScaffold[scaffoldId];
  return list !== undefined ? [...list] : [...genericIdeas];
}
