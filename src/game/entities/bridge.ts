import { Bodies, Composite, type Body, type Engine } from 'matter-js';
import type { LevelRect, BridgeDef, ButtonDef } from '../Game';

export function addBridge(
  rect: LevelRect,
  bridgeMove: { dx: number; dy: number },
  bridgeDistance: number,
  bridgePermanent: boolean,
  nextEntityId: number,
  bridgeDefs: BridgeDef[],
  bridgeBodies: Body[],
  bridgeActivated: boolean[],
  bridgeLatched: boolean[],
  bridgeHomeCenters: Array<{ x: number; y: number }>,
  bridgeCarryX: number[],
  engine: Engine,
  persistLevel: () => void
): number {
  const dx = bridgeMove.dx;
  const dy = bridgeMove.dy;
  const id = nextEntityId;
  const distance = bridgeDistance;
  const def: BridgeDef = { ...rect, id, dx, dy, distance, permanent: bridgePermanent };
  const body = Bodies.rectangle(rect.x + rect.w / 2, rect.y + rect.h / 2, rect.w, rect.h, {
    isStatic: true,
    label: 'bridge'
  });
  bridgeDefs.push(def);
  bridgeBodies.push(body);
  bridgeActivated.push(false);
  bridgeLatched.push(false);
  bridgeHomeCenters.push({ x: body.position.x, y: body.position.y });
  bridgeCarryX.push(0);
  Composite.add(engine.world, body);
  persistLevel();
  return id + 1;
}

export function removeBridgeBody(
  body: Body,
  bridgeBodies: Body[],
  bridgeDefs: BridgeDef[],
  bridgeActivated: boolean[],
  bridgeLatched: boolean[],
  bridgeHomeCenters: Array<{ x: number; y: number }>,
  bridgeCarryX: number[],
  buttonDefs: ButtonDef[],
  engine: Engine,
  persistLevel: () => void
) {
  const idx = bridgeBodies.indexOf(body);
  if (idx === -1) return;
  const id = bridgeDefs[idx]?.id;
  Composite.remove(engine.world, body);
  bridgeBodies.splice(idx, 1);
  bridgeDefs.splice(idx, 1);
  bridgeActivated.splice(idx, 1);
  bridgeLatched.splice(idx, 1);
  bridgeHomeCenters.splice(idx, 1);
  bridgeCarryX.splice(idx, 1);
  if (id !== undefined) {
    for (let i = 0; i < buttonDefs.length; i += 1) {
      if (buttonDefs[i].targetBridgeId === id) {
        buttonDefs[i].targetBridgeId = null;
      }
    }
  }
  persistLevel();
}
