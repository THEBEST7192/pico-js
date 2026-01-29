import Matter from 'matter-js';
import { drawButton } from './render/button';
import { drawKey } from './render/key';
import { drawDoor } from './render/door';
import { drawBlock } from './render/block';
import { drawBridge } from './render/bridge';
import { drawSpike } from './render/spike';
import { drawPlatform } from './render/platform';
import { drawSpawn } from './render/spawn';
import { updateBlocks as sysUpdateBlocks } from './systems/blocks';
import { updateButtons as sysUpdateButtons } from './systems/buttons';
import { updateBridges as sysUpdateBridges } from './systems/bridges';
import { updateDoor as sysUpdateDoor } from './systems/door';
import { updateKey as sysUpdateKey } from './systems/key';
import { updateSpikes as sysUpdateSpikes } from './systems/spikes';
import { addPlatform as addPlatformEnt } from './entities/platform';
import { addBlock as addBlockEnt } from './entities/block';
import { addBridge as addBridgeEnt } from './entities/bridge';
import { addSpike as addSpikeEnt } from './entities/spike';
import { setSpawnPoint as setSpawnPointEnt, ensureSpawn as ensureSpawnEnt, getSpawnForSlot as getSpawnForSlotEnt } from './entities/spawn';
import { setKeyPoint as setKeyPointEnt, ensureKey as ensureKeyEnt } from './entities/key';
import { setDoor as setDoorEnt, ensureDoor as ensureDoorEnt } from './entities/door';
import { handleButtonClick as handleButtonClickEditor } from './editor/buttons';
import { eraseAtPoint as eraseAtPointEditor } from './editor/erase';
import { Player } from './Player';

const { Engine, Runner, Bodies, Composite } = Matter;

let engine: Matter.Engine;
let runner: Matter.Runner;
let playerSlots: Array<Player | null> = [null, null, null, null];
let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;

const PLAYER_COLORS = ['#ff4d4d', '#4dff4d', '#4d4dff', '#ffff4d'];
const LEVEL_STORAGE_KEY = 'pico_level_v1';
const GRID_SIZE = 20;

export type LevelRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

type LevelConfig = {
  width: number;
  height: number;
};

const CAMERA_SIZE: LevelConfig = { width: 960, height: 540 };

export type BridgeDef = LevelRect & { id: number; dx: number; dy: number; distance: number; permanent: boolean };
export type ButtonDef = LevelRect & { id: number; targetBridgeId: number | null };

type LevelState = {
  config: LevelConfig;
  platforms: LevelRect[];
  door: LevelRect | null;
  spawn: { x: number; y: number } | null;
  key: { x: number; y: number } | null;
  blocks: Array<LevelRect & { required: number }>;
  bridges: BridgeDef[];
  buttons: ButtonDef[];
  spikes: LevelRect[];
};

export type EditorTool = 'platform' | 'door' | 'spawn' | 'key' | 'block' | 'bridge' | 'button' | 'spike' | 'erase';

export type GameApi = {
  toggleEditor: () => boolean;
  setEditorEnabled: (enabled: boolean) => boolean;
  getEditorEnabled: () => boolean;
  setEditorTool: (tool: EditorTool) => EditorTool;
  getEditorTool: () => EditorTool;
  setBlockRequired: (required: number) => number;
  getBlockRequired: () => number;
  setLevelSize: (width: number, height: number) => LevelConfig;
  getLevelSize: () => LevelConfig;
  setBridgeMove: (dx: number, dy: number) => { dx: number; dy: number };
  getBridgeMove: () => { dx: number; dy: number };
  setBridgeDistance: (distance: number) => number;
  getBridgeDistance: () => number;
  setBridgePermanent: (permanent: boolean) => boolean;
  getBridgePermanent: () => boolean;
  undo: () => boolean;
  redo: () => boolean;
  exportLevel: () => string;
  importLevel: (json: string) => void;
  saveLevel: () => void;
  loadLevel: () => void;
  clearLevel: () => void;
};

let editorEnabled = false;
let editorTool: EditorTool = 'platform';
let levelRects: LevelRect[] = [];
let platformBodies: Matter.Body[] = [];
let doorRect: LevelRect | null = null;
let doorBody: Matter.Body | null = null;
let spawnPoint: { x: number; y: number } | null = null;
let keyPoint: { x: number; y: number } | null = null;
let keyBody: Matter.Body | null = null;
let keyCarrierSlot: number | null = null;
let doorUnlocked = false;
let levelConfig: LevelConfig = { width: 0, height: 0 };
let boundaryBodies: Matter.Body[] = [];
let camera = { x: 0, y: 0 };
let editorZoom = 1;
let blockDefs: Array<LevelRect & { required: number }> = [];
let blockBodies: Matter.Body[] = [];
let blockPusherCounts: number[] = [];
let blockRequired = 2;
let bridgeDefs: BridgeDef[] = [];
let bridgeBodies: Matter.Body[] = [];
let bridgeActivated: boolean[] = [];
let bridgeLatched: boolean[] = [];
let bridgeHomeCenters: Array<{ x: number; y: number }> = [];
let bridgeCarryX: number[] = [];
let buttonDefs: ButtonDef[] = [];
let buttonBodies: Matter.Body[] = [];
let buttonPressed: boolean[] = [];
let buttonLinkingId: number | null = null;
let nextEntityId = 1;
let bridgeMove = { dx: 1, dy: 0 };
let bridgeDistance = 200;
let bridgePermanent = false;
let spikeRects: LevelRect[] = [];
let spikeBodies: Matter.Body[] = [];
let levelCompleted = false;
let completionFrames = 0;
let dragStart: { x: number; y: number } | null = null;
let dragCurrent: { x: number; y: number } | null = null;
let panLast: { x: number; y: number } | null = null;
let mouseDownButton: number | null = null;
const editorPanKeys = new Set<string>();
let undoStack: string[] = [];
let redoStack: string[] = [];
let suppressHistory = false;

function setDoorRectLocal(rect: LevelRect) {
  doorRect = rect;
  doorBody = setDoorEnt(rect, engine);
}

export function initGame(canvasElement: HTMLCanvasElement): { destroy: () => void; api: GameApi } {
  canvas = canvasElement;
  ctx = canvas.getContext('2d')!;

  canvas.width = CAMERA_SIZE.width;
  canvas.height = CAMERA_SIZE.height;
  levelConfig = { width: snap(CAMERA_SIZE.width), height: snap(CAMERA_SIZE.height) };
  camera = { x: 0, y: 0 };
  editorZoom = 1;

  // Create engine
  engine = Engine.create();
  
  // Create runner
  runner = Runner.create();
  Runner.run(runner, engine);

  rebuildBounds();

  suppressHistory = true;
  loadLevelFromStorage();
  const setDoorRectLocal = (rect: LevelRect) => {
    doorRect = rect;
    doorBody = setDoorEnt(rect, engine);
  };
  ensureDoorEnt(doorBody, levelConfig, snap, setDoorRectLocal);
  spawnPoint = ensureSpawnEnt(spawnPoint, levelConfig, snap);
  keyBody = ensureKeyEnt(engine, keyPoint, keyBody);
  suppressHistory = false;
  undoStack = [];
  redoStack = [];
  pushHistorySnapshot();

  // Handle Gamepad connection
  const handleGamepadConnected = (e: GamepadEvent) => {
    addPlayer(e.gamepad);
  };

  const handleGamepadDisconnected = (e: GamepadEvent) => {
    console.log(`Player ${e.gamepad.index} disconnected!`);
    let slot = playerSlots.findIndex(p => p?.gamepadIndex === e.gamepad.index);
    if (slot === -1) {
      slot = playerSlots.findIndex(p => p?.gamepadId === e.gamepad.id);
    }
    if (slot === -1) return;

    const existing = playerSlots[slot];
    if (!existing) return;

    Composite.remove(engine.world, existing.body);
    playerSlots[slot] = null;
  };

  const addPlayer = (gp: Gamepad) => {
    if (playerSlots.some(p => p?.gamepadIndex === gp.index)) return;

    const firstEmptySlot = playerSlots.findIndex(p => p === null);
    const slot = firstEmptySlot;
    if (slot === -1 || slot === undefined || slot < 0 || slot > 3) return;
    if (playerSlots[slot]) return;

    console.log(`Player ${gp.index} connected!`);
    const spawn = getSpawnForSlotEnt(slot, spawnPoint, canvas, snap);
    const newPlayer = new Player(
      gp.index,
      gp.id,
      spawn.x,
      spawn.y,
      PLAYER_COLORS[slot]
    );
    playerSlots[slot] = newPlayer;
    Composite.add(engine.world, newPlayer.body);
  };

  window.addEventListener("gamepadconnected", handleGamepadConnected);
  window.addEventListener("gamepaddisconnected", handleGamepadDisconnected);

  // Initial check for already connected gamepads
  const initialGamepads = navigator.getGamepads();
  for (const gp of initialGamepads) {
    if (gp) addPlayer(gp);
  }

  const handleMouseDown = (e: MouseEvent) => {
    if (!editorEnabled) return;
    mouseDownButton = e.button;
    if (e.button === 1) {
      panLast = toCanvasPointRaw(e);
      return;
    }
    if (e.button !== 0) return;
    const p = toCanvasPoint(e);
    if (editorTool === 'button') {
      const res = handleButtonClickEditor(
        p,
        buttonBodies,
        buttonDefs,
        bridgeBodies,
        bridgeDefs,
        snap,
        nextEntityId,
        engine,
        persistLevel,
        buttonLinkingId
      );
      buttonLinkingId = res.buttonLinkingId;
      nextEntityId = res.nextEntityId;
      return;
    }
    if (editorTool === 'erase') {
      const res = eraseAtPointEditor(
        p,
        engine,
        spawnPoint,
        keyBody,
        doorBody,
        buttonBodies,
        buttonDefs,
        buttonPressed,
        bridgeBodies,
        bridgeDefs,
        bridgeActivated,
        bridgeLatched,
        bridgeHomeCenters,
        bridgeCarryX,
        blockBodies,
        blockDefs,
        blockPusherCounts,
        spikeBodies,
        spikeRects,
        platformBodies,
        levelRects,
        persistLevel,
        buttonLinkingId
      );
      spawnPoint = res.spawnPoint;
      keyBody = res.keyBody;
      doorBody = res.doorBody;
      doorRect = res.doorRect;
      buttonLinkingId = res.buttonLinkingId;
      return;
    }
    if (editorTool === 'spawn') {
      spawnPoint = setSpawnPointEnt(p);
      persistLevel();
      return;
    }
    if (editorTool === 'key') {
      const res = setKeyPointEnt(p, engine, keyBody, keyCarrierSlot, doorUnlocked);
      keyPoint = res.keyPoint;
      keyBody = res.keyBody;
      keyCarrierSlot = res.keyCarrierSlot;
      doorUnlocked = res.doorUnlocked;
      persistLevel();
      return;
    }
    dragStart = p;
    dragCurrent = p;
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!editorEnabled) return;
    if (mouseDownButton === 1 && panLast) {
      const p = toCanvasPointRaw(e);
      camera.x += (panLast.x - p.x) / editorZoom;
      camera.y += (panLast.y - p.y) / editorZoom;
      panLast = p;
      clampCamera();
      return;
    }
    if (mouseDownButton !== 0) return;
    if (!dragStart) return;
    dragCurrent = toCanvasPoint(e);
  };

  const handleMouseUp = () => {
    if (!editorEnabled) return;
    if (mouseDownButton !== 0) {
      panLast = null;
      mouseDownButton = null;
      return;
    }
    mouseDownButton = null;
    if (!dragStart || !dragCurrent) {
      dragStart = null;
      dragCurrent = null;
      return;
    }

    const rect = normalizeRect(dragStart, dragCurrent);
    dragStart = null;
    dragCurrent = null;

    if (rect.w < GRID_SIZE || rect.h < GRID_SIZE) return;
    if (editorTool === 'door') {
      if (doorBody) {
        Composite.remove(engine.world, doorBody);
        doorBody = null;
      }
      doorRect = rect;
      doorBody = setDoorEnt(rect, engine);
      persistLevel();
      return;
    }
    if (editorTool === 'platform') {
      addPlatformEnt(rect, platformBodies, levelRects, engine, persistLevel);
      return;
    }
    if (editorTool === 'block') {
      addBlockEnt(rect, blockRequired, blockDefs, blockBodies, blockPusherCounts, engine, persistLevel);
      return;
    }
    if (editorTool === 'bridge') {
      nextEntityId = addBridgeEnt(
        rect,
        bridgeMove,
        bridgeDistance,
        bridgePermanent,
        nextEntityId,
        bridgeDefs,
        bridgeBodies,
        bridgeActivated,
        bridgeLatched,
        bridgeHomeCenters,
        bridgeCarryX,
        engine,
        persistLevel
      );
      return;
    }
    if (editorTool === 'spike') {
      addSpikeEnt(rect, spikeRects, spikeBodies, engine, persistLevel);
      return;
    }
  };

  const handleContextMenu = (e: MouseEvent) => {
    if (!editorEnabled) return;
    e.preventDefault();
    const p = toCanvasPoint(e);
    const res = eraseAtPointEditor(
      p,
      engine,
      spawnPoint,
      keyBody,
      doorBody,
      buttonBodies,
      buttonDefs,
      buttonPressed,
      bridgeBodies,
      bridgeDefs,
      bridgeActivated,
      bridgeLatched,
      bridgeHomeCenters,
      bridgeCarryX,
      blockBodies,
      blockDefs,
      blockPusherCounts,
      spikeBodies,
      spikeRects,
      platformBodies,
      levelRects,
      persistLevel,
      buttonLinkingId
    );
    spawnPoint = res.spawnPoint;
    keyBody = res.keyBody;
    doorBody = res.doorBody;
    doorRect = res.doorRect;
    buttonLinkingId = res.buttonLinkingId;
  };

  const handleWheel = (e: WheelEvent) => {
    if (!editorEnabled) return;
    e.preventDefault();

    const mouseCanvas = toCanvasPointRawFromEvent(e);

    if (e.shiftKey) {
      const prevZoom = editorZoom;
      const zoomFactor = Math.pow(1.0015, -e.deltaY);
      const nextZoom = Math.max(0.25, Math.min(2.5, prevZoom * zoomFactor));
      if (Math.abs(nextZoom - prevZoom) < 0.00001) return;

      const worldX = mouseCanvas.x / prevZoom + camera.x;
      const worldY = mouseCanvas.y / prevZoom + camera.y;
      editorZoom = nextZoom;
      camera.x = worldX - mouseCanvas.x / editorZoom;
      camera.y = worldY - mouseCanvas.y / editorZoom;
      clampCamera();
      return;
    }

    let dx = e.deltaX;
    let dy = e.deltaY;
    if (e.altKey && dx === 0) {
      dx = dy;
      dy = 0;
    }

    camera.x += dx / editorZoom;
    camera.y += dy / editorZoom;
    clampCamera();
  };

  const performUndo = () => {
    if (undoStack.length <= 1) return false;
    const current = undoStack.pop();
    if (!current) return false;
    redoStack.push(current);
    const prev = undoStack[undoStack.length - 1];
    if (!prev) return false;
    suppressHistory = true;
    loadLevelFromJson(prev);
    suppressHistory = false;
    return true;
  };

  const performRedo = () => {
    const next = redoStack.pop();
    if (!next) return false;
    undoStack.push(next);
    suppressHistory = true;
    loadLevelFromJson(next);
    suppressHistory = false;
    return true;
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (!editorEnabled) return;
    if (
      e.target instanceof HTMLElement &&
      (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')
    ) {
      return;
    }

    const mod = e.ctrlKey || e.metaKey;
    if (mod && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      if (e.shiftKey) {
        performRedo();
      } else {
        performUndo();
      }
      return;
    }

    if (mod && (e.key === 'y' || e.key === 'Y')) {
      e.preventDefault();
      performRedo();
      return;
    }

    editorPanKeys.add(e.key);
  };

  const handleKeyUp = (e: KeyboardEvent) => {
    if (!editorEnabled) return;
    editorPanKeys.delete(e.key);
  };

  canvas.addEventListener('mousedown', handleMouseDown);
  canvas.addEventListener('mousemove', handleMouseMove);
  canvas.addEventListener('mouseup', handleMouseUp);
  canvas.addEventListener('contextmenu', handleContextMenu);
  canvas.addEventListener('wheel', handleWheel, { passive: false });
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);

  const api: GameApi = {
    toggleEditor: () => {
      editorEnabled = !editorEnabled;
      dragStart = null;
      dragCurrent = null;
      panLast = null;
      editorPanKeys.clear();
      buttonLinkingId = null;
      return editorEnabled;
    },
    setEditorEnabled: (enabled: boolean) => {
      editorEnabled = enabled;
      dragStart = null;
      dragCurrent = null;
      panLast = null;
      editorPanKeys.clear();
      buttonLinkingId = null;
      return editorEnabled;
    },
    getEditorEnabled: () => editorEnabled,
    setEditorTool: (tool: EditorTool) => {
      editorTool = tool;
      dragStart = null;
      dragCurrent = null;
      panLast = null;
      editorPanKeys.clear();
      buttonLinkingId = null;
      return editorTool;
    },
    getEditorTool: () => editorTool,
    setBlockRequired: (required: number) => {
      if (!Number.isFinite(required)) return blockRequired;
      const clamped = Math.max(1, Math.min(4, Math.round(required)));
      blockRequired = clamped;
      return blockRequired;
    },
    getBlockRequired: () => blockRequired,
    setLevelSize: (width: number, height: number) => {
      const nextWidth = snap(Math.max(GRID_SIZE * 10, Math.round(width)));
      const nextHeight = snap(Math.max(GRID_SIZE * 8, Math.round(height)));
      levelConfig = { width: nextWidth, height: nextHeight };
      rebuildBounds();
      persistLevel();
      return levelConfig;
    },
    getLevelSize: () => levelConfig,
    setBridgeMove: (dx: number, dy: number) => {
      const nx = Math.round(dx);
      const ny = Math.round(dy);
      if (
        (nx === 1 && ny === 0) ||
        (nx === -1 && ny === 0) ||
        (nx === 0 && ny === 1) ||
        (nx === 0 && ny === -1)
      ) {
        bridgeMove = { dx: nx, dy: ny };
      }
      return bridgeMove;
    },
    getBridgeMove: () => bridgeMove,
    setBridgeDistance: (distance: number) => {
      if (!Number.isFinite(distance)) return bridgeDistance;
      const next = snap(Math.max(0, Math.round(distance)));
      bridgeDistance = next;
      return bridgeDistance;
    },
    getBridgeDistance: () => bridgeDistance,
    setBridgePermanent: (permanent: boolean) => {
      bridgePermanent = Boolean(permanent);
      return bridgePermanent;
    },
    getBridgePermanent: () => bridgePermanent,
    undo: () => performUndo(),
    redo: () => performRedo(),
    exportLevel: () =>
      JSON.stringify(
        {
          config: levelConfig,
          platforms: levelRects,
          door: doorRect,
          spawn: spawnPoint,
          key: keyPoint,
          blocks: blockDefs,
          bridges: bridgeDefs,
          buttons: buttonDefs,
          spikes: spikeRects
        } satisfies LevelState
      ),
    importLevel: (json: string) => {
      loadLevelFromJson(json);
    },
    saveLevel: () => {
      persistLevel();
    },
    loadLevel: () => {
      loadLevelFromStorage();
    },
    clearLevel: () => {
      clearLevelData();
    }
  };

  // Game Loop
  const update = () => {
    updateInput();
    checkGrounding();
    {
      const next = sysUpdateKey(engine, keyBody, keyCarrierSlot, playerSlots, doorUnlocked, doorBody);
      keyBody = next.keyBody;
      keyCarrierSlot = next.keyCarrierSlot;
      doorUnlocked = next.doorUnlocked;
    }
    sysUpdateBlocks(blockBodies, blockDefs, playerSlots, blockPusherCounts, engine, bridgeBodies, bridgeCarryX);
    sysUpdateButtons(buttonBodies, buttonDefs, playerSlots, blockBodies, bridgeDefs, bridgeActivated, bridgeLatched, buttonPressed);
    sysUpdateBridges(bridgeBodies, bridgeDefs, bridgeHomeCenters, bridgeActivated, bridgeLatched, bridgeCarryX, blockBodies);
    {
      const next = sysUpdateDoor(doorBody, keyPoint, doorUnlocked, playerSlots, levelCompleted, completionFrames);
      levelCompleted = next.levelCompleted;
      completionFrames = next.completionFrames;
    }
    sysUpdateSpikes(spikeBodies, playerSlots, respawnAllPlayers);
    updateCameraFollow();
    updateEditorCameraPan();
    
    // Draw
    draw();
    
    requestAnimationFrame(update);
  };

  requestAnimationFrame(update);

  // Cleanup function
  const destroy = () => {
    window.removeEventListener("gamepadconnected", handleGamepadConnected);
    window.removeEventListener("gamepaddisconnected", handleGamepadDisconnected);
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('keyup', handleKeyUp);
    canvas.removeEventListener('mousedown', handleMouseDown);
    canvas.removeEventListener('mousemove', handleMouseMove);
    canvas.removeEventListener('mouseup', handleMouseUp);
    canvas.removeEventListener('contextmenu', handleContextMenu);
    canvas.removeEventListener('wheel', handleWheel);
    Runner.stop(runner);
    Engine.clear(engine);
    playerSlots = [null, null, null, null];
  };

  return { destroy, api };
}

function updateInput() {
  const gamepads = navigator.getGamepads();
  const usedIndices = new Set<number>();

  for (const player of playerSlots) {
    if (!player) continue;

    const direct = gamepads[player.gamepadIndex];
    if (direct && direct.id === player.gamepadId) {
      usedIndices.add(direct.index);
      player.handleInput(direct);
      continue;
    }

    const candidates = gamepads.filter(
      (gp): gp is Gamepad => gp !== null && gp.id === player.gamepadId && !usedIndices.has(gp.index)
    );
    if (candidates.length > 0) {
      const best = candidates.reduce((prev, curr) => {
        const prevDist = Math.abs(prev.index - player.gamepadIndex);
        const currDist = Math.abs(curr.index - player.gamepadIndex);
        return currDist < prevDist ? curr : prev;
      });

      player.gamepadIndex = best.index;
      usedIndices.add(best.index);
      player.handleInput(best);
      continue;
    }

    if (direct && !usedIndices.has(direct.index)) {
      usedIndices.add(direct.index);
      player.handleInput(direct);
    }
  }
}

function updateCameraFollow() {
  if (editorEnabled) return;
  const activePlayers = playerSlots.filter((p): p is Player => Boolean(p));
  if (activePlayers.length === 0) {
    camera = { x: 0, y: 0 };
    clampCamera();
    return;
  }

  const avg = activePlayers.reduce(
    (acc, p) => ({ x: acc.x + p.body.position.x, y: acc.y + p.body.position.y }),
    { x: 0, y: 0 }
  );
  const centerX = avg.x / activePlayers.length;
  const centerY = avg.y / activePlayers.length;
  const targetX = centerX - canvas.width / 2;
  const targetY = centerY - canvas.height / 2;

  camera.x += (targetX - camera.x) * 0.12;
  camera.y += (targetY - camera.y) * 0.12;
  clampCamera();
}

function updateEditorCameraPan() {
  if (!editorEnabled) return;
  if (editorPanKeys.size === 0) return;

  const speed = 14 / editorZoom;
  const has = (k: string) => editorPanKeys.has(k);

  let dx = 0;
  let dy = 0;

  if (has('ArrowLeft') || has('a') || has('A')) dx -= speed;
  if (has('ArrowRight') || has('d') || has('D')) dx += speed;
  if (has('ArrowUp') || has('w') || has('W')) dy -= speed;
  if (has('ArrowDown') || has('s') || has('S')) dy += speed;

  if (dx === 0 && dy === 0) return;
  camera.x += dx;
  camera.y += dy;
  clampCamera();
}

function checkGrounding() {
  // Simple grounding check using Matter.Query
  playerSlots.forEach(player => {
    if (!player) return;
    const bodies = Composite.allBodies(engine.world);
    const groundBodies = bodies.filter(
      b =>
        b !== player.body &&
        (b.label === 'ground' ||
          b.label === 'platform' ||
          b.label === 'player' ||
          b.label === 'block' ||
          b.label === 'bridge')
    );
    
    // Check slightly below the player
    const regionBelow = {
      min: { x: player.body.position.x - 18, y: player.body.position.y + 21 },
      max: { x: player.body.position.x + 18, y: player.body.position.y + 25 }
    };
    const belowHits = Matter.Query.region(groundBodies, regionBelow);
    const isGrounded = belowHits.length > 0;

    const otherPlayers = playerSlots.filter((p): p is Player => Boolean(p) && p !== player);
    const playerContacts = Matter.Query.collides(player.body, otherPlayers.map(p => p.body));
    const hasPlayerAbove = playerContacts.some(c => {
      const other = c.bodyA === player.body ? c.bodyB : c.bodyA;
      return other.label === 'player' && other.position.y < player.body.position.y - 5;
    });

    const supportPlayer = playerContacts
      .map(c => (c.bodyA === player.body ? c.bodyB : c.bodyA))
      .filter(b => b.label === 'player' && b.position.y > player.body.position.y + 5)
      .sort((a, b) => b.position.y - a.position.y)[0];
    const bridgeBelow = belowHits.find(b => b.label === 'bridge');
    let carryX = 0;
    if (supportPlayer) {
      carryX = supportPlayer.velocity.x;
    } else if (bridgeBelow) {
      const idx = bridgeBodies.indexOf(bridgeBelow);
      carryX = idx >= 0 ? bridgeCarryX[idx] ?? 0 : 0;
    }
    const pushingBlock =
      blockBodies.some(b => {
        if (Matter.Query.collides(player.body, [b]).length === 0) return false;
        const dx = b.position.x - player.body.position.x;
        if (dx > 0 && player.moveAxisX > 0.2) return true;
        if (dx > 0 && player.moveAxisX > 0.2) return true;
        if (dx < 0 && player.moveAxisX < -0.2) return true;
        return false;
      });
    const pushSlowdown = pushingBlock ? 0.6 : 1;
    player.update(isGrounded, isGrounded && !hasPlayerAbove, carryX, pushSlowdown);
  });
}

function draw() {
  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw static bodies (walls/platforms)
  const bodies = Composite.allBodies(engine.world);
  const zoom = editorEnabled ? editorZoom : 1;
  ctx.save();
  ctx.scale(zoom, zoom);
  ctx.translate(-camera.x, -camera.y);

  bodies.forEach(body => {
    if (body.isStatic || body.label === 'block') {
      if (body.vertices) {
        if (body.label === 'key') {
          const circleRadius = (body as Matter.Body & Partial<{ circleRadius: number }>).circleRadius;
          const r = circleRadius !== undefined ? circleRadius : (body.bounds.max.x - body.bounds.min.x) / 2;
          const cx = body.position.x;
          const cy = body.position.y;
          drawKey(ctx, cx, cy, r);
          return;
        }
        if (body.label === 'button') {
          const idx = buttonBodies.indexOf(body);
          const def = idx >= 0 ? buttonDefs[idx] : undefined;
          const pressed = idx >= 0 ? Boolean(buttonPressed[idx]) : false;
          const bx = def ? def.x : body.bounds.min.x;
          const by = def ? def.y : body.bounds.min.y;
          const bw = def ? def.w : body.bounds.max.x - body.bounds.min.x;
          const bh = def ? def.h : body.bounds.max.y - body.bounds.min.y;
          drawButton(ctx, bx, by, bw, bh, pressed);
          return;
        }
        if (body.label === 'door') {
          drawDoor(ctx, body, { hasKeyPoint: Boolean(keyPoint), doorUnlocked, levelCompleted });
          return;
        }
        if (body.label === 'block') {
          const idx = blockBodies.indexOf(body);
          const def = idx >= 0 ? blockDefs[idx] : undefined;
          const required = def?.required;
          const pushers = idx >= 0 ? blockPusherCounts[idx] ?? 0 : 0;
          drawBlock(ctx, body, { required, pushers });
          return;
        }
        if (body.label === 'bridge') {
          const idx = bridgeBodies.indexOf(body);
          const permanent = idx >= 0 ? Boolean(bridgeDefs[idx]?.permanent) : false;
          drawBridge(ctx, body, permanent);
          return;
        }
        if (body.label === 'spike') {
          drawSpike(ctx, body);
          return;
        }
        if (body.label === 'platform') {
          drawPlatform(ctx, body);
          return;
        }
      }
    }
  });

  if (editorEnabled) {
    ctx.lineWidth = 2;
    ctx.save();
    ctx.setLineDash([8, 6]);
    for (let i = 0; i < bridgeDefs.length; i += 1) {
      const br = bridgeDefs[i];
      if (!br) continue;
      if (!br.distance) continue;
      const dx = br.dx * br.distance;
      const dy = br.dy * br.distance;
      ctx.strokeStyle = br.permanent ? 'rgba(124, 77, 255, 0.7)' : 'rgba(0, 188, 212, 0.7)';
      ctx.strokeRect(br.x + dx, br.y + dy, br.w, br.h);
      ctx.beginPath();
      ctx.moveTo(br.x + br.w / 2, br.y + br.h / 2);
      ctx.lineTo(br.x + dx + br.w / 2, br.y + dy + br.h / 2);
      ctx.stroke();
    }
    ctx.restore();

    for (const b of buttonDefs) {
      if (b.targetBridgeId === null) continue;
      const bridge = bridgeDefs.find(br => br.id === b.targetBridgeId);
      if (!bridge) continue;
      const bx = b.x + b.w / 2;
      const by = b.y + b.h / 2;
      const tx = bridge.x + bridge.w / 2;
      const ty = bridge.y + bridge.h / 2;
      ctx.strokeStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(tx, ty);
      ctx.stroke();
    }

    if (buttonLinkingId !== null) {
      const btn = buttonDefs.find(b => b.id === buttonLinkingId);
      if (btn) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.strokeRect(btn.x + 2, btn.y + 2, btn.w - 4, btn.h - 4);
      }
    }
  }

  playerSlots.forEach(player => {
    if (!player) return;
    player.draw(ctx);
  });

  if (spawnPoint) {
    drawSpawn(ctx, spawnPoint.x, spawnPoint.y);
  }

  if (editorEnabled) {
    if (dragStart && dragCurrent) {
      const r = normalizeRect(dragStart, dragCurrent);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.strokeRect(r.x, r.y, r.w, r.h);

      if (editorTool === 'bridge' && r.w >= GRID_SIZE && r.h >= GRID_SIZE && bridgeDistance) {
        ctx.save();
        ctx.setLineDash([8, 6]);
        ctx.strokeStyle = bridgePermanent ? 'rgba(124, 77, 255, 0.7)' : 'rgba(0, 188, 212, 0.7)';
        const dx = bridgeMove.dx * bridgeDistance;
        const dy = bridgeMove.dy * bridgeDistance;
        ctx.strokeRect(r.x + dx, r.y + dy, r.w, r.h);
        ctx.beginPath();
        ctx.moveTo(r.x + r.w / 2, r.y + r.h / 2);
        ctx.lineTo(r.x + dx + r.w / 2, r.y + dy + r.h / 2);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  ctx.restore();

  if (levelCompleted) {
    ctx.fillStyle = '#ffffff';
    ctx.font = '48px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('LEVEL COMPLETE', canvas.width / 2, canvas.height / 2);
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
  }
}

function toCanvasPoint(e: MouseEvent): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const zoom = editorEnabled ? editorZoom : 1;
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;
  const worldX = x / zoom + camera.x;
  const worldY = y / zoom + camera.y;
  return { x: snap(worldX), y: snap(worldY) };
}

function toCanvasPointRaw(e: MouseEvent): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;
  return { x, y };
}

function toCanvasPointRawFromEvent(e: MouseEvent | WheelEvent): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;
  return { x, y };
}

function snap(value: number): number {
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

function clampCamera() {
  const zoom = editorEnabled ? editorZoom : 1;
  const viewWidth = canvas.width / zoom;
  const viewHeight = canvas.height / zoom;
  const maxX = Math.max(0, levelConfig.width - viewWidth);
  const maxY = Math.max(0, levelConfig.height - viewHeight);
  camera.x = Math.max(0, Math.min(maxX, camera.x));
  camera.y = Math.max(0, Math.min(maxY, camera.y));
}

function rebuildBounds() {
  for (const body of boundaryBodies) {
    Composite.remove(engine.world, body);
  }
  boundaryBodies = [];

  const wallThickness = 60;
  const groundThickness = 40;
  const w = levelConfig.width;
  const h = levelConfig.height;

  const ground = Bodies.rectangle(w / 2, h - groundThickness / 2, w + 10, groundThickness, {
    isStatic: true,
    label: 'ground',
    friction: 0,
    frictionStatic: 0
  });
  const leftWall = Bodies.rectangle(wallThickness / 2 - 20, h / 2, wallThickness, h, {
    isStatic: true,
    label: 'ground',
    friction: 0,
    frictionStatic: 0
  });
  const rightWall = Bodies.rectangle(w - wallThickness / 2 + 20, h / 2, wallThickness, h, {
    isStatic: true,
    label: 'ground',
    friction: 0,
    frictionStatic: 0
  });
  const ceiling = Bodies.rectangle(w / 2, wallThickness / 2 - 20, w + 10, wallThickness, {
    isStatic: true,
    label: 'ground',
    friction: 0,
    frictionStatic: 0
  });

  boundaryBodies = [ground, leftWall, rightWall, ceiling];
  Composite.add(engine.world, boundaryBodies);
  clampCamera();
}

function normalizeRect(a: { x: number; y: number }, b: { x: number; y: number }): LevelRect {
  const x1 = Math.min(a.x, b.x);
  const y1 = Math.min(a.y, b.y);
  const x2 = Math.max(a.x, b.x);
  const y2 = Math.max(a.y, b.y);
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}



function resetOnDeath() {
  levelCompleted = false;
  completionFrames = 0;
  doorUnlocked = false;

  if (keyPoint) {
    if (!keyBody) {
      keyBody = Bodies.circle(keyPoint.x, keyPoint.y, 12, { isStatic: true, isSensor: true, label: 'key' });
      Composite.add(engine.world, keyBody);
    }
    Matter.Body.setPosition(keyBody, { x: keyPoint.x, y: keyPoint.y });
    Matter.Body.setVelocity(keyBody, { x: 0, y: 0 });
    Matter.Body.setAngularVelocity(keyBody, 0);
    keyCarrierSlot = null;
  } else {
    if (keyBody) Composite.remove(engine.world, keyBody);
    keyBody = null;
    keyCarrierSlot = null;
  }

  for (let i = 0; i < blockBodies.length; i += 1) {
    const body = blockBodies[i];
    const def = blockDefs[i];
    if (!body || !def) continue;
    const cx = def.x + def.w / 2;
    const cy = def.y + def.h / 2;
    Matter.Body.setPosition(body, { x: cx, y: cy });
    Matter.Body.setVelocity(body, { x: 0, y: 0 });
    Matter.Body.setAngularVelocity(body, 0);
    Matter.Body.setStatic(body, true);
  }

  for (let i = 0; i < bridgeBodies.length; i += 1) {
    bridgeActivated[i] = false;
    bridgeLatched[i] = false;
    bridgeCarryX[i] = 0;

    const body = bridgeBodies[i];
    const home = bridgeHomeCenters[i];
    if (!body || !home) continue;
    Matter.Body.setPosition(body, { x: home.x, y: home.y });
    Matter.Body.setVelocity(body, { x: 0, y: 0 });
    Matter.Body.setAngularVelocity(body, 0);
  }
}

function respawnAllPlayers() {
  resetOnDeath();
  spawnPoint = ensureSpawnEnt(spawnPoint, levelConfig, snap);
  for (let slot = 0; slot < playerSlots.length; slot += 1) {
    const player = playerSlots[slot];
    if (!player) continue;
    const spawn = getSpawnForSlotEnt(slot, spawnPoint, canvas, snap);
    Matter.Body.setPosition(player.body, { x: spawn.x, y: spawn.y });
    Matter.Body.setVelocity(player.body, { x: 0, y: 0 });
    Matter.Body.setAngularVelocity(player.body, 0);
  }
}


function clearLevelData() {
  for (const body of platformBodies) {
    Composite.remove(engine.world, body);
  }
  platformBodies = [];
  levelRects = [];
  for (const body of blockBodies) {
    Composite.remove(engine.world, body);
  }
  blockBodies = [];
  blockDefs = [];
  blockPusherCounts = [];
  if (keyBody) {
    Composite.remove(engine.world, keyBody);
  }
  keyBody = null;
  keyPoint = null;
  keyCarrierSlot = null;
  doorUnlocked = false;
  for (const body of spikeBodies) {
    Composite.remove(engine.world, body);
  }
  spikeBodies = [];
  spikeRects = [];
  for (const body of bridgeBodies) {
    Composite.remove(engine.world, body);
  }
  bridgeBodies = [];
  bridgeDefs = [];
  bridgeActivated = [];
  bridgeLatched = [];
  bridgeHomeCenters = [];
  bridgeCarryX = [];
  for (const body of buttonBodies) {
    Composite.remove(engine.world, body);
  }
  buttonBodies = [];
  buttonDefs = [];
  buttonPressed = [];
  buttonLinkingId = null;
  if (doorBody) {
    Composite.remove(engine.world, doorBody);
  }
  doorBody = null;
  doorRect = null;
  spawnPoint = null;
  levelCompleted = false;
  completionFrames = 0;
  nextEntityId = 1;
  persistLevel();
}

function loadLevelFromStorage() {
  const json = localStorage.getItem(LEVEL_STORAGE_KEY);
  if (!json) return;
  loadLevelFromJson(json);
}

function loadLevelFromJson(json: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return;
  }

  const next = parseLevelState(parsed);
  if (!next) return;

  levelConfig = {
    width: snap(next.config.width),
    height: snap(next.config.height)
  };
  rebuildBounds();

  for (const body of platformBodies) {
    Composite.remove(engine.world, body);
  }
  platformBodies = [];
  levelRects = [];
  for (const body of blockBodies) {
    Composite.remove(engine.world, body);
  }
  blockBodies = [];
  blockDefs = [];
  blockPusherCounts = [];
  if (doorBody) {
    Composite.remove(engine.world, doorBody);
  }
  doorBody = null;
  doorRect = null;
  for (const body of spikeBodies) {
    Composite.remove(engine.world, body);
  }
  spikeBodies = [];
  spikeRects = [];
  for (const body of bridgeBodies) {
    Composite.remove(engine.world, body);
  }
  bridgeBodies = [];
  bridgeDefs = [];
  bridgeActivated = [];
  bridgeLatched = [];
  bridgeHomeCenters = [];
  bridgeCarryX = [];
  for (const body of buttonBodies) {
    Composite.remove(engine.world, body);
  }
  buttonBodies = [];
  buttonDefs = [];
  buttonPressed = [];
  buttonLinkingId = null;
  spawnPoint = null;
  if (keyBody) {
    Composite.remove(engine.world, keyBody);
  }
  keyBody = null;
  keyPoint = null;
  keyCarrierSlot = null;
  doorUnlocked = false;
  levelCompleted = false;
  completionFrames = 0;

  for (const r of next.platforms) {
    const body = Bodies.rectangle(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h, {
      isStatic: true,
      label: 'platform'
    });
    levelRects.push(r);
    platformBodies.push(body);
    Composite.add(engine.world, body);
  }

  if (next.door) {
    const d = next.door;
    doorRect = d;
    doorBody = Bodies.rectangle(d.x + d.w / 2, d.y + d.h / 2, d.w, d.h, {
      isStatic: true,
      isSensor: true,
      label: 'door'
    });
    Composite.add(engine.world, doorBody);
  }

  if (next.spawn) {
    spawnPoint = { x: snap(next.spawn.x), y: snap(next.spawn.y) };
  }

  if (next.key) {
    keyPoint = { x: snap(next.key.x), y: snap(next.key.y) };
    keyBody = Bodies.circle(keyPoint.x, keyPoint.y, 12, { isStatic: true, isSensor: true, label: 'key' });
    Composite.add(engine.world, keyBody);
  }

  for (const b of next.blocks) {
    const rect: LevelRect = { x: b.x, y: b.y, w: b.w, h: b.h };
    const clamped = Math.max(1, Math.min(4, Math.round(b.required)));
    const body = Bodies.rectangle(rect.x + rect.w / 2, rect.y + rect.h / 2, rect.w, rect.h, {
      label: 'block',
      friction: 0,
      frictionStatic: 0,
      frictionAir: 0.02,
      inertia: Infinity
    });
    blockDefs.push({ ...rect, required: clamped });
    blockBodies.push(body);
    blockPusherCounts.push(0);
    Composite.add(engine.world, body);
  }

  for (const r of next.spikes) {
    const body = Bodies.rectangle(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h, {
      isStatic: true,
      isSensor: true,
      label: 'spike'
    });
    spikeRects.push(r);
    spikeBodies.push(body);
    Composite.add(engine.world, body);
  }

  for (const br of next.bridges) {
    const rect: LevelRect = { x: br.x, y: br.y, w: br.w, h: br.h };
    const id = Math.round(br.id);
    const dx = Math.round(br.dx);
    const dy = Math.round(br.dy);
    const distance = snap(Math.max(0, Math.round(br.distance)));
    const def: BridgeDef = { ...rect, id, dx, dy, distance, permanent: Boolean(br.permanent) };
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
  }

  for (const btn of next.buttons) {
    const rect: LevelRect = { x: btn.x, y: btn.y, w: btn.w, h: btn.h };
    const id = Math.round(btn.id);
    const targetBridgeId =
      btn.targetBridgeId === null || btn.targetBridgeId === undefined ? null : Math.round(btn.targetBridgeId);
    const def: ButtonDef = { ...rect, id, targetBridgeId };
    const body = Bodies.rectangle(rect.x + rect.w / 2, rect.y + rect.h / 2, rect.w, rect.h, {
      isStatic: true,
      isSensor: true,
      label: 'button'
    });
    buttonDefs.push(def);
    buttonBodies.push(body);
    buttonPressed.push(false);
    Composite.add(engine.world, body);
  }

  nextEntityId = 1;
  for (const br of bridgeDefs) nextEntityId = Math.max(nextEntityId, br.id + 1);
  for (const btn of buttonDefs) nextEntityId = Math.max(nextEntityId, btn.id + 1);

  ensureDoorEnt(doorBody, levelConfig, snap, setDoorRectLocal);
  spawnPoint = ensureSpawnEnt(spawnPoint, levelConfig, snap);
  keyBody = ensureKeyEnt(engine, keyPoint, keyBody);
  persistLevel();
}

function buildLevelState(): LevelState {
  return {
    config: levelConfig,
    platforms: levelRects,
    door: doorRect,
    spawn: spawnPoint,
    key: keyPoint,
    blocks: blockDefs,
    bridges: bridgeDefs,
    buttons: buttonDefs,
    spikes: spikeRects
  };
}

function pushHistorySnapshot() {
  if (suppressHistory) return;
  const json = JSON.stringify(buildLevelState());
  const last = undoStack.length > 0 ? undoStack[undoStack.length - 1] : null;
  if (last === json) return;
  undoStack.push(json);
  redoStack = [];
  if (undoStack.length > 250) undoStack = undoStack.slice(-250);
}

function persistLevel() {
  const state = buildLevelState();
  localStorage.setItem(LEVEL_STORAGE_KEY, JSON.stringify(state));
  pushHistorySnapshot();
}

function parseLevelState(input: unknown): LevelState | null {
  const parseRect = (value: unknown): LevelRect | null => {
    if (!value || typeof value !== 'object') return null;
    const r = value as Partial<LevelRect>;
    if (typeof r.x !== 'number' || typeof r.y !== 'number' || typeof r.w !== 'number' || typeof r.h !== 'number') return null;
    if (r.w <= 0 || r.h <= 0) return null;
    return { x: r.x, y: r.y, w: r.w, h: r.h };
  };

  if (Array.isArray(input)) {
    const platforms: LevelRect[] = [];
    for (const item of input) {
      const rect = parseRect(item);
      if (!rect) return null;
      platforms.push(rect);
    }
    return {
      config: levelConfig,
      platforms,
      door: null,
      spawn: null,
      key: null,
      blocks: [],
      bridges: [],
      buttons: [],
      spikes: []
    };
  }

  if (!input || typeof input !== 'object') return null;
  const obj = input as {
    config?: unknown;
    platforms?: unknown;
    door?: unknown;
    spawn?: unknown;
    key?: unknown;
    blocks?: unknown;
    bridges?: unknown;
    buttons?: unknown;
    spikes?: unknown;
  };
  if (!Array.isArray(obj.platforms)) return null;

  let config: LevelConfig = levelConfig;
  if (obj.config !== null && obj.config !== undefined) {
    if (!obj.config || typeof obj.config !== 'object') return null;
    const c = obj.config as { width?: unknown; height?: unknown };
    if (typeof c.width !== 'number' || typeof c.height !== 'number') return null;
    if (c.width <= 0 || c.height <= 0) return null;
    config = { width: c.width, height: c.height };
  }

  const platforms: LevelRect[] = [];
  for (const item of obj.platforms) {
    const rect = parseRect(item);
    if (!rect) return null;
    platforms.push(rect);
  }

  const door = obj.door === null || obj.door === undefined ? null : parseRect(obj.door);
  if (obj.door !== null && obj.door !== undefined && !door) return null;

  let spawn: { x: number; y: number } | null = null;
  if (obj.spawn !== null && obj.spawn !== undefined) {
    if (!obj.spawn || typeof obj.spawn !== 'object') return null;
    const s = obj.spawn as { x?: unknown; y?: unknown };
    if (typeof s.x !== 'number' || typeof s.y !== 'number') return null;
    spawn = { x: s.x, y: s.y };
  }

  let key: { x: number; y: number } | null = null;
  if (obj.key !== null && obj.key !== undefined) {
    if (!obj.key || typeof obj.key !== 'object') return null;
    const k = obj.key as { x?: unknown; y?: unknown };
    if (typeof k.x !== 'number' || typeof k.y !== 'number') return null;
    key = { x: k.x, y: k.y };
  }

  const blocks: Array<LevelRect & { required: number }> = [];
  if (obj.blocks !== null && obj.blocks !== undefined) {
    if (!Array.isArray(obj.blocks)) return null;
    for (const item of obj.blocks) {
      const rect = parseRect(item);
      if (!rect) return null;
      const b = item as { required?: unknown };
      if (typeof b.required !== 'number') return null;
      const required = Math.max(1, Math.min(4, Math.round(b.required)));
      blocks.push({ ...rect, required });
    }
  }

  const bridges: BridgeDef[] = [];
  if (obj.bridges !== null && obj.bridges !== undefined) {
    if (!Array.isArray(obj.bridges)) return null;
    for (const item of obj.bridges) {
      const rect = parseRect(item);
      if (!rect) return null;
      if (!item || typeof item !== 'object') return null;
      const b = item as { id?: unknown; dx?: unknown; dy?: unknown; distance?: unknown; permanent?: unknown };
      if (typeof b.id !== 'number' || typeof b.dx !== 'number' || typeof b.dy !== 'number' || typeof b.distance !== 'number') {
        return null;
      }
      const id = Math.round(b.id);
      const dx = Math.round(b.dx);
      const dy = Math.round(b.dy);
      if (Math.abs(dx) + Math.abs(dy) !== 1) return null;
      const distance = Math.max(0, Math.round(b.distance));
      const permanent = b.permanent === undefined ? false : Boolean(b.permanent);
      bridges.push({ ...rect, id, dx, dy, distance, permanent });
    }
  }

  const buttons: ButtonDef[] = [];
  if (obj.buttons !== null && obj.buttons !== undefined) {
    if (!Array.isArray(obj.buttons)) return null;
    for (const item of obj.buttons) {
      const rect = parseRect(item);
      if (!rect) return null;
      if (!item || typeof item !== 'object') return null;
      const b = item as { id?: unknown; targetBridgeId?: unknown };
      if (typeof b.id !== 'number') return null;
      const id = Math.round(b.id);
      let targetBridgeId: number | null = null;
      if (b.targetBridgeId !== null && b.targetBridgeId !== undefined) {
        if (typeof b.targetBridgeId !== 'number') return null;
        targetBridgeId = Math.round(b.targetBridgeId);
      }
      buttons.push({ ...rect, id, targetBridgeId });
    }
  }

  const spikes: LevelRect[] = [];
  if (obj.spikes !== null && obj.spikes !== undefined) {
    if (!Array.isArray(obj.spikes)) return null;
    for (const item of obj.spikes) {
      const rect = parseRect(item);
      if (!rect) return null;
      spikes.push(rect);
    }
  }

  return { config, platforms, door, spawn, key, blocks, bridges, buttons, spikes };
}
