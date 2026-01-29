export function drawKey(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  const bowR = Math.max(6, Math.round(r * 0.7));
  const stemLen = Math.max(14, Math.round(r * 1.8));
  const stemW = Math.max(4, Math.round(r * 0.5));
  const startX = cx - stemLen / 2 + bowR - Math.round(stemW * 0.5);
  ctx.fillStyle = '#fdd835';
  ctx.fillRect(startX, cy - stemW / 2, stemLen, stemW);
  const toothW = Math.max(3, Math.round(stemW * 0.6));
  const toothH = Math.max(4, Math.round(stemW));
  const endX = startX + stemLen - toothW;
  ctx.fillRect(endX, cy + stemW / 2 - 1, toothW, toothH);
  ctx.fillRect(endX - toothW - 3, cy + stemW / 2 - 1, toothW, Math.round(toothH * 0.7));
  ctx.strokeStyle = '#bfa100';
  ctx.strokeRect(startX, cy - stemW / 2, stemLen, stemW);
  ctx.fillStyle = '#ffeb3b';
  ctx.strokeStyle = '#bfa100';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx - stemLen / 2, cy, bowR, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.arc(cx - stemLen / 2, cy, Math.round(bowR * 0.45), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
