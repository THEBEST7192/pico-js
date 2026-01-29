import Matter from 'matter-js';
import type { Body } from 'matter-js';
import type { Player } from '../Player';

export function updateDoor(
  doorBody: Body | null,
  keyPoint: { x: number; y: number } | null,
  doorUnlocked: boolean,
  playerSlots: Array<Player | null>,
  levelCompleted: boolean,
  completionFrames: number
): { levelCompleted: boolean; completionFrames: number } {
  if (!doorBody) {
    return { levelCompleted: false, completionFrames: 0 };
  }
  if (keyPoint && !doorUnlocked) {
    return { levelCompleted: false, completionFrames: 0 };
  }

  const activePlayers = playerSlots.filter((p): p is Player => Boolean(p));
  if (activePlayers.length === 0) {
    return { levelCompleted: false, completionFrames: 0 };
  }

  const atDoor = activePlayers.filter(p => Matter.Query.collides(doorBody!, [p.body]).length > 0);
  if (atDoor.length === activePlayers.length) {
    completionFrames += 1;
    if (completionFrames >= 15) levelCompleted = true;
  } else {
    completionFrames = 0;
    levelCompleted = false;
  }
  return { levelCompleted, completionFrames };
}
