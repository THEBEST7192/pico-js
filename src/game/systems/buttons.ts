import Matter from 'matter-js';
import type { Body } from 'matter-js';
import type { Player } from '../Player';
import type { LevelRect } from '../Game';

export type ButtonDef = LevelRect & { id: number; targetBridgeId: number | null };

export function updateButtons(
  buttonBodies: Body[],
  buttonDefs: ButtonDef[],
  playerSlots: Array<Player | null>,
  blockBodies: Body[],
  bridgeDefs: Array<LevelRect & { id: number; dx: number; dy: number; distance: number; permanent: boolean }>,
  bridgeActivated: boolean[],
  bridgeLatched: boolean[],
  buttonPressed: boolean[]
) {
  if (bridgeActivated.length > 0) {
    for (let i = 0; i < bridgeActivated.length; i += 1) bridgeActivated[i] = false;
  }
  if (buttonBodies.length === 0) return;

  const activeBridgeIds = new Set<number>();
  for (let i = 0; i < buttonBodies.length; i += 1) {
    const body = buttonBodies[i];
    const def = buttonDefs[i];
    if (!body || !def) continue;

    let pressed = false;
    for (const player of playerSlots) {
      if (!player) continue;
      if (Matter.Query.collides(body, [player.body]).length > 0) {
        pressed = true;
        break;
      }
    }

    if (!pressed && blockBodies.length > 0) {
      if (Matter.Query.collides(body, blockBodies).length > 0) pressed = true;
    }

    buttonPressed[i] = pressed;
    if (pressed && def.targetBridgeId !== null) activeBridgeIds.add(def.targetBridgeId);
  }

  if (activeBridgeIds.size === 0) return;
  for (let i = 0; i < bridgeDefs.length; i += 1) {
    const def = bridgeDefs[i];
    if (!def) continue;
    const active = activeBridgeIds.has(def.id);
    bridgeActivated[i] = active;
    if (active && def.permanent) bridgeLatched[i] = true;
  }
}
