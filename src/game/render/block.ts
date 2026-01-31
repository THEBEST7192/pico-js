import type { Body } from 'matter-js';

export function drawBlock(
  ctx: CanvasRenderingContext2D,
  body: Body,
  opts: { required?: number; pushers?: number; color?: string }
) {
  ctx.fillStyle = opts.color ?? '#ff9800';
  ctx.beginPath();
  ctx.moveTo(body.vertices[0].x, body.vertices[0].y);
  for (let i = 1; i < body.vertices.length; i += 1) {
    ctx.lineTo(body.vertices[i].x, body.vertices[i].y);
  }
  ctx.closePath();
  ctx.fill();

  const { min, max } = body.bounds;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  const minX = Math.round(min.x);
  const minY = Math.round(min.y);
  const maxX = Math.round(max.x);
  const maxY = Math.round(max.y);
  ctx.strokeRect(minX + 2, minY + 2, maxX - minX - 4, maxY - minY - 4);

  const required = opts.required;
  const pushers = opts.pushers ?? 0;
  if (required && required > 0) {
    const remaining = Math.max(0, required - pushers);
    ctx.fillStyle = '#ffffff';
    ctx.font = '28px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(remaining), Math.round(body.position.x), Math.round(body.position.y));
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
  }
}
