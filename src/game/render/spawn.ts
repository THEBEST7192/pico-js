export function drawSpawn(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = '#00e676';
  ctx.beginPath();
  ctx.arc(x, y, 10, 0, Math.PI * 2);
  ctx.fill();
}
