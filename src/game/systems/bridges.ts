import Matter from 'matter-js';
import type { Body } from 'matter-js';
import type { Player } from '../Player';
import type { BridgeDef } from '../Game';

export function updateBridges(
  bridgeBodies: Body[],
  bridgeDefs: BridgeDef[],
  bridgeHomeCenters: Array<{ x: number; y: number }>,
  bridgeActivated: boolean[],
  bridgeLatched: boolean[],
  bridgeCarryX: number[],
  blockBodies: Body[],
  playerSlots: Array<Player | null>
) {
  if (bridgeBodies.length === 0) return;
  const playerBodies = playerSlots.filter((p): p is Player => Boolean(p)).map(p => p.body);
  const step = 2;
  for (let i = 0; i < bridgeBodies.length; i += 1) {
    const body = bridgeBodies[i];
    const def = bridgeDefs[i];
    const home = bridgeHomeCenters[i];
    if (!body || !def || !home) continue;

    let activeByPlayers = false;
    if (def.requiredPlayers && def.requiredPlayers > 0 && playerBodies.length > 0) {
      const region = {
        min: { x: body.bounds.min.x + 4, y: body.bounds.min.y - 8 },
        max: { x: body.bounds.max.x - 4, y: body.bounds.min.y + 6 }
      };
      const count = Matter.Query.region(playerBodies, region).length;
      activeByPlayers = count >= def.requiredPlayers;
    }

    const active = Boolean(bridgeActivated[i]) || Boolean(bridgeLatched[i]) || activeByPlayers;
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
      body.plugin.carryX = 0;
      body.plugin.carryY = 0;
      continue;
    }

    const mag = Math.min(step, dist);
    const mx = (dx / dist) * mag;
    const my = (dy / dist) * mag;
    if (blockBodies.length > 0) {
      const tol = 2;
      const horizontal = Math.abs(mx) >= Math.abs(my);
      let regionMinX: number;
      let regionMaxX: number;
      let regionMinY: number;
      let regionMaxY: number;
      if (horizontal) {
        const slice = 4;
        if (mx > 0) {
          regionMinX = body.bounds.max.x;
          regionMaxX = body.bounds.max.x + slice;
        } else {
          regionMinX = body.bounds.min.x - slice;
          regionMaxX = body.bounds.min.x;
        }
        regionMinY = body.bounds.min.y + tol;
        regionMaxY = body.bounds.max.y - tol;
      } else {
        const slice = 4;
        regionMinX = body.bounds.min.x + tol;
        regionMaxX = body.bounds.max.x - tol;
        if (my > 0) {
          regionMinY = body.bounds.max.y;
          regionMaxY = body.bounds.max.y + slice;
        } else {
          regionMinY = body.bounds.min.y - slice;
          regionMaxY = body.bounds.min.y;
        }
      }
      const region = { min: { x: regionMinX, y: regionMinY }, max: { x: regionMaxX, y: regionMaxY } };
      let obstructors = Matter.Query.region(blockBodies, region);
      if (horizontal && obstructors.length > 0) {
        obstructors = obstructors.filter(b => b.bounds.max.y > body.bounds.min.y + tol);
      }
      if (!horizontal && my < 0 && obstructors.length > 0) {
        obstructors = obstructors.filter(b => Math.abs(b.bounds.max.y - body.bounds.min.y) > tol);
      }
      if (obstructors.length > 0) {
        bridgeCarryX[i] = 0;
        Matter.Body.setVelocity(body, { x: 0, y: 0 });
        Matter.Body.setAngularVelocity(body, 0);
        body.plugin.carryX = 0;
        body.plugin.carryY = 0;
        continue;
      }
    }
    Matter.Body.setPosition(body, { x: body.position.x + mx, y: body.position.y + my });
    Matter.Body.setVelocity(body, { x: 0, y: 0 });
    Matter.Body.setAngularVelocity(body, 0);
    bridgeCarryX[i] = mx;
    body.plugin.carryX = mx;
    body.plugin.carryY = my;
  }
}
