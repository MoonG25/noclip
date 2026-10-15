// LEVEL 2 · 익사체
// 물에 불어 푸르스름한 몸. 평소엔 수영장 바닥에 엎드려 미끄러지듯 헤엄친다.
// 물속에서만 움직이고, 눈 대신 물의 떨림으로 사냥한다. 물 밖으로는 나오지 않지만
// 물가까지 따라와 몸을 일으키고 기다린다. 가장자리에 너무 붙어 서 있으면 끌고 들어간다.
import * as THREE from 'three';
import { EntityBase, WANDER, CHASE, SEARCH } from './base.js';
import { POOL_FLOOR } from '../level.js';

const WAIT = 'wait';
const _v = new THREE.Vector3();

export class Drowned extends EntityBase {
  get awakeMessage() {
    return '…어딘가에서 물이 출렁이기 시작했다';
  }

  passable(level) {
    return (i) => level.water[i] === 1;
  }

  _build(tex) {
    const g = new THREE.Group();
    const skin = new THREE.MeshLambertMaterial({ map: tex.drownedSkin, emissive: 0x0c1418 });
    this.skinMat = skin;
    this.faceMat = new THREE.MeshLambertMaterial({ map: tex.drownedFace, emissive: 0x141c1e });
    const add = (parent, geo, mat, x = 0, y = 0, z = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      parent.add(m);
      return m;
    };
    const pivot = (parent, x, y, z) => {
      const p = new THREE.Group();
      p.position.set(x, y, z);
      parent.add(p);
      return p;
    };
    // 골반이 원점. body를 x축으로 눕히면 엎드려 헤엄치는 자세가 된다
    const body = pivot(g, 0, 0, 0);
    this.body = body;
    add(body, new THREE.CapsuleGeometry(0.16, 0.42, 4, 10), skin, 0, 0.4, 0).scale.set(1, 1, 0.78);
    add(body, new THREE.SphereGeometry(0.17, 10, 8), skin, 0, 0.12, 0.02).scale.set(1, 0.7, 0.85); // 부풀어 오른 배
    add(body, new THREE.CylinderGeometry(0.05, 0.065, 0.16, 8), skin, 0, 0.78, 0);
    const head = pivot(body, 0, 0.93, 0.01);
    add(head, new THREE.SphereGeometry(0.135, 22, 14), this.faceMat).scale.set(0.92, 1.18, 1);
    this.head = head;

    // 팔: 무릎까지 내려오는 길고 가는 팔, 물갈퀴처럼 벌어진 손가락
    this.arms = [];
    for (const s of [-1, 1]) {
      const sh = pivot(body, s * 0.21, 0.7, 0);
      add(sh, new THREE.SphereGeometry(0.06, 8, 6), skin);
      add(sh, new THREE.CylinderGeometry(0.045, 0.038, 0.4, 8), skin, 0, -0.2, 0);
      const el = pivot(sh, 0, -0.4, 0);
      add(el, new THREE.CylinderGeometry(0.036, 0.028, 0.42, 8), skin, 0, -0.21, 0);
      const hand = pivot(el, 0, -0.43, 0);
      add(hand, new THREE.SphereGeometry(0.04, 8, 6), skin).scale.set(0.9, 0.6, 1.2);
      for (let f = -2; f <= 2; f++) {
        const fg = add(hand, new THREE.CylinderGeometry(0.008, 0.005, 0.13, 5), skin, f * 0.014, -0.07, 0.01);
        fg.rotation.z = f * 0.12;
      }
      this.arms.push({ sh, el });
    }
    // 다리
    this.legs = [];
    for (const s of [-1, 1]) {
      const hip = pivot(body, s * 0.1, 0, 0);
      add(hip, new THREE.CylinderGeometry(0.065, 0.05, 0.46, 8), skin, 0, -0.23, 0);
      const kn = pivot(hip, 0, -0.46, 0);
      add(kn, new THREE.CylinderGeometry(0.05, 0.035, 0.44, 8), skin, 0, -0.22, 0);
      add(kn, new THREE.SphereGeometry(1, 8, 5), skin, 0, -0.46, 0.04).scale.set(0.045, 0.03, 0.1);
      this.legs.push({ hip, kn });
    }
    return g;
  }

  setScream(on) {
    this.faceMat.map = on ? this.tex.drownedScream : this.tex.drownedFace;
  }

  // 위치는 수영장 바닥 기준. 몸을 얼마나 일으켰는지에 따라 높이가 달라진다
  syncMesh() {
    this.mesh.position.set(this.pos.x, POOL_FLOOR + 0.24 + (this.upright || 0) * 0.68, this.pos.z);
  }

  reset(level, theme) {
    super.reset(level, theme);
    this.upright = 0;
    this.waitT = 0;
    this.arrived = false;
    this.rippleT = 0;
    this.relocate = null;
    this.huntTarget = null;
    this.setScream(false);
  }

  _region(level, x, z) {
    const [cx, cy] = level.cellAt(x, z);
    return level.waterRegion[cy * level.W + cx];
  }

  // 물 위의 떨림만 느낀다. 다른 물 구역이면 배수로를 타고 건너온다
  hear(x, z, radius, level) {
    if (!this.active || !level.isWaterAt(x, z)) return false;
    const d = Math.hypot(x - this.pos.x, z - this.pos.z);
    const eff = radius * this.cfg.hearing;
    if (d > eff) return false;
    if (this._region(level, x, z) !== this._region(level, this.pos.x, this.pos.z)) {
      if (!this.relocate) this.relocate = { t: 3 + Math.random() * 2, x, z };
      return true;
    }
    if (d < eff * 0.6 || this.state === CHASE || this.state === SEARCH || this.state === WAIT) {
      if (this.state !== CHASE) this.pending.push('chase');
      this.state = CHASE;
      this.huntTarget = { x, z };
      this.repath = 0;
      this.path = [];
      this.pauseT = 0;
      this.arrived = false;
    } else this._goInvestigate(x, z, level);
    return true;
  }

  // 플레이어가 물 밖으로 나갔다: 가장 가까운 물가로 가서 몸을 일으키고 기다린다
  _goWait(level, player) {
    const W = level.W;
    const S = level.S;
    const [ex, ey] = level.cellAt(this.pos.x, this.pos.z);
    const reg = level.waterRegion[ey * W + ex];
    let best = -1;
    let bd = Infinity;
    for (let i = 0; i < level.water.length; i++) {
      if (level.waterRegion[i] !== reg) continue;
      const c = level.center(i % W, (i / W) | 0);
      const d = Math.hypot(c.x - player.pos.x, c.z - player.pos.z);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    if (best < 0 || bd > 9) {
      this._goSearch(level.cellAt(this.pos.x, this.pos.z), 6, 1);
      return;
    }
    const wx = best % W;
    const wy = (best / W) | 0;
    this.state = WAIT;
    this.arrived = false;
    this.waitT = 7 + Math.random() * 4;
    this.path = level.findPath(ex, ey, wx, wy, this.passable(level));
    this.waitPos = {
      x: Math.max(wx * S + 0.45, Math.min((wx + 1) * S - 0.45, player.pos.x)),
      z: Math.max(wy * S + 0.45, Math.min((wy + 1) * S - 0.45, player.pos.z)),
    };
  }

  _relocate(level, player) {
    const r = this.relocate;
    this.relocate = null;
    const W = level.W;
    const reg = this._region(level, r.x, r.z);
    const opts = [];
    for (let i = 0; i < level.water.length; i++) {
      if (level.waterRegion[i] !== reg) continue;
      const c = level.center(i % W, (i / W) | 0);
      const d = Math.hypot(c.x - player.pos.x, c.z - player.pos.z);
      if (d >= 7 && d <= 14) opts.push(c);
    }
    if (!opts.length) return false;
    const c = opts[Math.floor(Math.random() * opts.length)];
    this.pos.set(c.x, 0, c.z);
    this.syncMesh();
    this._goInvestigate(r.x, r.z, level);
    return true;
  }

  update(dt, { level, player, time, camera }) {
    const ev = [];
    if (this._sleeping(dt, ev)) return ev;
    this._sense(player, level);
    const pass = this.passable(level);
    const [ex, ey] = level.cellAt(this.pos.x, this.pos.z);
    const pIn = player.inWater;
    const same = pIn && this._region(level, player.pos.x, player.pos.z) === this._region(level, this.pos.x, this.pos.z);

    // 바로 옆이면 소리가 없어도 안다
    if (same && this.dist < 2.2 && this.state !== CHASE) {
      this.state = CHASE;
      this.huntTarget = { x: player.pos.x, z: player.pos.z };
      this.path = [];
      ev.push('chase');
    }
    // 쫓던 중에 물 밖으로 나가면 물가에서 기다린다
    if ((this.state === CHASE || this.state === 'investigate') && !pIn && this.dist < 12) this._goWait(level, player);

    if (this.relocate) {
      this.relocate.t -= dt;
      if (this.relocate.t <= 0 && this._relocate(level, player)) ev.push('listen');
    }

    let target = null;
    let speed = this.cfg.wander;
    let canMove = true;
    let face = null;
    if (this.state === WAIT) {
      speed = this.cfg.investigate;
      if (!this.path.length) {
        const w = this.waitPos || (this.waitPos = { x: this.pos.x, z: this.pos.z });
        if (Math.hypot(w.x - this.pos.x, w.z - this.pos.z) > 0.3 && !this.arrived) target = w;
        else {
          if (!this.arrived) ev.push('listen');
          this.arrived = true;
          canMove = false;
          face = player.pos;
          this.waitT -= dt;
        }
      }
      if (pIn && this.dist < 3.5) {
        this.state = CHASE;
        this.huntTarget = { x: player.pos.x, z: player.pos.z };
        this.path = [];
        this.arrived = false;
        ev.push('chase');
      } else if (this.waitT <= 0 && this.arrived) {
        // 물속으로 다시 가라앉아 멀어진다
        this.arrived = false;
        this.state = WANDER;
        const c = level.randomCellAround(ex, ey, 4, 10, pass);
        this.path = level.findPath(ex, ey, ...c, pass);
        ev.push('lost');
      }
    }
    if (this.state === CHASE) {
      speed = this.cfg.chase;
      const h = this.huntTarget;
      if (same && this.dist < 5 && this.los) {
        h.x = player.pos.x;
        h.z = player.pos.z;
      }
      if (Math.hypot(h.x - this.pos.x, h.z - this.pos.z) < 0.7) {
        this._goSearch(level.cellAt(h.x, h.z), 8, 1);
        ev.push('lost');
      } else target = this._chaseTarget(dt, level, ex, ey, h, this.dist < 5 && this.los);
    } else if (this.state !== WAIT) ({ target, speed } = this._routine(dt, level, player, ex, ey));

    const moving = this._move(dt, level, target, speed, face, canMove);
    if (face) this.yaw = Math.atan2(face.x - this.pos.x, face.z - this.pos.z);
    if (moving) this._footstep(dt, this.state === CHASE ? 1.4 : 1.1, ev);

    // 물속에서 잡히거나, 물가에 너무 붙어 서 있다가 끌려 들어간다
    if (this.los && ((pIn && this.dist < 1.0) || (this.arrived && this.dist < 0.85))) ev.push('caught');

    // 물결: 헤엄칠 때는 머리 위로, 서 있을 때는 몸 둘레로
    this.rippleT -= dt;
    if (this.rippleT <= 0) {
      const hunt = this.state === CHASE;
      if (moving) {
        this.rippleT = hunt ? 0.16 : 0.32;
        const hx = this.pos.x + Math.sin(this.yaw) * 0.6;
        const hz = this.pos.z + Math.cos(this.yaw) * 0.6;
        level.ripple(hx, hz, hunt ? 1.1 : 0.8, hunt ? 0.6 : 0.35);
      } else if (this.upright > 0.5) {
        this.rippleT = 0.9;
        level.ripple(this.pos.x, this.pos.z, 1.2, 0.45);
      } else this.rippleT = 0.5;
    }

    const up = (this.state === WAIT && this.arrived) || (this.state === CHASE && pIn && this.dist < 2.2) ? 1 : 0;
    this.upright += (up - this.upright) * Math.min(1, dt * 2.5);
    this._animate(dt, time, moving, camera);
    return this._flush(ev);
  }

  jumpscarePose() {
    this.upright = 1;
    this.setScream(true);
    this.syncMesh();
    this.body.rotation.x = 0.45;
    for (const a of this.arms) {
      a.sh.rotation.x = -1.45;
      a.el.rotation.x = -0.2;
    }
  }

  _animate(dt, time, moving, camera) {
    const u = this.upright;
    const hunt = this.state === CHASE;
    // 물속에서는 검은 그림자, 몸을 일으키면 창백한 살갗이 드러난다
    const shade = 0.12 + 0.88 * Math.min(1, u * 1.4);
    this.skinMat.color.setScalar(shade);
    this.faceMat.color.setScalar(shade);
    this.setScream(hunt && u > 0.5);
    this.walk += this.speed * dt * 2;
    const w = this.walk;
    const k = moving ? 1 : 0.25;
    this.mesh.position.set(this.pos.x, POOL_FLOOR + 0.24 + u * 0.68 + Math.sin(time * 1.3) * 0.02 * (1 - u), this.pos.z);
    this.mesh.rotation.y = this.yaw;
    // 엎드림(π/2) ↔ 일어섬(살짝 앞으로 기울어짐)
    this.body.rotation.set(Math.PI / 2 - 0.04 + (0.12 - (Math.PI / 2 - 0.04)) * u, 0, Math.sin(w) * 0.12 * k * (1 - u));
    for (let i = 0; i < 2; i++) {
      const s = i ? 1 : -1;
      const a = this.arms[i];
      // 헤엄칠 땐 몸에 붙여 뒤로 흐르고, 서면 축 늘어진다. 쫓아올 땐 앞으로 뻗는다
      const swim = Math.sin(w + i * Math.PI) * 0.25 * k;
      const reach = hunt ? -1.3 : 0;
      a.sh.rotation.x = swim * (1 - u) + reach * u;
      a.sh.rotation.z = s * (0.08 + 0.1 * (1 - u));
      a.el.rotation.x = -0.25 * u;
      const l = this.legs[i];
      l.hip.rotation.x = Math.sin(w * 1.6 + i * Math.PI) * 0.35 * k * (1 - u);
      l.kn.rotation.x = Math.max(0, Math.sin(w * 1.6 + i * Math.PI)) * 0.5 * k * (1 - u);
    }
    if (u > 0.4) {
      // 몸을 일으키면 고개를 꺾어 플레이어를 노려본다
      this.head.lookAt(camera.getWorldPosition(_v));
      this.head.rotateZ(0.35 + Math.sin(time * 0.8) * 0.08 + (Math.random() < 0.03 ? (Math.random() - 0.5) * 0.8 : 0));
    } else this.head.rotation.set(-1.2 * (1 - u), Math.sin(time * 0.9) * 0.2, 0);
  }
}
