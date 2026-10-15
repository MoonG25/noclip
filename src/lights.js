// 형광등 수백 개를 다 광원으로 만들 수는 없으니, 카메라 근처 몇 개에만 PointLight를 붙인다.
import * as THREE from 'three';
import { hash1 } from './rng.js';

const POOL = 8;

export class LightRig {
  constructor(scene) {
    this.lights = [];
    for (let i = 0; i < POOL; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 10, 2);
      scene.add(l);
      this.lights.push(l);
    }
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 1);
    scene.add(this.hemi);
    this.localLight = 1;
    this.blackout = 0;
  }

  setLevel(level) {
    const t = level.theme;
    this.level = level;
    this.base = t.lights.intensity;
    for (const l of this.lights) {
      l.color.setHex(t.lights.color);
      l.distance = t.lights.distance;
    }
    this.hemi.color.setHex(t.ambient.sky);
    this.hemi.groundColor.setHex(t.ambient.ground);
    this.hemi.intensity = t.ambient.intensity;
    this.ambientBase = t.ambient.intensity;
  }

  // 정전 연출 (0~1). 엔티티가 처음 깨어날 때 쓴다.
  flash(dur) {
    this.blackout = Math.max(this.blackout, dur);
  }

  update(dt, time, cam, entity) {
    const lv = this.level;
    const fx = lv.fixtures;
    const ex = entity.active ? entity.pos.x : 1e9;
    const ez = entity.active ? entity.pos.z : 1e9;
    // 엔티티가 지나가면 근처 형광등이 버티지 못한다 (세기는 엔티티마다 다르다)
    const fl = (entity.cfg && entity.cfg.flicker) || { radius: 7, chance: 0.85 };
    this.blackout = Math.max(0, this.blackout - dt);
    const out = this.blackout > 0;
    const slot = Math.floor(time * 14);

    for (let i = 0; i < fx.length; i++) {
      const f = fx[i];
      let b = f.state === 0 ? 0 : 1;
      if (f.state === 2) {
        // 대부분 켜져 있다가 가끔 덜덜 떤다
        const w = Math.sin(time * 0.5 + f.phase) * Math.sin(time * 1.3 + f.phase * 2);
        if (w > 0.55) b = hash1(slot + f.phase) > 0.45 ? 1 : 0.08;
      }
      const we = lv.wrapDelta(f.x - ex, f.z - ez);
      const de = Math.hypot(we.x, we.z);
      if (de < fl.radius && b > 0) {
        const p = (1 - de / fl.radius) * fl.chance;
        if (hash1(slot * 1.7 + f.phase) < p) b = 0.05;
      }
      if (out) b = 0;
      if (Math.abs(b - f.b) > 0.01) {
        f.b = b;
        lv.setFixture(i, b);
        this._dirty = true;
      }
    }
    if (this._dirty) {
      lv.panelMesh.geometry.attributes.color.needsUpdate = true;
      if (lv.lightPool) lv.lightPool.geometry.attributes.color.needsUpdate = true;
      this._dirty = false;
    }

    // 가까운 등 순서로 광원 배정
    const near = [];
    for (let i = 0; i < fx.length; i++) {
      const f = fx[i];
      if (f.state === 0) continue;
      const w = lv.wrapDelta(f.x - cam.x, f.z - cam.z);
      const d = w.x * w.x + w.z * w.z;
      if (d > 196) continue;
      near.push([d, f, cam.x + w.x, cam.z + w.z]);
    }
    near.sort((a, b) => a[0] - b[0]);
    this.nearest = near; // 소리도 같은 등을 쓴다 (형광등 웅웅거림)
    let local = 0;
    for (let i = 0; i < POOL; i++) {
      const l = this.lights[i];
      const n = near[i];
      if (!n) {
        l.intensity = 0;
        continue;
      }
      const f = n[1];
      l.position.set(n[2], lv.wallH - 0.35, n[3]);
      l.intensity = this.base * f.b;
      local += f.b * Math.max(0, 1 - Math.sqrt(n[0]) / 7);
    }
    this.localLight = Math.min(1, local);
    this.hemi.intensity = this.ambientBase * (out ? 0.15 : 1);
    return this.localLight;
  }
}
