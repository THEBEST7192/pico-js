import Matter from 'matter-js';
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

type LevelRect = {
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

type BridgeDef = LevelRect & { id: number; dx: number; dy: number; distance: number };
type ButtonDef = LevelRect & { id: number; targetBridgeId: number | null };

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
let bridgeHomeCenters: Array<{ x: number; y: number }> = [];
let bridgeCarryX: number[] = [];
let buttonDefs: ButtonDef[] = [];
let buttonBodies: Matter.Body[] = [];
let buttonPressed: boolean[] = [];
let buttonLinkingId: number | null = null;
let nextEntityId = 1;
let bridgeMove = { dx: 1, dy: 0 };
let bridgeDistance = 200;
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
  ensureDoor();
  ensureSpawn();
  ensureKey();
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
    const spawn = getSpawnForSlot(slot);
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
      handleButtonClick(p);
      return;
    }
    if (editorTool === 'erase') {
      eraseAtPoint(p);
      return;
    }
    if (editorTool === 'spawn') {
      setSpawnPoint(p);
      return;
    }
    if (editorTool === 'key') {
      setKeyPoint(p);
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
      setDoor(rect);
      return;
    }
    if (editorTool === 'platform') {
      addPlatform(rect);
      return;
    }
    if (editorTool === 'block') {
      addBlock(rect, blockRequired);
      return;
    }
    if (editorTool === 'bridge') {
      addBridge(rect);
      return;
    }
    if (editorTool === 'spike') {
      addSpike(rect);
      return;
    }
  };

  const handleContextMenu = (e: MouseEvent) => {
    if (!editorEnabled) return;
    e.preventDefault();
    const p = toCanvasPoint(e);
    eraseAtPoint(p);
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
    updateKey();
    updateBlocks();
    updateButtons();
    updateBridges();
    updateDoor();
    updateSpikes();
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
    const isGrounded = Matter.Query.region(groundBodies, {
      min: { x: player.body.position.x - 18, y: player.body.position.y + 21 },
      max: { x: player.body.position.x + 18, y: player.body.position.y + 25 }
    }).length > 0;

    const otherPlayers = playerSlots.filter((p): p is Player => Boolean(p) && p !== player);
    const playerContacts = Matter.Query.collides(player.body, otherPlayers.map(p => p.body));
    const hasPlayerAbove = playerContacts.some(c => {
      const other = c.bodyA === player.body ? c.bodyB : c.bodyA;
      return other.label === 'player' && other.position.y < player.body.position.y - 5;
    });

    const support = playerContacts
      .map(c => (c.bodyA === player.body ? c.bodyB : c.bodyA))
      .filter(b => b.label === 'player' && b.position.y > player.body.position.y + 5)
      .sort((a, b) => b.position.y - a.position.y)[0];
    let carryX = support ? support.velocity.x : 0;
    if (support?.label === 'bridge') {
      const idx = bridgeBodies.indexOf(support);
      carryX = idx >= 0 ? bridgeCarryX[idx] ?? 0 : 0;
    }
    
    player.update(isGrounded, isGrounded && !hasPlayerAbove, carryX);
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
        if (body.label === 'door') {
          ctx.fillStyle = keyPoint && !doorUnlocked ? '#90a4ae' : levelCompleted ? '#00e676' : '#ffb300';
        } else if (body.label === 'key') {
          ctx.fillStyle = '#ffeb3b';
        } else if (body.label === 'block') {
          ctx.fillStyle = '#ff9800';
        } else if (body.label === 'bridge') {
          ctx.fillStyle = '#00bcd4';
        } else if (body.label === 'button') {
          const idx = buttonBodies.indexOf(body);
          const pressed = idx >= 0 ? Boolean(buttonPressed[idx]) : false;
          ctx.fillStyle = pressed ? '#8b0000' : '#ff0000';
        } else if (body.label === 'spike') {
          ctx.fillStyle = '#e53935';
        } else {
          ctx.fillStyle = body.label === 'platform' ? '#555' : '#333';
        }
        ctx.beginPath();
        ctx.moveTo(body.vertices[0].x, body.vertices[0].y);
        for (let i = 1; i < body.vertices.length; i++) {
          ctx.lineTo(body.vertices[i].x, body.vertices[i].y);
        }
        ctx.closePath();
        ctx.fill();

        if (body.label === 'block') {
          const { min, max } = body.bounds;
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 3;
          ctx.strokeRect(min.x + 2, min.y + 2, max.x - min.x - 4, max.y - min.y - 4);

          const idx = blockBodies.indexOf(body);
          const def = idx >= 0 ? blockDefs[idx] : undefined;
          const required = def?.required;
          const pushers = idx >= 0 ? blockPusherCounts[idx] ?? 0 : 0;
          if (required) {
            const remaining = Math.max(0, required - pushers);
            ctx.fillStyle = '#ffffff';
            ctx.font = '28px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(remaining), body.position.x, body.position.y);
            ctx.textAlign = 'start';
            ctx.textBaseline = 'alphabetic';
          }
        }
      }
    }
  });

  if (editorEnabled) {
    ctx.lineWidth = 2;
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
    ctx.fillStyle = '#00e676';
    ctx.beginPath();
    ctx.arc(spawnPoint.x, spawnPoint.y, 10, 0, Math.PI * 2);
    ctx.fill();
  }

  if (editorEnabled) {
    if (dragStart && dragCurrent) {
      const r = normalizeRect(dragStart, dragCurrent);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.strokeRect(r.x, r.y, r.w, r.h);
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

function addPlatform(rect: LevelRect) {
  const body = Bodies.rectangle(rect.x + rect.w / 2, rect.y + rect.h / 2, rect.w, rect.h, {
    isStatic: true,
    label: 'platform'
  });
  levelRects.push(rect);
  platformBodies.push(body);
  Composite.add(engine.world, body);
  persistLevel();
}

function addBlock(rect: LevelRect, required: number) {
  const clamped = Math.max(1, Math.min(4, Math.round(required)));
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
  persistLevel();
}

function addBridge(rect: LevelRect) {
  const dx = bridgeMove.dx;
  const dy = bridgeMove.dy;
  const id = nextEntityId;
  nextEntityId += 1;
  const distance = bridgeDistance;
  const def: BridgeDef = { ...rect, id, dx, dy, distance };
  const body = Bodies.rectangle(rect.x + rect.w / 2, rect.y + rect.h / 2, rect.w, rect.h, {
    isStatic: true,
    label: 'bridge'
  });
  bridgeDefs.push(def);
  bridgeBodies.push(body);
  bridgeActivated.push(false);
  bridgeHomeCenters.push({ x: body.position.x, y: body.position.y });
  bridgeCarryX.push(0);
  Composite.add(engine.world, body);
  persistLevel();
}

function addButton(p: { x: number; y: number }) {
  const w = snap(40);
  const h = snap(20);
  const x = snap(p.x - w / 2);
  const y = snap(p.y - h / 2);
  const id = nextEntityId;
  nextEntityId += 1;
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
  return id;
}

function handleButtonClick(p: { x: number; y: number }) {
  const hitButtons = Matter.Query.point(buttonBodies, p);
  if (hitButtons.length > 0) {
    const idx = buttonBodies.indexOf(hitButtons[0]);
    const def = idx >= 0 ? buttonDefs[idx] : undefined;
    if (def) {
      buttonLinkingId = def.id;
      persistLevel();
      return;
    }
  }

  if (buttonLinkingId === null) {
    buttonLinkingId = addButton(p);
    return;
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
      return;
    }
  }

  buttonLinkingId = null;
  persistLevel();
}

function removeBridgeBody(body: Matter.Body) {
  const idx = bridgeBodies.indexOf(body);
  if (idx === -1) return;
  const id = bridgeDefs[idx]?.id;
  Composite.remove(engine.world, body);
  bridgeBodies.splice(idx, 1);
  bridgeDefs.splice(idx, 1);
  bridgeActivated.splice(idx, 1);
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

function removeButtonBody(body: Matter.Body) {
  const idx = buttonBodies.indexOf(body);
  if (idx === -1) return;
  const id = buttonDefs[idx]?.id;
  Composite.remove(engine.world, body);
  buttonBodies.splice(idx, 1);
  buttonDefs.splice(idx, 1);
  buttonPressed.splice(idx, 1);
  if (buttonLinkingId === id) buttonLinkingId = null;
  persistLevel();
}

function addSpike(rect: LevelRect) {
  const body = Bodies.rectangle(rect.x + rect.w / 2, rect.y + rect.h / 2, rect.w, rect.h, {
    isStatic: true,
    isSensor: true,
    label: 'spike'
  });
  spikeRects.push(rect);
  spikeBodies.push(body);
  Composite.add(engine.world, body);
  persistLevel();
}

function removePlatformBody(body: Matter.Body) {
  const idx = platformBodies.indexOf(body);
  if (idx === -1) return;
  Composite.remove(engine.world, body);
  platformBodies.splice(idx, 1);
  levelRects.splice(idx, 1);
  persistLevel();
}

function removeBlockBody(body: Matter.Body) {
  const idx = blockBodies.indexOf(body);
  if (idx === -1) return;
  Composite.remove(engine.world, body);
  blockBodies.splice(idx, 1);
  blockDefs.splice(idx, 1);
  blockPusherCounts.splice(idx, 1);
  persistLevel();
}

function removeSpikeBody(body: Matter.Body) {
  const idx = spikeBodies.indexOf(body);
  if (idx === -1) return;
  Composite.remove(engine.world, body);
  spikeBodies.splice(idx, 1);
  spikeRects.splice(idx, 1);
  persistLevel();
}

function eraseAtPoint(p: { x: number; y: number }) {
  if (spawnPoint) {
    const dx = p.x - spawnPoint.x;
    const dy = p.y - spawnPoint.y;
    if (dx * dx + dy * dy <= 18 * 18) {
      spawnPoint = null;
      persistLevel();
      return;
    }
  }
  if (keyBody) {
    const hitKey = Matter.Query.point([keyBody], p);
    if (hitKey.length > 0) {
      removeKey();
      return;
    }
  }
  if (doorBody) {
    const hitDoor = Matter.Query.point([doorBody], p);
    if (hitDoor.length > 0) {
      removeDoor();
      return;
    }
  }
  const hitButtons = Matter.Query.point(buttonBodies, p);
  if (hitButtons.length > 0) {
    removeButtonBody(hitButtons[0]);
    return;
  }
  const hitBridges = Matter.Query.point(bridgeBodies, p);
  if (hitBridges.length > 0) {
    removeBridgeBody(hitBridges[0]);
    return;
  }
  const hitBlocks = Matter.Query.point(blockBodies, p);
  if (hitBlocks.length > 0) {
    removeBlockBody(hitBlocks[0]);
    return;
  }
  const hitSpikes = Matter.Query.point(spikeBodies, p);
  if (hitSpikes.length > 0) {
    removeSpikeBody(hitSpikes[0]);
    return;
  }
  const hitPlatforms = Matter.Query.point(platformBodies, p);
  if (hitPlatforms.length > 0) {
    removePlatformBody(hitPlatforms[0]);
  }
}

function setSpawnPoint(p: { x: number; y: number }) {
  spawnPoint = { x: p.x, y: p.y };
  persistLevel();
}

function setKeyPoint(p: { x: number; y: number }) {
  if (keyBody) {
    Composite.remove(engine.world, keyBody);
    keyBody = null;
  }
  keyPoint = { x: p.x, y: p.y };
  keyCarrierSlot = null;
  doorUnlocked = false;
  keyBody = Bodies.circle(keyPoint.x, keyPoint.y, 12, { isStatic: true, isSensor: true, label: 'key' });
  Composite.add(engine.world, keyBody);
  persistLevel();
}

function removeKey() {
  if (keyBody) Composite.remove(engine.world, keyBody);
  keyBody = null;
  keyPoint = null;
  keyCarrierSlot = null;
  doorUnlocked = false;
  persistLevel();
}

function ensureKey() {
  if (!keyPoint) return;
  if (keyBody) return;
  doorUnlocked = false;
  keyCarrierSlot = null;
  keyBody = Bodies.circle(keyPoint.x, keyPoint.y, 12, { isStatic: true, isSensor: true, label: 'key' });
  Composite.add(engine.world, keyBody);
}

function setDoor(rect: LevelRect) {
  if (doorBody) {
    Composite.remove(engine.world, doorBody);
    doorBody = null;
  }
  doorRect = rect;
  doorBody = Bodies.rectangle(rect.x + rect.w / 2, rect.y + rect.h / 2, rect.w, rect.h, {
    isStatic: true,
    isSensor: true,
    label: 'door'
  });
  Composite.add(engine.world, doorBody);
  persistLevel();
}

function removeDoor() {
  if (!doorBody) return;
  Composite.remove(engine.world, doorBody);
  doorBody = null;
  doorRect = null;
  persistLevel();
}

function ensureDoor() {
  if (doorBody) return;
  const defaultRect: LevelRect = {
    x: snap(levelConfig.width - 100),
    y: snap(levelConfig.height - 120),
    w: snap(40),
    h: snap(80)
  };
  setDoor(defaultRect);
}

function ensureSpawn() {
  if (spawnPoint) return;
  spawnPoint = { x: snap(80), y: snap(levelConfig.height - 140) };
  persistLevel();
}

function getSpawnForSlot(slot: number): { x: number; y: number } {
  const base = spawnPoint ?? { x: snap(80), y: snap(canvas.height - 140) };
  return { x: base.x + slot * 60, y: base.y };
}

function respawnPlayer(slot: number, player: Player) {
  ensureSpawn();
  if (keyBody && keyCarrierSlot === slot) {
    keyCarrierSlot = null;
    const home = keyPoint ?? { x: player.body.position.x, y: player.body.position.y - 34 };
    Matter.Body.setPosition(keyBody, { x: home.x, y: home.y });
    Matter.Body.setVelocity(keyBody, { x: 0, y: 0 });
    Matter.Body.setAngularVelocity(keyBody, 0);
  }
  const spawn = getSpawnForSlot(slot);
  Matter.Body.setPosition(player.body, { x: spawn.x, y: spawn.y });
  Matter.Body.setVelocity(player.body, { x: 0, y: 0 });
  Matter.Body.setAngularVelocity(player.body, 0);
}

function updateKey() {
  if (!keyBody) return;

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
      return;
    }

    Matter.Body.setPosition(keyBody, { x: carrier.body.position.x, y: carrier.body.position.y - 34 });
    Matter.Body.setVelocity(keyBody, { x: 0, y: 0 });
    Matter.Body.setAngularVelocity(keyBody, 0);

    if (!doorUnlocked && doorBody && Matter.Query.collides(doorBody, [carrier.body]).length > 0) {
      doorUnlocked = true;
      Composite.remove(engine.world, keyBody);
      keyBody = null;
      keyCarrierSlot = null;
    }
  }
}

function updateBlocks() {
  if (blockBodies.length === 0) return;
  for (let i = 0; i < blockBodies.length; i += 1) {
    const body = blockBodies[i];
    const def = blockDefs[i];
    if (!def) continue;

    const pushers = new Set<number>();
    for (let slot = 0; slot < playerSlots.length; slot += 1) {
      const player = playerSlots[slot];
      if (!player) continue;
      if (Math.abs(player.moveAxisX) < 0.2) continue;
      if (Matter.Query.collides(body, [player.body]).length === 0) continue;

      const dx = body.position.x - player.body.position.x;
      if (dx > 0 && player.moveAxisX > 0) pushers.add(slot);
      if (dx < 0 && player.moveAxisX < 0) pushers.add(slot);
    }

    blockPusherCounts[i] = pushers.size;
    const shouldMove = pushers.size >= def.required;
    if (shouldMove && body.isStatic) {
      Matter.Body.setStatic(body, false);
    } else if (!shouldMove && !body.isStatic) {
      Matter.Body.setVelocity(body, { x: 0, y: body.velocity.y });
      Matter.Body.setAngularVelocity(body, 0);
      Matter.Body.setStatic(body, true);
    }
  }
}

function updateButtons() {
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
    bridgeActivated[i] = activeBridgeIds.has(def.id);
  }
}

function updateBridges() {
  if (bridgeBodies.length === 0) return;
  const step = 2;
  for (let i = 0; i < bridgeBodies.length; i += 1) {
    const body = bridgeBodies[i];
    const def = bridgeDefs[i];
    const home = bridgeHomeCenters[i];
    if (!body || !def || !home) continue;

    const target = bridgeActivated[i]
      ? { x: home.x + def.dx * def.distance, y: home.y + def.dy * def.distance }
      : home;

    const dx = target.x - body.position.x;
    const dy = target.y - body.position.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.001) {
      bridgeCarryX[i] = 0;
      Matter.Body.setVelocity(body, { x: 0, y: 0 });
      Matter.Body.setAngularVelocity(body, 0);
      continue;
    }

    const mag = Math.min(step, dist);
    const mx = (dx / dist) * mag;
    const my = (dy / dist) * mag;
    Matter.Body.setPosition(body, { x: body.position.x + mx, y: body.position.y + my });
    Matter.Body.setVelocity(body, { x: 0, y: 0 });
    Matter.Body.setAngularVelocity(body, 0);
    bridgeCarryX[i] = mx;
  }
}

function updateDoor() {
  if (!doorBody) {
    levelCompleted = false;
    completionFrames = 0;
    return;
  }
  if (keyPoint && !doorUnlocked) {
    levelCompleted = false;
    completionFrames = 0;
    return;
  }

  const activePlayers = playerSlots.filter((p): p is Player => Boolean(p));
  if (activePlayers.length === 0) {
    levelCompleted = false;
    completionFrames = 0;
    return;
  }

  const atDoor = activePlayers.filter(p => Matter.Query.collides(doorBody!, [p.body]).length > 0);
  if (atDoor.length === activePlayers.length) {
    completionFrames += 1;
    if (completionFrames >= 15) levelCompleted = true;
  } else {
    completionFrames = 0;
    levelCompleted = false;
  }
}

function updateSpikes() {
  if (spikeBodies.length === 0) return;
  for (let slot = 0; slot < playerSlots.length; slot += 1) {
    const player = playerSlots[slot];
    if (!player) continue;
    if (Matter.Query.collides(player.body, spikeBodies).length > 0) {
      respawnPlayer(slot, player);
    }
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
    const def: BridgeDef = { ...rect, id, dx, dy, distance };
    const body = Bodies.rectangle(rect.x + rect.w / 2, rect.y + rect.h / 2, rect.w, rect.h, {
      isStatic: true,
      label: 'bridge'
    });
    bridgeDefs.push(def);
    bridgeBodies.push(body);
    bridgeActivated.push(false);
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

  ensureDoor();
  ensureSpawn();
  ensureKey();
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
      const b = item as { id?: unknown; dx?: unknown; dy?: unknown; distance?: unknown };
      if (typeof b.id !== 'number' || typeof b.dx !== 'number' || typeof b.dy !== 'number' || typeof b.distance !== 'number') {
        return null;
      }
      const id = Math.round(b.id);
      const dx = Math.round(b.dx);
      const dy = Math.round(b.dy);
      if (Math.abs(dx) + Math.abs(dy) !== 1) return null;
      const distance = Math.max(0, Math.round(b.distance));
      bridges.push({ ...rect, id, dx, dy, distance });
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
