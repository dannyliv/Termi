/**
 * L5: turns a block verdict into the screen the kid sees.
 * Never echoes blocked content. Always offers a way forward.
 */

import type { ClassifierVerdict } from '../types.js';
import type { MascotExpression } from '../ui/mascot.js';
import { T } from '../ui/text.js';
import { blockMessage } from './taxonomy.js';

export interface BlockScreen {
  title: string;
  body: string;
  mascotExpression: MascotExpression;
}

/** Maps a blocking verdict to the kid-facing screen. */
export function verdictToScreen(verdict: ClassifierVerdict): BlockScreen {
  if (verdict.selfHarmConcern) {
    return {
      title: 'Thank you for telling me.',
      body: T.selfHarmSupport.message,
      mascotExpression: 'gentleNo',
    };
  }
  if (verdict.failClosed) {
    return {
      title: 'Quick break time.',
      body: T.errors.failClosed,
      mascotExpression: 'oops',
    };
  }
  const message = verdict.kidMessage ?? blockMessage(verdict.categories);
  return {
    title: 'Let us try that another way.',
    body: `${message}\n${T.blocks.rephraseTip}`,
    mascotExpression: 'gentleNo',
  };
}
