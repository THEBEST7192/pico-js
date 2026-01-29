export function setSpawnPoint(p: { x: number; y: number }): { x: number; y: number } {
  return { x: p.x, y: p.y };
}

export function ensureSpawn(
  spawnPoint: { x: number; y: number } | null,
  levelConfig: { width: number; height: number },
  snap: (n: number) => number
): { x: number; y: number } {
  if (spawnPoint) return spawnPoint;
  return { x: snap(80), y: snap(levelConfig.height - 140) };
}

export function getSpawnForSlot(
  slot: number,
  spawnPoint: { x: number; y: number } | null,
  canvas: { width: number; height: number },
  snap: (n: number) => number
): { x: number; y: number } {
  const base = spawnPoint ?? { x: snap(80), y: snap(canvas.height - 140) };
  return { x: base.x + slot * 60, y: base.y };
}
