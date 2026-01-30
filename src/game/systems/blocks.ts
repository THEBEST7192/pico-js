import Matter, { Composite, Query, type Body, type Engine } from 'matter-js';
import type { Player } from '../Player';
import type { LevelRect } from '../Game';

export function updateBlocks(
  blockBodies: Body[],
  blockDefs: Array<LevelRect & { required?: number; allowedPlayer?: number }>,
  playerSlots: Array<Player | null>,
  blockPusherCounts: number[],
  engine: Engine,
  bridgeBodies: Body[],
  bridgeCarryX: number[]
) {
  if (blockBodies.length === 0) return;
  const allBodies = Composite.allBodies(engine.world);
  const supportLabels = new Set(['ground', 'platform', 'bridge', 'block']);
  for (let i = 0; i < blockBodies.length; i += 1) {
    const body = blockBodies[i];
    const def = blockDefs[i];
    if (!def) continue;

    const pushers = new Set<number>();
    const rightPushers = new Set<number>();
    const leftPushers = new Set<number>();
    const allowedPlayer = def.allowedPlayer;
    for (let slot = 0; slot < playerSlots.length; slot += 1) {
      const player = playerSlots[slot];
      if (!player) continue;
      if (allowedPlayer !== undefined && slot !== allowedPlayer) continue;
      if (Math.abs(player.moveAxisX) < 0.2) continue;
      if (Matter.Query.collides(body, [player.body]).length === 0) continue;

      const dx = body.position.x - player.body.position.x;
      if (dx > 0 && player.moveAxisX > 0) {
        pushers.add(slot);
        rightPushers.add(slot);
      }
      if (dx < 0 && player.moveAxisX < 0) {
        pushers.add(slot);
        leftPushers.add(slot);
      }
    }

    const presentSlots: number[] = [];
    for (let s = 0; s < playerSlots.length; s += 1) if (playerSlots[s]) presentSlots.push(s);
    const propagate = (set: Set<number>, dir: 1 | -1) => {
      let changed = true;
      while (changed) {
        changed = false;
        for (const s of presentSlots) {
          if (set.has(s)) continue;
          const p = playerSlots[s]!;
          if (dir === 1 && p.moveAxisX <= 0.2) continue;
          if (dir === -1 && p.moveAxisX >= -0.2) continue;
          for (const t of set) {
            const q = playerSlots[t]!;
            if (Matter.Query.collides(p.body, [q.body]).length > 0) {
              set.add(s);
              pushers.add(s);
              changed = true;
              break;
            }
          }
        }
      }
    };
    if (rightPushers.size > 0) propagate(rightPushers, 1);
    if (leftPushers.size > 0) propagate(leftPushers, -1);

    blockPusherCounts[i] = pushers.size;
    const shouldMove =
      allowedPlayer !== undefined
        ? pushers.size > 0
        : pushers.size >= (def.required ?? 1);
    const groundCandidates = allBodies.filter(
      b => b !== body && supportLabels.has(b.label)
    );
    const regionBelow = {
      min: { x: body.bounds.min.x + 1, y: body.bounds.max.y + 1 },
      max: { x: body.bounds.max.x - 1, y: body.bounds.max.y + 6 }
    };
    const belowBodies = Query.region(groundCandidates, regionBelow);
    const grounded = belowBodies.length > 0;

    if (shouldMove && body.isStatic) {
      Matter.Body.setStatic(body, false);
    } else if (!shouldMove) {
      if (!grounded && body.isStatic) {
        Matter.Body.setStatic(body, false);
      } else if (grounded && !body.isStatic) {
        Matter.Body.setVelocity(body, { x: 0, y: body.velocity.y });
        Matter.Body.setAngularVelocity(body, 0);
        Matter.Body.setStatic(body, true);
      } else if (grounded && body.isStatic) {
        const bridgeSupport = belowBodies.find(b => b.label === 'bridge');
        if (bridgeSupport) {
          const idx = bridgeBodies.indexOf(bridgeSupport);
          const carry = idx >= 0 ? bridgeCarryX[idx] ?? 0 : 0;
          if (carry !== 0) {
            Matter.Body.setPosition(body, { x: body.position.x + carry, y: body.position.y });
            Matter.Body.setVelocity(body, { x: 0, y: body.velocity.y });
            Matter.Body.setAngularVelocity(body, 0);
          }
        }
      }
    }
  }
}
