import type { ScaffoldDef } from '../../types.js';
import { gamesScaffold } from './games.js';
import { bigGamesScaffold } from './biggames.js';
import { artScaffold } from './art.js';
import { musicScaffold } from './music.js';
import { petsScaffold } from './pets.js';
import { storiesScaffold } from './stories.js';
import { quizzesScaffold } from './quizzes.js';
import { websitesScaffold } from './websites.js';
import { charactersScaffold } from './characters.js';

/** All project types, in home-menu order. Games lead: they are the front door. */
export const scaffolds: ScaffoldDef[] = [
  gamesScaffold,
  bigGamesScaffold,
  artScaffold,
  musicScaffold,
  petsScaffold,
  storiesScaffold,
  quizzesScaffold,
  websitesScaffold,
  charactersScaffold,
];

export function scaffoldById(id: string): ScaffoldDef | undefined {
  return scaffolds.find((s) => s.id === id);
}
