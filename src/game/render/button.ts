export function drawButton(ctx: CanvasRenderingContext2D, bx: number, by: number, bw: number, bh: number, pressed: boolean) {
  const baseW = bw;
  const baseH = Math.max(8, Math.round(bh * 0.45));
  const baseX = bx;
  const baseY = by + bh - baseH;
  ctx.fillStyle = '#ff9800';
  ctx.fillRect(baseX, baseY, baseW, baseH);
  const lift = pressed ? Math.round(bh * 0.25) : Math.round(bh * 0.1);
  const topH = Math.max(8, Math.round(bh * 0.5 - (pressed ? 3 : 0)));
  const topX = bx + 4;
  const topY = by + lift;
  ctx.fillStyle = pressed ? '#8b0000' : '#ff0000';
  ctx.fillRect(topX, topY, bw - 8, topH);
  ctx.strokeStyle = pressed ? '#660000' : '#990000';
  ctx.lineWidth = 2;
  ctx.strokeRect(topX, topY, bw - 8, topH);
  ctx.fillStyle = pressed ? '#b22222' : '#ff6b6b';
  ctx.fillRect(topX + 3, topY + 3, bw - 12, 4);
}
