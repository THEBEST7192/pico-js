import { Bodies, Composite, type Body, type Engine } from 'matter-js';
import type { LevelRect } from '../Game';

export function setDoor(
  rect: LevelRect,
  engine: Engine
): Body {
  const body = Bodies.rectangle(rect.x + rect.w / 2, rect.y + rect.h / 2, rect.w, rect.h, {
    isStatic: true,
    isSensor: true,
    label: 'door'
  });
  Composite.add(engine.world, body);
  return body;
}

export function removeDoor(engine: Engine, doorBody: Body | null): { doorBody: null; doorRect: null } {
  if (!doorBody) return { doorBody: null, doorRect: null };
  Composite.remove(engine.world, doorBody);
  return { doorBody: null, doorRect: null };
}

export function ensureDoor(
  doorBody: Body | null,
  levelConfig: { width: number; height: number },
  snap: (n: number) => number,
  setDoorRect: (rect: LevelRect) => void
) {
  if (doorBody) return;
  const defaultRect: LevelRect = {
    x: snap(levelConfig.width - 100),
    y: snap(levelConfig.height - 120),
    w: snap(40),
    h: snap(80)
  };
  setDoorRect(defaultRect);
}
