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

export type GameApi = {
  toggleEditor: () => boolean;
  setEditorEnabled: (enabled: boolean) => boolean;
  getEditorEnabled: () => boolean;
  exportLevel: () => string;
  importLevel: (json: string) => void;
  saveLevel: () => void;
  loadLevel: () => void;
  clearLevel: () => void;
};

let editorEnabled = false;
let levelRects: LevelRect[] = [];
let platformBodies: Matter.Body[] = [];
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
  const ground = Bodies.rectangle(width / 2, height - wallThickness / 2, width + 10, wallThickness, { isStatic: true, label: 'ground' });
  const leftWall = Bodies.rectangle(wallThickness / 2 - 20, height / 2, wallThickness, height, { isStatic: true, label: 'ground' });
  const rightWall = Bodies.rectangle(width - wallThickness / 2 + 20, height / 2, wallThickness, height, { isStatic: true, label: 'ground' });
  const ceiling = Bodies.rectangle(width / 2, wallThickness / 2 - 20, width + 10, wallThickness, { isStatic: true, label: 'ground' });
  
  Composite.add(engine.world, [ground, leftWall, rightWall, ceiling]);

  loadLevelFromStorage();

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
    const newPlayer = new Player(
      gp.index,
      gp.id,
      100 + slot * 150,
      canvas.height - 100,
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
    addPlatform(rect);
  };

  const handleContextMenu = (e: MouseEvent) => {
    if (!editorEnabled) return;
    e.preventDefault();
    const p = toCanvasPoint(e);
    const bodies = Matter.Query.point(platformBodies, p);
    if (bodies.length === 0) return;
    const body = bodies[0];
    removePlatformBody(body);
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
    exportLevel: () => JSON.stringify(levelRects),
    importLevel: (json: string) => {
      loadLevelFromJson(json);
    },
    saveLevel: () => {
      localStorage.setItem(LEVEL_STORAGE_KEY, JSON.stringify(levelRects));
    },
    loadLevel: () => {
      loadLevelFromStorage();
    },
    clearLevel: () => {
      clearPlatforms();
    }
  };

  // Game Loop
  const update = () => {
    updateInput();
    checkGrounding();
    
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
      (gp): gp is Gamepad => Boolean(gp) && gp.id === player.gamepadId && !usedIndices.has(gp.index)
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
    const groundBodies = bodies.filter(b => b !== player.body);
    
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
        ctx.fillStyle = body.label === 'platform' ? '#555' : '#333';
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

  if (editorEnabled) {
    if (dragStart && dragCurrent) {
      const r = normalizeRect(dragStart, dragCurrent);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.strokeRect(r.x, r.y, r.w, r.h);
    }
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
  localStorage.setItem(LEVEL_STORAGE_KEY, JSON.stringify(levelRects));
}

function removePlatformBody(body: Matter.Body) {
  const idx = platformBodies.indexOf(body);
  if (idx === -1) return;
  Composite.remove(engine.world, body);
  platformBodies.splice(idx, 1);
  levelRects.splice(idx, 1);
  localStorage.setItem(LEVEL_STORAGE_KEY, JSON.stringify(levelRects));
}

function clearPlatforms() {
  for (const body of platformBodies) {
    Composite.remove(engine.world, body);
  }
  platformBodies = [];
  levelRects = [];
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

  if (!Array.isArray(parsed)) return;
  const next: LevelRect[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object') return;
    const r = item as Partial<LevelRect>;
    if (
      typeof r.x !== 'number' ||
      typeof r.y !== 'number' ||
      typeof r.w !== 'number' ||
      typeof r.h !== 'number'
    ) {
      return;
    }
    if (r.w <= 0 || r.h <= 0) return;
    next.push({ x: r.x, y: r.y, w: r.w, h: r.h });
  }

  for (const body of platformBodies) {
    Composite.remove(engine.world, body);
  }
  platformBodies = [];
  levelRects = [];

  for (const r of next) {
    const body = Bodies.rectangle(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h, {
      isStatic: true,
      label: 'platform'
    });
    levelRects.push(r);
    platformBodies.push(body);
    Composite.add(engine.world, body);
  }

  localStorage.setItem(LEVEL_STORAGE_KEY, JSON.stringify(levelRects));
}
