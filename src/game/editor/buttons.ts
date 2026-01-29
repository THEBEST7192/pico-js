import Matter from 'matter-js';
import type { Body } from 'matter-js';
import type { ButtonDef, BridgeDef } from '../Game';
import { addButton } from '../entities/button';

export function handleButtonClick(
  p: { x: number; y: number },
  buttonBodies: Body[],
  buttonDefs: ButtonDef[],
  bridgeBodies: Body[],
  bridgeDefs: BridgeDef[],
  snap: (n: number) => number,
  nextEntityId: number,
  engine: Matter.Engine,
  persistLevel: () => void,
  buttonLinkingId: number | null
): { buttonLinkingId: number | null; nextEntityId: number } {
  const hitButtons = Matter.Query.point(buttonBodies, p);
  if (hitButtons.length > 0) {
    const idx = buttonBodies.indexOf(hitButtons[0]);
    const def = idx >= 0 ? buttonDefs[idx] : undefined;
    if (def) {
      buttonLinkingId = def.id;
      persistLevel();
      return { buttonLinkingId, nextEntityId };
    }
  }

  if (buttonLinkingId === null) {
    const res = addButton(p, snap, nextEntityId, buttonDefs, buttonBodies, [], engine, persistLevel);
    return { buttonLinkingId: res.id, nextEntityId: res.nextEntityId };
  }

  const hitBridges = Matter.Query.point(bridgeBodies, p);
  if (hitBridges.length > 0) {
    const idx = bridgeBodies.indexOf(hitBridges[0]);
    const bridge = idx >= 0 ? bridgeDefs[idx] : undefined;
    if (bridge) {
      const btn = buttonDefs.find(b => b.id === buttonLinkingId);
      if (btn) btn.targetBridgeId = bridge.id;
      buttonLinkingId = null;
      persistLevel();
      return { buttonLinkingId, nextEntityId };
    }
  }

  buttonLinkingId = null;
  persistLevel();
  return { buttonLinkingId, nextEntityId };
}
