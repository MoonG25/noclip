// LEVEL 2 · 익사체
// 물에 불어 퍼런 사람 시체가 수면에 엎드린 채 떠서 미끄러지듯 다가온다. 처음엔 그냥 시체처럼 보인다.
// 가까워지면 목이 180도 돌아가 얼굴을 들고, 사냥할 때는 물속으로 가라앉아 그림자로만 다가온다.
// 물 밖으로는 나오지 않지만 물가에서는 2.5m 넘게 몸을 일으켜 기다린다.
// 물속에서만 움직이고, 눈 대신 물의 떨림으로 사냥한다. 가장자리에 너무 붙어 서 있으면 끌고 들어간다.
import * as THREE from 'three';
import { EntityBase, WANDER, CHASE, SEARCH } from './base.js';
import { POOL_FLOOR, WATER_Y } from '../level.js';

const WAIT = 'wait';
const _v = new THREE.Vector3();
const lerp = (a, b, t) => a + (b - a) * t;
const LEG = 1.32; // 다리 길이: 일어서면 수영장 바닥을 딛고 머리가 눈높이에 온다
const FLOAT_Y = WATER_Y - 0.04; // 떠 있을 때 골반 높이 (등만 수면 위로)
const SINK_Y = POOL_FLOOR + 0.3; // 가라앉았을 때

export class Drowned extends EntityBase {
  get awakeMessage() {
    return '…어딘가에서 물이 출렁이기 시작했다';
  }

  passable(level) {
    return (i) => level.water[i] === 1;
  }

  _build(tex) {
    const g = new THREE.Group();
    const skin = new THREE.MeshLambertMaterial({ map: tex.bloatSkin, emissive: 0x0a1212 });
    const nail = new THREE.MeshLambertMaterial({ color: 0x2a2630 });
    this.skinMat = skin;
    this.faceMat = new THREE.MeshLambertMaterial({ map: tex.bloatFace, emissive: 0x1c2424 });
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
    // 퉁퉁 부은 팔다리 마디: 가운데가 불룩하다
    const swollen = (len, r0, r1) =>
      new THREE.LatheGeometry(
        [
          [r1 * 0.9, -len],
          [r1 * 1.25, -len * 0.75],
          [(r0 + r1) * 0.7, -len * 0.45],
          [r0 * 1.2, -len * 0.15],
          [r0, 0],
        ].map(([rr, y]) => new THREE.Vector2(rr, y)),
        10,
      );
    const hand = (parent) => {
      add(parent, new THREE.SphereGeometry(0.06, 8, 6), skin).scale.set(1, 0.55, 1.25);
      for (let f = -2; f <= 2; f++) {
        const fg = pivot(parent, f * 0.022, -0.02, 0.05);
        fg.rotation.set(1.2, 0, f * 0.2);
        add(fg, new THREE.CylinderGeometry(0.014, 0.011, 0.12, 6), skin, 0, -0.06, 0);
        add(fg, new THREE.SphereGeometry(0.009, 5, 4), nail, 0, -0.125, 0);
      }
    };

    // 몸: 골반을 원점으로 선 자세로 만든다. body를 x축으로 눕히면 엎드려 뜬 자세가 된다
    const body = pivot(g, 0, 0, 0);
    this.body = body;
    add(body, new THREE.CapsuleGeometry(0.21, 0.42, 6, 14), skin, 0, 0.42, 0).scale.set(1.05, 1, 0.82); // 불어 터질 듯한 몸통
    add(body, new THREE.SphereGeometry(0.24, 14, 10), skin, 0, 0.18, 0.06).scale.set(1, 0.85, 0.95); // 부푼 배
    add(body, new THREE.SphereGeometry(0.19, 12, 8), skin, 0, 0.0, 0).scale.set(1.1, 0.7, 0.85); // 골반
    add(body, new THREE.CylinderGeometry(0.08, 0.1, 0.16, 10), skin, 0, 0.8, 0);

    const head = pivot(body, 0, 0.98, 0.01);
    this.head = head;
    add(head, new THREE.SphereGeometry(0.17, 26, 18), this.faceMat).scale.set(1.0, 1.12, 1.0);

    this.arms = [];
    for (const s of [-1, 1]) {
      const sh = pivot(body, s * 0.26, 0.72, 0);
      add(sh, new THREE.SphereGeometry(0.09, 10, 8), skin);
      add(sh, swollen(0.38, 0.08, 0.07), skin);
      const el = pivot(sh, 0, -0.38, 0);
      add(el, swollen(0.36, 0.07, 0.055), skin);
      const wr = pivot(el, 0, -0.38, 0);
      hand(wr);
      this.arms.push({ sh, el, s });
    }
    this.legs = [];
    for (const s of [-1, 1]) {
      const hip = pivot(body, s * 0.12, -0.04, 0);
      add(hip, swollen(LEG * 0.5, 0.11, 0.085), skin);
      const kn = pivot(hip, 0, -LEG * 0.5, 0);
      add(kn, swollen(LEG * 0.5, 0.085, 0.06), skin);
      add(kn, new THREE.SphereGeometry(1, 8, 5), skin, 0, -LEG * 0.5 - 0.02, 0.06).scale.set(0.06, 0.04, 0.13);
      this.legs.push({ hip, kn, s });
    }
    return g;
  }

  setScream(on) {
    this.faceMat.map = on ? this.tex.bloatScream : this.tex.bloatFace;
  }

  // 떠 있을 때는 수면, 사냥할 때는 물속, 일어서면 수영장 바닥을 딛는다
  syncMesh() {
    const u = this.upright || 0;
    const sink = this.sink || 0;
    const lie = lerp(FLOAT_Y, SINK_Y, sink);
    const stand = POOL_FLOOR + LEG + 0.02;
    this.mesh.position.set(this.pos.x, lerp(lie, stand, u) + (this.lungeY || 0), this.pos.z);
  }

  reset(level, theme) {
    super.reset(level, theme);
    this.upright = 0;
    this.sink = 0;
    this.faceUp = 0;
    this.waitT = 0;
    this.arrived = false;
    this.rippleT = 0;
    this.relocate = null;
    this.huntTarget = null;
    this.poseT = 0;
    this.twitch = 0;
    this.lungeY = 0;
    this.faceMat.emissive.setHex(0x1c2424);
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
        this.rippleT = hunt ? 0.08 : 0.16;
        this._jointRipple(level, hunt ? 0.6 : 0.4);
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

  faceCamera(camera) {
    this.head.lookAt(camera.getWorldPosition(_v));
    this.head.rotateZ(0.25 + this.twitch);
  }

  // 덮칠 때는 몸을 앞으로 숙여 얼굴을 카메라 눈높이에 들이민다
  jumpscarePose(camera) {
    this.upright = 1;
    this.sink = 0;
    this.setScream(true);
    this.faceMat.emissive.setHex(0x3a4646);
    this.faceMat.color.setScalar(1);
    this.skinMat.color.setScalar(1);
    this.body.rotation.set(0.5, 0, 0);
    for (const a of this.arms) {
      a.sh.rotation.set(-1.35, 0, a.s * 0.25);
      a.el.rotation.set(-0.2, 0, 0);
    }
    if (camera && !this.lungeY) {
      this.syncMesh();
      this.mesh.updateMatrixWorld(true);
      this.head.getWorldPosition(_v);
      this.lungeY = camera.position.y - 0.05 - _v.y;
    }
    this.syncMesh();
    if (camera) {
      // 얼굴이 카메라에 파묻히지 않도록 60cm 앞에 멈춘다
      this.mesh.updateMatrixWorld(true);
      this.head.getWorldPosition(_v);
      const c = camera.position;
      const hd = Math.hypot(_v.x - c.x, _v.z - c.z);
      if (hd < 0.6) {
        const dx = this.pos.x - c.x;
        const dz = this.pos.z - c.z;
        const l = Math.hypot(dx, dz) || 1;
        this.pos.x += (dx / l) * (0.6 - hd);
        this.pos.z += (dz / l) * (0.6 - hd);
        this.syncMesh();
      }
    }
  }

  // 몸 둘레의 물결. 사냥하며 가라앉아 있을 때는 수면 위로 솟는 물결만 보인다
  _jointRipple(level, strength) {
    const back = Math.random() * 1.2 - 0.3;
    const x = this.pos.x - Math.sin(this.yaw) * back + (Math.random() - 0.5) * 0.5;
    const z = this.pos.z - Math.cos(this.yaw) * back + (Math.random() - 0.5) * 0.5;
    level.ripple(x, z, this.sink > 0.5 ? 1.0 : 0.6, strength);
  }

  _animate(dt, time, moving, camera) {
    const hunt = this.state === CHASE;
    // 사냥하며 움직일 때는 물속으로 가라앉는다
    this.sink += ((hunt && moving && this.upright < 0.3 ? 1 : 0) - this.sink) * Math.min(1, dt * 2);
    // 가까이 오면(같은 수영장, 5m 안) 목을 돌려 얼굴을 든다
    const near = this.dist < 5 && this.sink < 0.5;
    this.faceUp += ((near ? 1 : 0) - this.faceUp) * Math.min(1, dt * 1.6);
    const u = this.upright;
    this.setScream(hunt && u > 0.5);
    // 물속에서는 검은 그림자, 수면에선 퍼런 살갗, 일어서면 또렷하다
    const shade = lerp(lerp(0.75, 0.12, this.sink), 1, u);
    this.skinMat.color.setScalar(shade);
    this.faceMat.color.setScalar(Math.max(shade, 0.6 * this.faceUp));
    this.walk += this.speed * dt * 1.6;

    // 스톱모션: 자세는 초당 12~18번만 바뀐다. 사이사이 경련
    this.poseT -= dt;
    if (this.poseT > 0) return;
    this.poseT = hunt ? 0.055 : 0.085;
    if (Math.random() < (hunt ? 0.1 : 0.03)) this.twitch = (Math.random() - 0.5) * 1.0;
    else this.twitch *= 0.4;

    this.syncMesh();
    // 떠 있을 때는 물결에 따라 아주 천천히 흔들린다
    this.mesh.position.y += Math.sin(time * 1.1) * 0.025 * (1 - u) * (1 - this.sink);
    this.mesh.rotation.y = this.yaw;
    const k = moving ? 1 : 0.25;
    const w = this.walk;
    // 엎드림(π/2) ↔ 일어섬(살짝 앞으로 기울어짐)
    this.body.rotation.set(lerp(Math.PI / 2 - 0.05, 0.08, u), 0, Math.sin(time * 0.7) * 0.06 * (1 - u));
    this.arms.forEach((a, i) => {
      // 떠 있을 땐 팔을 벌리고 축 늘어뜨린 채 천천히 물을 젓는다. 일어서면 축 처지고, 사냥 땐 앞으로 뻗는다
      const swim = Math.sin(w + i * Math.PI) * 0.35 * k * (1 - u);
      const fl = 1 - u;
      a.sh.rotation.set(lerp(0, hunt ? -1.2 : -0.05, u) + swim, 0, a.s * lerp(1.25, 0.12, u) + (Math.random() < 0.02 ? 0.3 : 0));
      a.el.rotation.set(lerp(-0.5, -0.15, u) * fl + -0.15 * u, 0, a.s * 0.15 * fl);
    });
    this.legs.forEach((l, i) => {
      const kick = Math.sin(w * 1.3 + i * Math.PI) * 0.25 * k * (1 - u);
      l.hip.rotation.set(lerp(-0.05, -0.04, u) + kick, 0, l.s * lerp(0.18, 0.03, u));
      l.kn.rotation.set(lerp(0.25, 0.06, u) + Math.max(0, kick), 0, 0);
    });
    if (u > 0.4) this.faceCamera(camera);
    else {
      // 엎드린 머리를 180도 돌려 얼굴을 위로 든다 (목 축 기준)
      this.head.rotation.set(-0.2 * this.faceUp, Math.PI * this.faceUp + this.twitch * 0.3, Math.sin(time * 0.8) * 0.1);
    }
  }
}
