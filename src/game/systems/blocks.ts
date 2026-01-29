import Matter from 'matter-js';
import type { Body } from 'matter-js';
import type { Player } from '../Player';
import type { LevelRect } from '../Game';

export function updateBlocks(
  blockBodies: Body[],
  blockDefs: Array<LevelRect & { required: number }>,
  playerSlots: Array<Player | null>,
  blockPusherCounts: number[]
) {
  if (blockBodies.length === 0) return;
  for (let i = 0; i < blockBodies.length; i += 1) {
    const body = blockBodies[i];
    const def = blockDefs[i];
    if (!def) continue;

    const pushers = new Set<number>();
    for (let slot = 0; slot < playerSlots.length; slot += 1) {
      const player = playerSlots[slot];
      if (!player) continue;
      if (Math.abs(player.moveAxisX) < 0.2) continue;
      if (Matter.Query.collides(body, [player.body]).length === 0) continue;

      const dx = body.position.x - player.body.position.x;
      if (dx > 0 && player.moveAxisX > 0) pushers.add(slot);
      if (dx < 0 && player.moveAxisX < 0) pushers.add(slot);
    }

    blockPusherCounts[i] = pushers.size;
    const shouldMove = pushers.size >= def.required;
    if (shouldMove && body.isStatic) {
      Matter.Body.setStatic(body, false);
    } else if (!shouldMove && !body.isStatic) {
      Matter.Body.setVelocity(body, { x: 0, y: body.velocity.y });
      Matter.Body.setAngularVelocity(body, 0);
      Matter.Body.setStatic(body, true);
    }
  }
}
