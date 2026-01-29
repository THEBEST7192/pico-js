import { Bodies, Composite, type Body, type Engine } from 'matter-js';
import type { LevelRect } from '../Game';

export function addSpike(
  rect: LevelRect,
  spikeRects: LevelRect[],
  spikeBodies: Body[],
  engine: Engine,
  persistLevel: () => void
) {
  const body = Bodies.rectangle(rect.x + rect.w / 2, rect.y + rect.h / 2, rect.w, rect.h, {
    isStatic: true,
    isSensor: true,
    label: 'spike'
  });
  spikeRects.push(rect);
  spikeBodies.push(body);
  Composite.add(engine.world, body);
  persistLevel();
}

export function removeSpikeBody(
  body: Body,
  spikeBodies: Body[],
  spikeRects: LevelRect[],
  engine: Engine,
  persistLevel: () => void
) {
  const idx = spikeBodies.indexOf(body);
  if (idx === -1) return;
  Composite.remove(engine.world, body);
  spikeBodies.splice(idx, 1);
  spikeRects.splice(idx, 1);
  persistLevel();
}
