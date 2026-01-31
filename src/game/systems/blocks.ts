import Matter, { Composite, Query, type Body, type Engine, Events } from 'matter-js';
import type { Player } from '../Player';
import type { LevelRect } from '../Game';

type BodyWithPrev = Body & { positionPrev: { x: number; y: number } };

export function updateBlocks(
  blockBodies: Body[],
  blockDefs: Array<LevelRect & { required?: number; allowedPlayer?: number }>,
  playerSlots: Array<Player | null>,
  blockPusherCounts: number[],
  engine: Engine
) {
  if (blockBodies.length === 0) return;
  const allBodies = Composite.allBodies(engine.world);
  const supportLabels = new Set(['ground', 'platform', 'bridge', 'block', 'player']);

  // Sort indices by Y position (descending) to process bottom blocks first
  const indices = blockBodies.map((_, i) => i);
  indices.sort((a, b) => blockBodies[b].position.y - blockBodies[a].position.y);

  for (const i of indices) {
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
      min: { x: body.bounds.min.x, y: body.bounds.max.y },
      max: { x: body.bounds.max.x, y: body.bounds.max.y + 8 }
    };
    const belowBodies = Query.region(groundCandidates, regionBelow);
    let bestGap: number | null = null;
    for (const support of belowBodies) {
      const gap = support.bounds.min.y - body.bounds.max.y;
      if (Math.abs(gap) > 8) continue;
      if (bestGap === null || Math.abs(gap) < Math.abs(bestGap)) {
        bestGap = gap;
      }
    }
    const grounded = bestGap !== null && Math.abs(bestGap) <= 1;

    if (shouldMove) {
      if (body.isStatic) {
        Matter.Body.setStatic(body, false);
      }
    } else {
      if (!grounded && body.isStatic) {
        Matter.Body.setStatic(body, false);
      } else if (grounded && !body.isStatic) {
        if (belowBodies.length > 0) {
          let bestSupport: Body | null = null;
          let bestSupportGap: number | null = null;
          const bodyHeight = body.bounds.max.y - body.bounds.min.y;
          const bodyBottom = body.position.y + bodyHeight / 2;
          for (const support of belowBodies) {
            const supportTop = support.bounds.min.y;
            const gap = supportTop - bodyBottom;
            if (Math.abs(gap) > 12) continue;
            if (bestSupportGap === null || Math.abs(gap) < Math.abs(bestSupportGap)) {
              bestSupportGap = gap;
              bestSupport = support;
            }
          }
          if (bestSupport && bestSupportGap !== null) {
            const supportTop = bestSupport.bounds.min.y;
            const targetY = supportTop - bodyHeight / 2;
            Matter.Body.setPosition(body, { x: body.position.x, y: targetY });
            const b = body as unknown as BodyWithPrev;
            b.positionPrev.x = b.position.x;
            b.positionPrev.y = b.position.y;
          }
        }
        Matter.Body.setVelocity(body, { x: 0, y: body.velocity.y });
        Matter.Body.setAngularVelocity(body, 0);
        Matter.Body.setStatic(body, true);
      }
    }
  }
}

export function initBlockCarrying(engine: Engine, blockBodies: Body[]) {
  const onAfterUpdate = () => {
    if (blockBodies.length === 0) return;
    const allBodies = Composite.allBodies(engine.world);
    const supportLabels = new Set(['ground', 'platform', 'bridge', 'block', 'player']);

    for (const body of blockBodies) {
      if (!body.isStatic) {
        const b = body as unknown as BodyWithPrev;
        const delta = b.position.x - b.positionPrev.x;
        body.plugin.carryX = Math.abs(delta) > 0.01 ? delta : 0;
        body.plugin.supportId = undefined;
        body.plugin.supportOffsetX = undefined;
        continue;
      }

      const groundCandidates = allBodies.filter(
        b => b !== body && supportLabels.has(b.label)
      );
      const regionBelow = {
        min: { x: body.bounds.min.x, y: body.bounds.max.y },
        max: { x: body.bounds.max.x, y: body.bounds.max.y + 8 }
      };
      const belowBodies = Query.region(groundCandidates, regionBelow);
      if (belowBodies.length === 0) {
        body.plugin.carryX = 0;
        body.plugin.supportId = undefined;
        body.plugin.supportOffsetX = undefined;
        continue;
      }

      belowBodies.sort((a, b) => b.position.y - a.position.y);
      const support = belowBodies[0];
      let targetX = body.position.x;
      let carry = 0;
      if (support.label === 'block') {
        const supportId = support.id;
        const hasSameSupport = body.plugin.supportId === supportId;
        let offset = hasSameSupport ? body.plugin.supportOffsetX : undefined;
        if (!Number.isFinite(offset)) {
          offset = body.position.x - support.position.x;
          body.plugin.supportId = supportId;
          body.plugin.supportOffsetX = offset;
        }
        targetX = hasSameSupport ? support.position.x + offset : body.position.x;
        carry = targetX - body.position.x;
      } else {
        body.plugin.supportId = undefined;
        body.plugin.supportOffsetX = undefined;
        const s = support as unknown as BodyWithPrev;
        if (support.label === 'bridge') {
          carry = support.plugin.carryX || 0;
        } else {
          carry = support.isStatic ? support.plugin.carryX || 0 : s.position.x - s.positionPrev.x;
        }
        targetX = body.position.x + carry;
      }

      if (Math.abs(carry) > 0.0001) {
        Matter.Body.setPosition(body, { x: targetX, y: body.position.y });
        Matter.Body.setVelocity(body, { x: 0, y: body.velocity.y });
        Matter.Body.setAngularVelocity(body, 0);
        const b = body as unknown as BodyWithPrev;
        b.positionPrev.x = b.position.x;
        b.positionPrev.y = b.position.y;
        body.plugin.carryX = carry;
      } else {
        body.plugin.carryX = 0;
      }
    }
  };

  Events.on(engine, 'afterUpdate', onAfterUpdate);

  return () => {
    Events.off(engine, 'afterUpdate', onAfterUpdate);
  };
}
