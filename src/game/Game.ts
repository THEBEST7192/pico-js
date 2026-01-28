import Matter from 'matter-js';
import { Player } from './Player';

const { Engine, Render, Runner, Bodies, Composite, Events } = Matter;

let engine: Matter.Engine;
let runner: Matter.Runner;
let players: Player[] = [];
let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;

const PLAYER_COLORS = ['#ff4d4d', '#4dff4d', '#4d4dff', '#ffff4d'];

export function initGame(canvasElement: HTMLCanvasElement) {
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

  // Handle Gamepad connection
  const handleGamepadConnected = (e: GamepadEvent) => {
    addPlayer(e.gamepad.index);
  };

  const handleGamepadDisconnected = (e: GamepadEvent) => {
    console.log(`Player ${e.gamepad.index} disconnected!`);
    const index = players.findIndex(p => p.gamepadIndex === e.gamepad.index);
    if (index !== -1) {
      Composite.remove(engine.world, players[index].body);
      players.splice(index, 1);
    }
  };

  const addPlayer = (gamepadIndex: number) => {
    if (players.find(p => p.gamepadIndex === gamepadIndex)) return;
    
    console.log(`Player ${gamepadIndex} connected!`);
    const playerIndex = players.length;
    if (playerIndex < 4) {
      const newPlayer = new Player(
        gamepadIndex, 
        100 + playerIndex * 150, 
        canvas.height - 100, 
        PLAYER_COLORS[playerIndex]
      );
      players.push(newPlayer);
      Composite.add(engine.world, newPlayer.body);
    }
  };

  window.addEventListener("gamepadconnected", handleGamepadConnected);
  window.addEventListener("gamepaddisconnected", handleGamepadDisconnected);

  // Initial check for already connected gamepads
  const initialGamepads = navigator.getGamepads();
  for (const gp of initialGamepads) {
    if (gp) addPlayer(gp.index);
  }

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
  return () => {
    window.removeEventListener("gamepadconnected", handleGamepadConnected);
    window.removeEventListener("gamepaddisconnected", handleGamepadDisconnected);
    Runner.stop(runner);
    Engine.clear(engine);
    players = [];
  };
}

function updateInput() {
  const gamepads = navigator.getGamepads();
  players.forEach(player => {
    const gp = gamepads[player.gamepadIndex];
    if (gp) {
      player.handleInput(gp);
    }
  });
}

function checkGrounding() {
  // Simple grounding check using Matter.Query
  players.forEach(player => {
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

  // Draw static bodies (walls)
  const bodies = Composite.allBodies(engine.world);
  ctx.fillStyle = '#333';
  bodies.forEach(body => {
    if (body.isStatic) {
      const { x, y } = body.position;
      // Assume they are rectangles for simplicity in this clone
      if (body.vertices) {
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
  players.forEach(player => player.draw(ctx));
}
