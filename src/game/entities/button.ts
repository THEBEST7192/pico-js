import { Bodies, Composite, type Body, type Engine } from 'matter-js';
import type { ButtonDef } from '../Game';

export function addButton(
  p: { x: number; y: number },
  snap: (n: number) => number,
  nextEntityId: number,
  buttonDefs: ButtonDef[],
  buttonBodies: Body[],
  buttonPressed: boolean[],
  engine: Engine,
  persistLevel: () => void
): { id: number; nextEntityId: number } {
  const w = snap(40);
  const h = snap(20);
  const x = snap(p.x - w / 2);
  const y = snap(p.y - h / 2);
  const id = nextEntityId;
  const def: ButtonDef = { x, y, w, h, id, targetBridgeId: null };
  const body = Bodies.rectangle(x + w / 2, y + h / 2, w, h, {
    isStatic: true,
    isSensor: true,
    label: 'button'
  });
  buttonDefs.push(def);
  buttonBodies.push(body);
  buttonPressed.push(false);
  Composite.add(engine.world, body);
  persistLevel();
  return { id, nextEntityId: id + 1 };
}

export function removeButtonBody(
  body: Body,
  buttonBodies: Body[],
  buttonDefs: ButtonDef[],
  buttonPressed: boolean[],
  engine: Engine,
  persistLevel: () => void,
  buttonLinkingId: number | null
): number | null {
  const idx = buttonBodies.indexOf(body);
  if (idx === -1) return buttonLinkingId;
  const id = buttonDefs[idx]?.id;
  Composite.remove(engine.world, body);
  buttonBodies.splice(idx, 1);
  buttonDefs.splice(idx, 1);
  buttonPressed.splice(idx, 1);
  if (buttonLinkingId === id) buttonLinkingId = null;
  persistLevel();
  return buttonLinkingId;
}
