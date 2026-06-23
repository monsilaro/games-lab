// Kill-burst debris: pooled voxel cubes that fly out of a dying robot and
// shrink away. Kinematic (no matter bodies — cheaper and self-bounded), capped
// at DEBRIS.globalCap so explosions can never blow the frame budget. Shared
// geometry + material → zero per-burst allocation.

import * as THREE from 'three';
import * as C from './config';

interface Cube {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  ttl: number;
  alive: boolean;
}

export class Debris {
  private readonly pool: Cube[] = [];

  constructor(scene: THREE.Scene) {
    const geo = new THREE.BoxGeometry(C.DEBRIS.size, C.DEBRIS.size, C.DEBRIS.size);
    const mat = new THREE.MeshLambertMaterial({ color: C.PALETTE.enemy, flatShading: true });
    for (let i = 0; i < C.DEBRIS.globalCap; i++) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      scene.add(mesh);
      this.pool.push({ mesh, vx: 0, vy: 0, vz: 0, ttl: 0, alive: false });
    }
  }

  /** Spawn a burst at matter (mx, my) — world (mx, 0, my). */
  burst(mx: number, my: number): void {
    let spawned = 0;
    for (const c of this.pool) {
      if (spawned >= C.DEBRIS.perEnemy) break;
      if (c.alive) continue;
      const a = Math.random() * Math.PI * 2;
      const sp = C.DEBRIS.speed * (0.5 + Math.random() * 0.5);
      c.vx = Math.cos(a) * sp;
      c.vz = Math.sin(a) * sp;
      c.vy = C.DEBRIS.speed * (0.5 + Math.random() * 0.6); // pop up
      c.ttl = C.DEBRIS.lifetime;
      c.alive = true;
      c.mesh.visible = true;
      c.mesh.scale.setScalar(1);
      c.mesh.position.set(mx, 0.5, my);
      c.mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      spawned += 1;
    }
  }

  tick(dt: number): void {
    for (const c of this.pool) {
      if (!c.alive) continue;
      c.ttl -= dt;
      if (c.ttl <= 0) {
        c.alive = false;
        c.mesh.visible = false;
        continue;
      }
      c.vy -= C.DEBRIS.gravity * dt;
      c.mesh.position.x += c.vx * dt;
      c.mesh.position.y += c.vy * dt;
      c.mesh.position.z += c.vz * dt;
      if (c.mesh.position.y < 0.1) c.mesh.position.y = 0.1; // settle on the floor
      c.mesh.scale.setScalar(Math.max(0.01, c.ttl / C.DEBRIS.lifetime));
      c.mesh.rotation.x += dt * 4;
    }
  }

  reset(): void {
    for (const c of this.pool) {
      c.alive = false;
      c.mesh.visible = false;
    }
  }
}
