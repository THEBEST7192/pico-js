import Matter from 'matter-js';
import type { Body } from 'matter-js';
import type { Player } from '../Player';

export function updateSpikes(spikeBodies: Body[], playerSlots: Array<Player | null>, onDeath: () => void) {
  if (spikeBodies.length === 0) return;
  for (let slot = 0; slot < playerSlots.length; slot += 1) {
    const player = playerSlots[slot];
    if (!player) continue;
    if (Matter.Query.collides(player.body, spikeBodies).length > 0) {
      onDeath();
      return;
    }
  }
}
