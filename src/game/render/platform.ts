import type { Body } from 'matter-js';

export function drawPlatform(ctx: CanvasRenderingContext2D, body: Body) {
  ctx.fillStyle = '#555';
  ctx.beginPath();
  ctx.moveTo(body.vertices[0].x, body.vertices[0].y);
  for (let i = 1; i < body.vertices.length; i += 1) {
    ctx.lineTo(body.vertices[i].x, body.vertices[i].y);
  }
  ctx.closePath();
  ctx.fill();
}
