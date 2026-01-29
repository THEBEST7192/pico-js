import Matter from 'matter-js';
import type { Body } from 'matter-js';
import type { Player } from '../Player';
import type { Engine } from 'matter-js';

export function updateKey(
  engine: Engine,
  keyBody: Body | null,
  keyCarrierSlot: number | null,
  playerSlots: Array<Player | null>,
  doorUnlocked: boolean,
  doorBody: Body | null
): { keyBody: Body | null; keyCarrierSlot: number | null; doorUnlocked: boolean } {
  if (!keyBody) return { keyBody, keyCarrierSlot, doorUnlocked };

  if (keyCarrierSlot === null) {
    for (let slot = 0; slot < playerSlots.length; slot += 1) {
      const player = playerSlots[slot];
      if (!player) continue;
      if (Matter.Query.collides(keyBody!, [player.body]).length > 0) {
        keyCarrierSlot = slot;
        break;
      }
    }
  }

  if (keyCarrierSlot !== null) {
    const carrier = playerSlots[keyCarrierSlot];
    if (!carrier) {
      keyCarrierSlot = null;
      return { keyBody, keyCarrierSlot, doorUnlocked };
    }

    Matter.Body.setPosition(keyBody, { x: carrier.body.position.x, y: carrier.body.position.y - 34 });
    Matter.Body.setVelocity(keyBody, { x: 0, y: 0 });
    Matter.Body.setAngularVelocity(keyBody, 0);

    if (!doorUnlocked && doorBody && Matter.Query.collides(doorBody, [carrier.body]).length > 0) {
      doorUnlocked = true;
      Matter.Composite.remove(engine.world, keyBody);
      keyBody = null;
      keyCarrierSlot = null;
    }
  }

  return { keyBody, keyCarrierSlot, doorUnlocked };
}
