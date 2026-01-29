import type { Body } from 'matter-js';

export function drawDoor(
  ctx: CanvasRenderingContext2D,
  body: Body,
  opts: { hasKeyPoint: boolean; doorUnlocked: boolean; levelCompleted: boolean }
) {
  ctx.fillStyle = opts.hasKeyPoint && !opts.doorUnlocked ? '#90a4ae' : opts.levelCompleted ? '#00e676' : '#ffb300';
  ctx.beginPath();
  ctx.moveTo(body.vertices[0].x, body.vertices[0].y);
  for (let i = 1; i < body.vertices.length; i += 1) {
    ctx.lineTo(body.vertices[i].x, body.vertices[i].y);
  }
  ctx.closePath();
  ctx.fill();
}
