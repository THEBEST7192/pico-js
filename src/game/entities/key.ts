import { Bodies, Composite, type Body, type Engine } from 'matter-js';

export function setKeyPoint(
  p: { x: number; y: number },
  engine: Engine,
  keyBody: Body | null,
  keyCarrierSlot: number | null,
  doorUnlocked: boolean
): { keyPoint: { x: number; y: number }; keyBody: Body; keyCarrierSlot: number | null; doorUnlocked: boolean } {
  if (keyBody) {
    Composite.remove(engine.world, keyBody);
    keyBody = null;
  }
  const keyPoint = { x: p.x, y: p.y };
  keyCarrierSlot = null;
  doorUnlocked = false;
  const newBody = Bodies.circle(keyPoint.x, keyPoint.y, 12, { isStatic: true, isSensor: true, label: 'key' });
  Composite.add(engine.world, newBody);
  return { keyPoint, keyBody: newBody, keyCarrierSlot, doorUnlocked };
}

export function removeKey(
  engine: Engine,
  keyBody: Body | null
): { keyBody: Body | null; keyPoint: null; keyCarrierSlot: null; doorUnlocked: false } {
  if (keyBody) Composite.remove(engine.world, keyBody);
  return { keyBody: null, keyPoint: null, keyCarrierSlot: null, doorUnlocked: false };
}

export function ensureKey(
  engine: Engine,
  keyPoint: { x: number; y: number } | null,
  keyBody: Body | null
): Body | null {
  if (!keyPoint) return keyBody;
  if (keyBody) return keyBody;
  const body = Bodies.circle(keyPoint.x, keyPoint.y, 12, { isStatic: true, isSensor: true, label: 'key' });
  Composite.add(engine.world, body);
  return body;
}
