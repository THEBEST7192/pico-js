import { Bodies, Composite, type Body, type Engine } from 'matter-js';
import type { LevelRect } from '../Game';

export function addBlock(
  rect: LevelRect,
  required: number,
  allowedPlayer: number | null,
  blockDefs: Array<LevelRect & { required?: number; allowedPlayer?: number }>,
  blockBodies: Body[],
  blockPusherCounts: number[],
  engine: Engine,
  persistLevel: () => void
) {
  const clamped = Math.max(1, Math.min(4, Math.round(required)));
  const body = Bodies.rectangle(rect.x + rect.w / 2, rect.y + rect.h / 2, rect.w, rect.h, {
    label: 'block',
    friction: 0,
    frictionStatic: 0,
    frictionAir: 0.02,
    inertia: Infinity
  });
  const def: LevelRect & { required?: number; allowedPlayer?: number } = { ...rect };
  if (allowedPlayer !== null && Number.isFinite(allowedPlayer)) {
    def.allowedPlayer = Math.max(0, Math.min(3, Math.round(allowedPlayer)));
  } else {
    def.required = clamped;
  }
  blockDefs.push(def);
  blockBodies.push(body);
  blockPusherCounts.push(0);
  Composite.add(engine.world, body);
  persistLevel();
}

export function removeBlockBody(
  body: Body,
  blockBodies: Body[],
  blockDefs: Array<LevelRect & { required?: number; allowedPlayer?: number }>,
  blockPusherCounts: number[],
  engine: Engine,
  persistLevel: () => void
) {
  const idx = blockBodies.indexOf(body);
  if (idx === -1) return;
  Composite.remove(engine.world, body);
  blockBodies.splice(idx, 1);
  blockDefs.splice(idx, 1);
  blockPusherCounts.splice(idx, 1);
  persistLevel();
}
