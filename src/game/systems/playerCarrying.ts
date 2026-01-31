import Matter, { Composite, Query, type Engine, Events } from 'matter-js';
import type { Player } from '../Player';

type BodyWithPrev = Matter.Body & { positionPrev: { x: number; y: number } };

export function initPlayerCarrying(
  engine: Engine,
  getPlayerSlots: () => Array<Player | null>
) {
  const onAfterUpdate = () => {
    const playerSlots = getPlayerSlots();
    const allBodies = Composite.allBodies(engine.world);
    const supportLabels = new Set(['bridge', 'block', 'player']);

    for (const player of playerSlots) {
      if (!player) continue;

      // Check what's below the player
      const regionBelow = {
        min: { x: player.body.bounds.min.x + 5, y: player.body.bounds.max.y + 1 },
        max: { x: player.body.bounds.max.x - 5, y: player.body.bounds.max.y + 6 }
      };
      
      const candidates = allBodies.filter(b => b !== player.body && supportLabels.has(b.label));
      const belowBodies = Query.region(candidates, regionBelow);
      
      let carry = 0;
      for (const support of belowBodies) {
          let dx = 0;
          const s = support as unknown as BodyWithPrev;
          if (support.label === 'bridge') {
              dx = support.plugin.carryX || 0;
          } else if (support.isStatic) {
              dx = support.plugin.carryX || 0;
          } else {
              dx = s.position.x - s.positionPrev.x;
          }
          
          if (Math.abs(dx) > 0.01) {
              carry = dx;
              break;
          }
      }

      if (Math.abs(carry) > 0.01) {
          // Move player manually to follow support
          Matter.Body.setPosition(player.body, { 
              x: player.body.position.x + carry, 
              y: player.body.position.y 
          });
      }
    }
  };

  Events.on(engine, 'afterUpdate', onAfterUpdate);

  return () => {
    Events.off(engine, 'afterUpdate', onAfterUpdate);
  };
}
