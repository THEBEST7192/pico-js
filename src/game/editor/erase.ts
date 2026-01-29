import Matter from 'matter-js';
import type { Body } from 'matter-js';
import type { LevelRect, ButtonDef, BridgeDef } from '../Game';
import { removeKey } from '../entities/key';
import { removeDoor } from '../entities/door';
import { removeButtonBody } from '../entities/button';
import { removeBridgeBody } from '../entities/bridge';
import { removeBlockBody } from '../entities/block';
import { removeSpikeBody } from '../entities/spike';
import { removePlatformBody } from '../entities/platform';

export function eraseAtPoint(
  p: { x: number; y: number },
  engine: Matter.Engine,
  spawnPoint: { x: number; y: number } | null,
  keyBody: Body | null,
  doorBody: Body | null,
  buttonBodies: Body[],
  buttonDefs: ButtonDef[],
  buttonPressed: boolean[],
  bridgeBodies: Body[],
  bridgeDefs: BridgeDef[],
  bridgeActivated: boolean[],
  bridgeLatched: boolean[],
  bridgeHomeCenters: Array<{ x: number; y: number }>,
  bridgeCarryX: number[],
  blockBodies: Body[],
  blockDefs: Array<LevelRect & { required: number }>,
  blockPusherCounts: number[],
  spikeBodies: Body[],
  spikeRects: LevelRect[],
  platformBodies: Body[],
  levelRects: LevelRect[],
  persistLevel: () => void,
  buttonLinkingId: number | null
): {
  spawnPoint: { x: number; y: number } | null;
  keyBody: Body | null;
  keyPoint: { x: number; y: number } | null;
  keyCarrierSlot: number | null;
  doorUnlocked: boolean;
  doorBody: Body | null;
  doorRect: LevelRect | null;
  buttonLinkingId: number | null;
} {
  if (spawnPoint) {
    const dx = p.x - spawnPoint.x;
    const dy = p.y - spawnPoint.y;
    if (dx * dx + dy * dy <= 18 * 18) {
      spawnPoint = null;
      persistLevel();
      return {
        spawnPoint,
        keyBody,
        keyPoint: null,
        keyCarrierSlot: null,
        doorUnlocked: false,
        doorBody,
        doorRect: null,
        buttonLinkingId
      };
    }
  }
  if (keyBody) {
    const hitKey = Matter.Query.point([keyBody], p);
    if (hitKey.length > 0) {
      const res = removeKey(engine, keyBody);
      persistLevel();
      return {
        spawnPoint,
        keyBody: res.keyBody,
        keyPoint: res.keyPoint,
        keyCarrierSlot: res.keyCarrierSlot,
        doorUnlocked: res.doorUnlocked,
        doorBody,
        doorRect: null,
        buttonLinkingId
      };
    }
  }
  if (doorBody) {
    const hitDoor = Matter.Query.point([doorBody], p);
    if (hitDoor.length > 0) {
      const res = removeDoor(engine, doorBody);
      persistLevel();
      return {
        spawnPoint,
        keyBody,
        keyPoint: null,
        keyCarrierSlot: null,
        doorUnlocked: false,
        doorBody: res.doorBody,
        doorRect: res.doorRect,
        buttonLinkingId
      };
    }
  }
  const hitButtons = Matter.Query.point(buttonBodies, p);
  if (hitButtons.length > 0) {
    buttonLinkingId = removeButtonBody(hitButtons[0], buttonBodies, buttonDefs, buttonPressed, engine, persistLevel, buttonLinkingId);
    return {
      spawnPoint,
      keyBody,
      keyPoint: null,
      keyCarrierSlot: null,
      doorUnlocked: false,
      doorBody,
      doorRect: null,
      buttonLinkingId
    };
  }
  const hitBridges = Matter.Query.point(bridgeBodies, p);
  if (hitBridges.length > 0) {
    removeBridgeBody(
      hitBridges[0],
      bridgeBodies,
      bridgeDefs,
      bridgeActivated,
      bridgeLatched,
      bridgeHomeCenters,
      bridgeCarryX,
      buttonDefs,
      engine,
      persistLevel
    );
    return {
      spawnPoint,
      keyBody,
      keyPoint: null,
      keyCarrierSlot: null,
      doorUnlocked: false,
      doorBody,
      doorRect: null,
      buttonLinkingId
    };
  }
  const hitBlocks = Matter.Query.point(blockBodies, p);
  if (hitBlocks.length > 0) {
    removeBlockBody(hitBlocks[0], blockBodies, blockDefs, blockPusherCounts, engine, persistLevel);
    return {
      spawnPoint,
      keyBody,
      keyPoint: null,
      keyCarrierSlot: null,
      doorUnlocked: false,
      doorBody,
      doorRect: null,
      buttonLinkingId
    };
  }
  const hitSpikes = Matter.Query.point(spikeBodies, p);
  if (hitSpikes.length > 0) {
    removeSpikeBody(hitSpikes[0], spikeBodies, spikeRects, engine, persistLevel);
    return {
      spawnPoint,
      keyBody,
      keyPoint: null,
      keyCarrierSlot: null,
      doorUnlocked: false,
      doorBody,
      doorRect: null,
      buttonLinkingId
    };
  }
  const hitPlatforms = Matter.Query.point(platformBodies, p);
  if (hitPlatforms.length > 0) {
    removePlatformBody(hitPlatforms[0], platformBodies, levelRects, engine, persistLevel);
  }
  return {
    spawnPoint,
    keyBody,
    keyPoint: null,
    keyCarrierSlot: null,
    doorUnlocked: false,
    doorBody,
    doorRect: null,
    buttonLinkingId
  };
}
