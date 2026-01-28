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

type LevelState = {
  platforms: LevelRect[];
  door: LevelRect | null;
  spawn: { x: number; y: number } | null;
  spikes: LevelRect[];
};

export type EditorTool = 'platform' | 'door' | 'spawn' | 'spike' | 'erase';

export type GameApi = {
  toggleEditor: () => boolean;
  setEditorEnabled: (enabled: boolean) => boolean;
  getEditorEnabled: () => boolean;
  setEditorTool: (tool: EditorTool) => EditorTool;
  getEditorTool: () => EditorTool;
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
let spikeRects: LevelRect[] = [];
let spikeBodies: Matter.Body[] = [];
let levelCompleted = false;
let completionFrames = 0;
let dragStart: { x: number; y: number } | null = null;
let dragCurrent: { x: number; y: number } | null = null;
let mouseDownButton: number | null = null;

export function initGame(canvasElement: HTMLCanvasElement): { destroy: () => void; api: GameApi } {
  canvas = canvasElement;
  ctx = canvas.getContext('2d')!;
  
  // Set canvas size to 90% of viewport
  const width = window.innerWidth * 0.9;
  const height = window.innerHeight * 0.9;
  canvas.width = width;
  canvas.height = height;

  // Create engine
  engine = Engine.create();
  
  // Create runner
  runner = Runner.create();
  Runner.run(runner, engine);

  // Add walls
  const wallThickness = 60;
  const groundThickness = 40;
  const ground = Bodies.rectangle(width / 2, height - groundThickness / 2, width + 10, groundThickness, { isStatic: true, label: 'ground' });
  const leftWall = Bodies.rectangle(wallThickness / 2 - 20, height / 2, wallThickness, height, { isStatic: true, label: 'ground' });
  const rightWall = Bodies.rectangle(width - wallThickness / 2 + 20, height / 2, wallThickness, height, { isStatic: true, label: 'ground' });
  const ceiling = Bodies.rectangle(width / 2, wallThickness / 2 - 20, width + 10, wallThickness, { isStatic: true, label: 'ground' });
  
  Composite.add(engine.world, [ground, leftWall, rightWall, ceiling]);

  loadLevelFromStorage();
  ensureDoor();
  ensureSpawn();

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
    if (e.button !== 0) return;
    const p = toCanvasPoint(e);
    if (editorTool === 'erase') {
      eraseAtPoint(p);
      return;
    }
    if (editorTool === 'spawn') {
      setSpawnPoint(p);
      return;
    }
    dragStart = p;
    dragCurrent = p;
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!editorEnabled) return;
    if (mouseDownButton !== 0) return;
    if (!dragStart) return;
    dragCurrent = toCanvasPoint(e);
  };

  const handleMouseUp = (e: MouseEvent) => {
    if (!editorEnabled) return;
    if (mouseDownButton !== 0) {
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
    const tool: EditorTool = e.shiftKey ? 'door' : editorTool;
    if (tool === 'door') {
      setDoor(rect);
      return;
    }
    if (tool === 'platform') {
      addPlatform(rect);
      return;
    }
    if (tool === 'spike') {
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

  canvas.addEventListener('mousedown', handleMouseDown);
  canvas.addEventListener('mousemove', handleMouseMove);
  canvas.addEventListener('mouseup', handleMouseUp);
  canvas.addEventListener('contextmenu', handleContextMenu);

  const api: GameApi = {
    toggleEditor: () => {
      editorEnabled = !editorEnabled;
      dragStart = null;
      dragCurrent = null;
      return editorEnabled;
    },
    setEditorEnabled: (enabled: boolean) => {
      editorEnabled = enabled;
      dragStart = null;
      dragCurrent = null;
      return editorEnabled;
    },
    getEditorEnabled: () => editorEnabled,
    setEditorTool: (tool: EditorTool) => {
      editorTool = tool;
      dragStart = null;
      dragCurrent = null;
      return editorTool;
    },
    getEditorTool: () => editorTool,
    exportLevel: () =>
      JSON.stringify({ platforms: levelRects, door: doorRect, spawn: spawnPoint, spikes: spikeRects } satisfies LevelState),
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
    updateDoor();
    updateSpikes();
    
    // Draw
    draw();
    
    requestAnimationFrame(update);
  };

  requestAnimationFrame(update);

  // Cleanup function
  const destroy = () => {
    window.removeEventListener("gamepadconnected", handleGamepadConnected);
    window.removeEventListener("gamepaddisconnected", handleGamepadDisconnected);
    canvas.removeEventListener('mousedown', handleMouseDown);
    canvas.removeEventListener('mousemove', handleMouseMove);
    canvas.removeEventListener('mouseup', handleMouseUp);
    canvas.removeEventListener('contextmenu', handleContextMenu);
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

function checkGrounding() {
  // Simple grounding check using Matter.Query
  playerSlots.forEach(player => {
    if (!player) return;
    const bodies = Composite.allBodies(engine.world);
    const groundBodies = bodies.filter(
      b => b !== player.body && (b.label === 'ground' || b.label === 'platform')
    );
    
    // Check slightly below the player
    const isGrounded = Matter.Query.region(groundBodies, {
      min: { x: player.body.position.x - 18, y: player.body.position.y + 21 },
      max: { x: player.body.position.x + 18, y: player.body.position.y + 25 }
    }).length > 0;
    
    player.update(isGrounded);
  });
}

function draw() {
  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw static bodies (walls/platforms)
  const bodies = Composite.allBodies(engine.world);
  bodies.forEach(body => {
    if (body.isStatic) {
      if (body.vertices) {
        if (body.label === 'door') {
          ctx.fillStyle = levelCompleted ? '#00e676' : '#ffb300';
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
      }
    }
  });

  // Draw players
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
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;
  return { x: snap(x), y: snap(y) };
}

function snap(value: number): number {
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
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
  if (doorBody) {
    const hitDoor = Matter.Query.point([doorBody], p);
    if (hitDoor.length > 0) {
      removeDoor();
      return;
    }
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
    x: snap(canvas.width - 100),
    y: snap(canvas.height - 120),
    w: snap(40),
    h: snap(80)
  };
  setDoor(defaultRect);
}

function ensureSpawn() {
  if (spawnPoint) return;
  spawnPoint = { x: snap(80), y: snap(canvas.height - 140) };
  persistLevel();
}

function getSpawnForSlot(slot: number): { x: number; y: number } {
  const base = spawnPoint ?? { x: snap(80), y: snap(canvas.height - 140) };
  return { x: base.x + slot * 60, y: base.y };
}

function respawnPlayer(slot: number, player: Player) {
  ensureSpawn();
  const spawn = getSpawnForSlot(slot);
  Matter.Body.setPosition(player.body, { x: spawn.x, y: spawn.y });
  Matter.Body.setVelocity(player.body, { x: 0, y: 0 });
  Matter.Body.setAngularVelocity(player.body, 0);
}

function updateDoor() {
  if (!doorBody) {
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
  for (const body of spikeBodies) {
    Composite.remove(engine.world, body);
  }
  spikeBodies = [];
  spikeRects = [];
  if (doorBody) {
    Composite.remove(engine.world, doorBody);
  }
  doorBody = null;
  doorRect = null;
  spawnPoint = null;
  levelCompleted = false;
  completionFrames = 0;
  localStorage.removeItem(LEVEL_STORAGE_KEY);
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

  for (const body of platformBodies) {
    Composite.remove(engine.world, body);
  }
  platformBodies = [];
  levelRects = [];
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
  spawnPoint = null;
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

  ensureDoor();
  ensureSpawn();
  persistLevel();
}

function persistLevel() {
  const state: LevelState = { platforms: levelRects, door: doorRect, spawn: spawnPoint, spikes: spikeRects };
  localStorage.setItem(LEVEL_STORAGE_KEY, JSON.stringify(state));
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
    return { platforms, door: null, spawn: null, spikes: [] };
  }

  if (!input || typeof input !== 'object') return null;
  const obj = input as { platforms?: unknown; door?: unknown; spawn?: unknown; spikes?: unknown };
  if (!Array.isArray(obj.platforms)) return null;

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

  const spikes: LevelRect[] = [];
  if (obj.spikes !== null && obj.spikes !== undefined) {
    if (!Array.isArray(obj.spikes)) return null;
    for (const item of obj.spikes) {
      const rect = parseRect(item);
      if (!rect) return null;
      spikes.push(rect);
    }
  }

  return { platforms, door, spawn, spikes };
}
