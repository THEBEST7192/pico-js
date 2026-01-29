 import type { Body } from 'matter-js';

export function drawBridge(ctx: CanvasRenderingContext2D, body: Body, permanent: boolean) {
  ctx.fillStyle = permanent ? '#7c4dff' : '#00bcd4';
  ctx.beginPath();
  ctx.moveTo(body.vertices[0].x, body.vertices[0].y);
  for (let i = 1; i < body.vertices.length; i += 1) {
    ctx.lineTo(body.vertices[i].x, body.vertices[i].y);
  }
  ctx.closePath();
  ctx.fill();
}
