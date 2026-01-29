import { Bodies, Composite, type Body, type Engine } from 'matter-js';
import type { LevelRect } from '../Game';

export function addPlatform(
  rect: LevelRect,
  platformBodies: Body[],
  levelRects: LevelRect[],
  engine: Engine,
  persistLevel: () => void
) {
  const body = Bodies.rectangle(rect.x + rect.w / 2, rect.y + rect.h / 2, rect.w, rect.h, {
    isStatic: true,
    label: 'platform'
  });
  levelRects.push(rect);
  platformBodies.push(body);
  Composite.add(engine.world, body);
  persistLevel();
}

export function removePlatformBody(
  body: Body,
  platformBodies: Body[],
  levelRects: LevelRect[],
  engine: Engine,
  persistLevel: () => void
) {
  const idx = platformBodies.indexOf(body);
  if (idx === -1) return;
  Composite.remove(engine.world, body);
  platformBodies.splice(idx, 1);
  levelRects.splice(idx, 1);
  persistLevel();
}
