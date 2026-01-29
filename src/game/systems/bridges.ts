import Matter from 'matter-js';
import type { Body } from 'matter-js';
import type { LevelRect } from '../Game';

export function updateBridges(
  bridgeBodies: Body[],
  bridgeDefs: Array<LevelRect & { id: number; dx: number; dy: number; distance: number; permanent: boolean }>,
  bridgeHomeCenters: Array<{ x: number; y: number }>,
  bridgeActivated: boolean[],
  bridgeLatched: boolean[],
  bridgeCarryX: number[]
) {
  if (bridgeBodies.length === 0) return;
  const step = 2;
  for (let i = 0; i < bridgeBodies.length; i += 1) {
    const body = bridgeBodies[i];
    const def = bridgeDefs[i];
    const home = bridgeHomeCenters[i];
    if (!body || !def || !home) continue;

    const active = Boolean(bridgeActivated[i]) || Boolean(bridgeLatched[i]);
    const target = active
      ? { x: home.x + def.dx * def.distance, y: home.y + def.dy * def.distance }
      : home;

    const dx = target.x - body.position.x;
    const dy = target.y - body.position.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.001) {
      bridgeCarryX[i] = 0;
      Matter.Body.setVelocity(body, { x: 0, y: 0 });
      Matter.Body.setAngularVelocity(body, 0);
      continue;
    }

    const mag = Math.min(step, dist);
    const mx = (dx / dist) * mag;
    const my = (dy / dist) * mag;
    Matter.Body.setPosition(body, { x: body.position.x + mx, y: body.position.y + my });
    Matter.Body.setVelocity(body, { x: 0, y: 0 });
    Matter.Body.setAngularVelocity(body, 0);
    bridgeCarryX[i] = mx;
  }
}
