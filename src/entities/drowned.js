// LEVEL 2 · 익사체
// 뼈만 남은 창백한 몸이 배를 위로 한 채 팔다리를 뒤로 꺾어 거미처럼 수영장 바닥을 긴다.
// 비정상적으로 긴 목 끝에 머리가 거꾸로 매달려 있고, 입은 세로로 찢어져 있다.
// 몸은 물에 잠겨 있고 높이 솟은 팔꿈치와 무릎만 수면을 뚫고 나온다.
// 물속에서만 움직이고, 눈 대신 물의 떨림으로 사냥한다. 물 밖으로는 나오지 않지만
// 물가까지 따라와 허리를 뒤로 꺾은 채 솟아올라 기다린다. 가장자리에 너무 붙어 서 있으면 끌고 들어간다.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EntityBase, WANDER, CHASE, SEARCH } from './base.js';
import { POOL_FLOOR } from '../level.js';

const WAIT = 'wait';
const _v = new THREE.Vector3();
const lerp = (a, b, t) => a + (b - a) * t;

// 팔다리 자세(라디안). 기는 자세: 관절이 몸보다 높이 솟는다 / 선 자세: 팔을 앞으로 뻗는다
const ARM_CRAWL = { up: 2.3, low: -2.05 };
const ARM_REACH = { up: 0.3, low: -0.15 };
const LEG = { up: 2.25, low: -2.0 };
const H_CRAWL = 0.42; // 기어갈 때 골반 높이 (수영장 바닥 기준)
const H_RISE = 1.1; // 일어서면 골반이 수면 위로 올라온다
const RISE = 1.42; // 몸통을 거의 수직으로 세운다

export class Drowned extends EntityBase {
  get awakeMessage() {
    return '…어딘가에서 물이 출렁이기 시작했다';
  }

  passable(level) {
    return (i) => level.water[i] === 1;
  }

  _build(tex) {
    const g = new THREE.Group();
    const skin = new THREE.MeshLambertMaterial({ map: tex.drownedSkin, emissive: 0x0a1014 });
    const bone = new THREE.MeshLambertMaterial({ map: tex.drownedSkin, color: 0xd8dcd4 });
    const nail = new THREE.MeshLambertMaterial({ color: 0x1c1a1a });
    this.skinMat = skin;
    this.boneMat = bone;
    this.faceMat = new THREE.MeshLambertMaterial({ map: tex.drownedFace, emissive: 0x0e1416 });
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
    // 팔다리 한 마디: 피벗 아래(-y)로 뻗는다
    const seg = (parent, len, r0, r1) => {
      add(parent, new THREE.CylinderGeometry(r0, r1, len, 7), skin, 0, -len / 2, 0);
      add(parent, new THREE.SphereGeometry(r0 * 1.25, 7, 5), bone); // 툭 튀어나온 관절
      return pivot(parent, 0, -len, 0);
    };
    const hand = (parent, long) => {
      add(parent, new THREE.SphereGeometry(0.035, 7, 5), skin).scale.set(1.3, 0.6, 1);
      for (let f = -2; f <= 2; f++) {
        const len = long * (1 - Math.abs(f) * 0.12);
        const fg = pivot(parent, f * 0.016, -0.01, 0.02);
        fg.rotation.set(1.35, 0, f * 0.28);
        add(fg, new THREE.CylinderGeometry(0.007, 0.004, len, 5), skin, 0, -len / 2, 0);
        add(fg, new THREE.ConeGeometry(0.006, 0.02, 4), nail, 0, -len - 0.008, 0).rotation.x = Math.PI;
      }
    };

    // 몸통: 골반에서 앞(+z)으로 누운 채, 배가 위(+y)를 향한다. torso를 x축으로 젖히면 일어선다
    const torso = pivot(g, 0, 0, 0);
    this.torso = torso;
    const trunk = add(torso, new THREE.CapsuleGeometry(0.095, 0.5, 4, 10), skin, 0, 0, 0.3);
    trunk.rotation.x = Math.PI / 2;
    trunk.scale.set(1.15, 1, 0.8);
    add(torso, new THREE.SphereGeometry(0.1, 9, 7), skin, 0, -0.01, -0.02).scale.set(1.2, 0.7, 0.9); // 골반
    // 배 쪽(위)으로 드러난 갈비뼈
    for (let i = 0; i < 6; i++) {
      const rib = add(torso, new THREE.TorusGeometry(0.098, 0.011, 4, 12, Math.PI), bone, 0, 0.0, 0.26 + i * 0.055);
      rib.scale.set(1.18, 1.05, 1);
    }
    add(torso, new THREE.SphereGeometry(0.06, 7, 5), bone, 0, 0.05, 0.58).scale.set(1.6, 0.5, 0.8); // 쇄골

    // 길게 늘어진 목: 가슴 끝에서 앞으로 나가 아래로 휜다. 머리는 거꾸로 매달린다
    const neckPts = [
      new THREE.Vector3(0, 0.0, 0.58),
      new THREE.Vector3(0, -0.02, 0.76),
      new THREE.Vector3(0, -0.1, 0.92),
      new THREE.Vector3(0, -0.22, 1.0),
    ];
    add(torso, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(neckPts), 16, 0.038, 7), skin);
    for (let i = 1; i < 4; i++) add(torso, new THREE.SphereGeometry(0.03, 6, 4), bone, neckPts[i].x, neckPts[i].y + 0.03, neckPts[i].z);
    const head = pivot(torso, 0, -0.31, 1.04);
    add(head, new THREE.SphereGeometry(0.12, 22, 14), this.faceMat).scale.set(0.82, 1.3, 0.92);
    this.head = head;
    this.hair = this._hair(head);

    // 팔: 어깨에서 바깥·위로 솟았다가 긴 아래팔이 바닥을 짚는다 (거미 다리처럼)
    this.arms = [];
    for (const s of [-1, 1]) {
      const sh = pivot(torso, s * 0.17, 0.0, 0.52);
      const el = seg(sh, 0.44, 0.032, 0.026);
      const wr = seg(el, 0.66, 0.026, 0.018);
      hand(wr, 0.15);
      this.arms.push({ sh, el, s });
    }
    // 다리: 골반에 붙어 몸통이 일어서도 바닥에 남는다
    this.legs = [];
    for (const s of [-1, 1]) {
      const hip = pivot(g, s * 0.11, 0, 0.02);
      const kn = seg(hip, 0.48, 0.04, 0.03);
      const an = seg(kn, 0.68, 0.03, 0.02);
      hand(an, 0.11);
      this.legs.push({ hip, kn, s });
    }
    g.scale.setScalar(1.08);
    return g;
  }

  // 젖어서 뭉친 긴 머리카락. 머리 기준 위(+y)로 뻗게 두면, 머리가 거꾸로 매달릴 때 아래로 늘어진다
  _hair(head) {
    const geos = [];
    const up = new THREE.Vector3(0, 1, 0);
    const q = new THREE.Quaternion();
    for (let i = 0; i < 70; i++) {
      const phi = Math.random() * Math.PI * 2;
      const theta = Math.random() * 0.55;
      const root = new THREE.Vector3(Math.sin(theta) * Math.cos(phi) * 0.098, Math.cos(theta) * 0.152, Math.sin(theta) * Math.sin(phi) * 0.11);
      // 얼굴 앞쪽은 짧게, 뒤쪽은 길게
      const back = Math.sin(phi) < 0 ? 1 : 0.55;
      const len = (0.32 + Math.random() * 0.42) * back;
      const dir = up
        .clone()
        .add(new THREE.Vector3(root.x * 2.2 + (Math.random() - 0.5) * 0.25, 0, root.z * 2.2 + (Math.random() - 0.5) * 0.25))
        .normalize();
      const geo = new THREE.CylinderGeometry(0.004 + Math.random() * 0.006, 0.0012, len, 3, 1);
      geo.translate(0, len / 2, 0);
      geo.applyQuaternion(q.setFromUnitVectors(up, dir));
      geo.translate(root.x, root.y, root.z);
      geos.push(geo);
    }
    const m = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshLambertMaterial({ color: 0x0c0d0e }));
    geos.forEach((g) => g.dispose());
    head.add(m);
    return m;
  }

  setScream(on) {
    this.faceMat.map = on ? this.tex.drownedScream : this.tex.drownedFace;
  }

  // 위치는 수영장 바닥 기준. 몸을 얼마나 일으켰는지에 따라 골반 높이가 달라진다
  syncMesh() {
    this.mesh.position.set(this.pos.x, POOL_FLOOR + lerp(H_CRAWL, H_RISE, this.upright || 0) + (this.lungeY || 0), this.pos.z);
  }

  reset(level, theme) {
    super.reset(level, theme);
    this.upright = 0;
    this.waitT = 0;
    this.arrived = false;
    this.rippleT = 0;
    this.relocate = null;
    this.huntTarget = null;
    this.poseT = 0;
    this.twitch = 0;
    this.lungeY = 0;
    this.faceMat.emissive.setHex(0x0e1416);
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

  // 거꾸로 뒤집힌 얼굴로 플레이어를 노려본다
  faceCamera(camera, twitch = 0) {
    this.head.lookAt(camera.getWorldPosition(_v));
    this.head.rotateZ(Math.PI + 0.3 + twitch);
  }

  // 덮칠 때는 몸을 앞으로 기울여 얼굴을 카메라 눈높이로 들이민다
  jumpscarePose(camera) {
    this.upright = 1;
    this.setScream(true);
    this.faceMat.emissive.setHex(0x3c4448);
    this.torso.rotation.set(-0.8, 0, 0);
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
    for (const l of this.legs) {
      l.hip.rotation.set(0, 0, l.s * 0.22);
      l.kn.rotation.set(0, 0, -l.s * 0.3);
    }
    for (const a of this.arms) {
      a.sh.rotation.set(0, 0, a.s * 0.5);
      a.el.rotation.set(0, 0, -a.s * 0.25);
    }
  }

  // 관절 위치에서 물결을 일으킨다 (기어갈 때 수면을 뚫고 나온 팔꿈치·무릎)
  _jointRipple(level, strength) {
    const limbs = [...this.arms.map((a) => a.el), ...this.legs.map((l) => l.kn)];
    const j = limbs[Math.floor(Math.random() * limbs.length)];
    j.getWorldPosition(_v);
    level.ripple(_v.x, _v.z, 0.55, strength);
  }

  _animate(dt, time, moving, camera) {
    const u = this.upright;
    const hunt = this.state === CHASE;
    this.setScream(hunt && u > 0.5);
    // 물속에서는 검은 그림자, 몸을 일으키면 창백한 살갗이 드러난다
    const shade = 0.1 + 0.9 * Math.min(1, u * 1.4);
    this.skinMat.color.setScalar(shade);
    this.boneMat.color.setScalar(shade * 0.95);
    this.faceMat.color.setScalar(shade);
    this.walk += this.speed * dt * 3.2;

    // 스톱모션: 자세는 초당 12~18번만 바뀐다. 사이사이 경련
    this.poseT -= dt;
    if (this.poseT > 0) return;
    this.poseT = hunt ? 0.055 : 0.085;
    if (Math.random() < (hunt ? 0.12 : 0.04)) this.twitch = (Math.random() - 0.5) * 1.4;
    else this.twitch *= 0.4;

    this.syncMesh();
    this.mesh.position.y += Math.abs(Math.sin(this.walk)) * 0.025 * (1 - u);
    this.hair.rotation.set(Math.sin(time * 1.3) * 0.05, 0, Math.sin(time * 1.1) * 0.06);
    this.mesh.rotation.y = this.yaw;
    this.torso.rotation.set(-RISE * u, 0, Math.sin(this.walk * 0.5) * 0.05 * (1 - u));
    const k = moving ? 1 : 0.15;
    const w = this.walk;
    // 대각선 다리끼리 같이 움직인다. 앞으로 내딛는 다리는 관절이 더 높이 들린다
    this.arms.forEach((a, i) => {
      const ph = w + (i ? Math.PI : 0);
      const swing = Math.sin(ph) * 0.45 * k * (1 - u);
      const lift = Math.max(0, Math.cos(ph)) * 0.25 * k * (1 - u);
      a.sh.rotation.set(0, swing * a.s, a.s * lerp(ARM_CRAWL.up - lift, ARM_REACH.up, u));
      a.el.rotation.set(0, 0, a.s * lerp(ARM_CRAWL.low + lift * 0.6, ARM_REACH.low, u));
      if (u > 0.5) a.sh.rotation.x = Math.sin(time * 7 + i) * 0.08; // 뻗은 손끝이 떨린다
    });
    this.legs.forEach((l, i) => {
      const ph = w + (i ? 0 : Math.PI);
      const swing = Math.sin(ph) * 0.4 * k * (1 - u);
      const lift = Math.max(0, Math.cos(ph)) * 0.22 * k * (1 - u);
      // 일어서면 다리를 아래로 뻗어 수영장 바닥을 딛는다
      l.hip.rotation.set(-0.35 * (1 - u), swing * l.s, l.s * lerp(LEG.up - lift, 0.22, u));
      l.kn.rotation.set(0, 0, l.s * lerp(LEG.low + lift * 0.6, -0.3, u));
    });
    if (u > 0.4) this.faceCamera(camera, this.twitch); else {
      // 기어갈 땐 거꾸로 매달린 채 앞을 향하고, 좌우로 까딱인다
      this.head.rotation.set(0.15, Math.sin(time * 1.7) * 0.25 + this.twitch * 0.3, Math.PI + this.twitch);
    }
  }
}
