// LEVEL 0 · 하운드
// 깡마른 살색 인간형이 손바닥과 발바닥으로 엎드려 걷는다. 굽은 등, 길게 늘어진 목,
// 얼굴을 덮은 긴 검은 머리카락 아래로 귀까지 찢어진 웃음. 눈이 있어야 할 자리는 비어 있다.
// 앞을 못 보고 소리로만 사냥한다. 가까이서 소리를 들으면 전력 질주보다 빠르게 그 자리로 달려든다.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EntityBase, WANDER, CHASE, SEARCH } from './base.js';

const ARM_UP = -0.25; // 위팔: 살짝 앞으로
const ARM_FORE = 0.35; // 아래팔: 뒤로 꺾여 바닥을 짚는다
const LEG_UP = -0.35; // 허벅지: 앞·아래로
const LEG_KNEE = 0.75; // 정강이: 뒤·아래로
const HEAD_X = 0.3; // 고개를 떨군 기본 각도
const HIPS = new THREE.Vector3(0, 0.98, -0.45);

function wrap(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// 척추 곡선(y-z 평면)을 따라 단면 크기가 변하는 몸통. 등뼈 장식을 위해 곡선과 반지름 함수도 돌려준다
function bodyTube(points, radii, segs = 56, radial = 16, vRepeat = 3) {
  const curve = new THREE.CatmullRomCurve3(points);
  const R = (t) => {
    const f = t * (radii.length - 1);
    const i = Math.min(radii.length - 2, Math.floor(f));
    const k = f - i;
    const s = k * k * (3 - 2 * k);
    return [radii[i][0] + (radii[i + 1][0] - radii[i][0]) * s, radii[i][1] + (radii[i + 1][1] - radii[i][1]) * s];
  };
  const S = new THREE.Vector3(1, 0, 0);
  const frame = (t) => {
    const P = curve.getPoint(t);
    const T = curve.getTangent(t);
    const U = new THREE.Vector3().crossVectors(T, S).normalize();
    return { P, U };
  };
  const pos = [];
  const nor = [];
  const uv = [];
  const idx = [];
  const n = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const { P, U } = frame(t);
    const [rx, ry] = R(t);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      pos.push(P.x + S.x * c * rx + U.x * s * ry, P.y + S.y * c * rx + U.y * s * ry, P.z + S.z * c * rx + U.z * s * ry);
      n.set(S.x * c * ry + U.x * s * rx, S.y * c * ry + U.y * s * rx, S.z * c * ry + U.z * s * rx).normalize();
      nor.push(n.x, n.y, n.z);
      uv.push(j / radial, t * vRepeat);
    }
  }
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j;
      const b = a + radial + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return { geometry: g, frame, R };
}

// 근육 윤곽이 있는 팔다리 마디. profile: [반지름, y] (y는 -길이 ~ 0)
function limb(profile) {
  return new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    10,
  );
}

export class Hound extends EntityBase {
  get awakeMessage() {
    return '…어딘가에서 무언가가 카펫을 긁으며 기어 다니기 시작했다';
  }

  _build(tex) {
    const root = new THREE.Group();
    // 기준점(AI 위치·충돌 중심)이 어깨 근처에 오도록 몸 전체를 뒤로 민다. 머리가 먼저 닿는다
    const g = new THREE.Group();
    g.position.z = -0.45;
    root.add(g);
    const skin = new THREE.MeshLambertMaterial({ map: tex.houndSkin, side: THREE.DoubleSide });
    const nail = new THREE.MeshLambertMaterial({ color: 0x1a1212 });
    const hairMat = new THREE.MeshLambertMaterial({ color: 0x0b0908 });
    this.faceMat = new THREE.MeshLambertMaterial({ map: tex.houndFace });
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

    // 몸통 전체는 엉덩이를 축으로 붙어 있다. 점프스케어 때는 앞발을 들고 일어선다
    const hips = pivot(g, HIPS.x, HIPS.y, HIPS.z);
    this.hips = hips;
    const V = (y, z) => new THREE.Vector3(0, y, z);
    const tube = bodyTube(
      [V(-0.05, -0.13), V(0.01, 0), V(0.05, 0.23), V(-0.01, 0.48), V(-0.12, 0.71), V(-0.19, 0.88), V(-0.23, 1.03), V(-0.27, 1.13)],
      [
        [0.09, 0.08],
        [0.15, 0.13],
        [0.105, 0.095],
        [0.15, 0.15],
        [0.17, 0.13],
        [0.075, 0.08],
        [0.055, 0.06],
        [0.05, 0.055],
      ],
    );
    add(hips, tube.geometry, skin);
    add(hips, new THREE.SphereGeometry(0.1, 12, 10), skin, 0, -0.05, -0.13).scale.set(1, 0.85, 0.85);
    // 피부 밑으로 드러난 등뼈와 견갑골
    for (let i = 0; i < 14; i++) {
      const t = 0.08 + i * 0.04;
      const { P, U } = tube.frame(t);
      const ry = tube.R(t)[1];
      add(hips, new THREE.SphereGeometry(0.02, 6, 4), skin, P.x + U.x * ry * 0.93, P.y + U.y * ry * 0.93, P.z + U.z * ry * 0.93);
    }
    {
      const { P, U } = tube.frame(0.55);
      for (const s of [-1, 1]) {
        const b = add(hips, new THREE.SphereGeometry(1, 10, 6), skin, P.x + s * 0.085, P.y + U.y * 0.1, P.z + U.z * 0.1);
        b.scale.set(0.065, 0.025, 0.09);
        b.rotation.z = s * 0.35;
      }
    }

    // 앞다리: 사람 팔. 팔꿈치가 뒤로 꺾여 손바닥으로 바닥을 짚는다
    this.arms = [];
    for (const s of [-1, 1]) {
      const sh = pivot(hips, s * 0.15, -0.16, 0.73);
      sh.rotation.x = ARM_UP;
      add(sh, new THREE.SphereGeometry(0.058, 10, 8), skin);
      add(sh, limb([[0.034, -0.4], [0.042, -0.32], [0.05, -0.16], [0.056, -0.05], [0.05, 0]]), skin);
      const el = pivot(sh, 0, -0.4, 0);
      el.rotation.x = ARM_FORE;
      add(el, new THREE.SphereGeometry(0.038, 8, 6), skin);
      add(el, limb([[0.024, -0.38], [0.03, -0.3], [0.04, -0.12], [0.037, 0]]), skin);
      const wr = pivot(el, 0, -0.38, 0);
      this._hand(wr, skin, nail, add, s);
      this.arms.push({ sh, el, wr });
    }

    // 뒷다리: 엉덩이가 높이 들린 채 발바닥으로 선다 (엉덩이 축과 따로 움직인다)
    this.legs = [];
    for (const s of [-1, 1]) {
      const hip = pivot(g, s * 0.11, 0.95, -0.45);
      hip.rotation.x = LEG_UP;
      add(hip, limb([[0.045, -0.47], [0.055, -0.4], [0.07, -0.24], [0.075, -0.1], [0.065, 0]]), skin);
      const kn = pivot(hip, 0, -0.47, 0);
      kn.rotation.x = LEG_KNEE;
      add(kn, new THREE.SphereGeometry(0.05, 8, 6), skin);
      add(kn, limb([[0.028, -0.47], [0.034, -0.4], [0.05, -0.22], [0.055, -0.1], [0.045, 0]]), skin);
      const an = pivot(kn, 0, -0.47, 0);
      this._foot(an, skin, nail, add);
      this.legs.push({ hip, kn, an });
    }

    // 고개를 떨군 머리와 얼굴을 덮은 긴 머리카락
    const head = pivot(hips, 0, -0.29, 1.2);
    head.rotation.x = HEAD_X;
    this.head = head;
    const SC = new THREE.Vector3(0.86, 1.06, 0.95);
    add(head, new THREE.SphereGeometry(0.1, 24, 16), this.faceMat).scale.copy(SC);
    const front = Math.PI / 2;
    const win = 1.2;
    add(head, new THREE.SphereGeometry(0.106, 20, 12, front + win / 2, Math.PI * 2 - win, 0, Math.PI * 0.62), hairMat).scale.copy(SC);
    add(head, new THREE.SphereGeometry(0.108, 20, 6, 0, Math.PI * 2, 0, Math.PI * 0.22), hairMat).scale.copy(SC);
    this.hair = this._hair(head, hairMat, SC);
    root.scale.setScalar(1.15);
    return root;
  }

  _hand(parent, skin, nail, add, s) {
    add(parent, new THREE.SphereGeometry(0.03, 6, 5), skin);
    add(parent, new THREE.SphereGeometry(0.045, 8, 6), skin, 0, -0.012, 0.035).scale.set(1, 0.32, 1.15);
    for (let f = 0; f < 4; f++) {
      const x = -0.027 + f * 0.018;
      const p = add(parent, new THREE.CylinderGeometry(0.0085, 0.0075, 0.065, 5), skin, x, -0.02, 0.1);
      p.rotation.x = Math.PI / 2;
      const d = add(parent, new THREE.CylinderGeometry(0.0072, 0.006, 0.045, 5), skin, x, -0.033, 0.145);
      d.rotation.x = Math.PI / 2 + 0.55;
      const c = add(parent, new THREE.ConeGeometry(0.0065, 0.026, 4), nail, x, -0.048, 0.168);
      c.rotation.x = Math.PI / 2 + 0.75;
    }
    const th = add(parent, new THREE.CylinderGeometry(0.009, 0.007, 0.06, 5), skin, -s * 0.045, -0.02, 0.06);
    th.rotation.set(Math.PI / 2, 0, s * 0.6);
  }

  _foot(parent, skin, nail, add) {
    add(parent, new THREE.SphereGeometry(0.035, 6, 5), skin);
    add(parent, new THREE.SphereGeometry(1, 10, 6), skin, 0, -0.04, 0.05).scale.set(0.045, 0.028, 0.11);
    for (let t = 0; t < 5; t++) {
      const x = -0.03 + t * 0.015;
      add(parent, new THREE.SphereGeometry(0.011 - Math.abs(t - 0.5) * 0.0012, 6, 4), skin, x, -0.05, 0.155 - Math.abs(t - 1) * 0.008);
      const c = add(parent, new THREE.ConeGeometry(0.006, 0.018, 4), nail, x, -0.056, 0.17 - Math.abs(t - 1) * 0.008);
      c.rotation.x = Math.PI / 2 + 0.6;
    }
  }

  // 머리 아래로 늘어진 가닥들. 머리가 숙여져 있으니 머리 기준 "아래"는 얼굴 쪽으로 기운다
  _hair(head, mat, SC) {
    const geos = [];
    const fringeGeos = [];
    const down = new THREE.Vector3(0, -1, 0).applyAxisAngle(new THREE.Vector3(1, 0, 0), -HEAD_X);
    const up = new THREE.Vector3(0, -1, 0);
    const q = new THREE.Quaternion();
    const rnd = (a, b) => a + Math.random() * (b - a);
    for (let i = 0; i < 150; i++) {
      const phi = Math.random() * Math.PI * 2;
      const frontDist = Math.abs(wrap(phi - Math.PI / 2));
      const fringe = frontDist < 0.62;
      const theta = fringe ? rnd(0.14, 0.3) * Math.PI : rnd(0.08, 0.6) * Math.PI;
      const root = new THREE.Vector3(
        -Math.cos(phi) * Math.sin(theta) * 0.104 * SC.x,
        Math.cos(theta) * 0.104 * SC.y,
        Math.sin(phi) * Math.sin(theta) * 0.104 * SC.z,
      );
      const out = root.clone().normalize();
      const dir = down
        .clone()
        .addScaledVector(out, fringe ? 0.35 : 0.22)
        .add(new THREE.Vector3(rnd(-0.12, 0.12), 0, rnd(-0.12, 0.12)))
        .normalize();
      // 앞머리는 눈을 가리고 입은 드러날 만큼만, 옆·뒤는 길게
      const len = fringe ? rnd(0.12, 0.2) : rnd(0.28, 0.55);
      const geo = new THREE.CylinderGeometry(0.0045, 0.0015, len, 3, 1);
      geo.translate(0, -len / 2, 0);
      geo.applyQuaternion(q.setFromUnitVectors(up, dir));
      geo.translate(root.x, root.y, root.z);
      (fringe ? fringeGeos : geos).push(geo);
    }
    // 앞머리는 따로 둔다. 덮칠 때는 머리카락이 걷히며 얼굴이 드러난다
    const group = new THREE.Group();
    const back = new THREE.Mesh(mergeGeometries(geos), mat);
    this.fringe = new THREE.Mesh(mergeGeometries(fringeGeos), mat);
    group.add(back, this.fringe);
    [...geos, ...fringeGeos].forEach((x) => x.dispose());
    head.add(group);
    return group;
  }

  setScream(on) {
    this.faceMat.map = on ? this.tex.houndScream : this.tex.houndFace;
  }

  reset(level, theme) {
    super.reset(level, theme);
    this.listenT = 0;
    this.listenYaw = 0;
    this.huntTarget = null;
    this.hips.rotation.set(0, 0, 0);
    this.fringe.visible = true;
    this.setScream(false);
  }

  // 멈춰서 소리 난 쪽으로 고개를 돌리고 귀를 기울인다
  _listen(x, z, dur, ev) {
    this.listenT = dur;
    this.listenYaw = Math.max(-1, Math.min(1, wrap(Math.atan2(x - this.pos.x, z - this.pos.z) - this.yaw)));
    ev.push('listen');
  }

  hear(x, z, radius, level) {
    if (!this.active) return false;
    const d = Math.hypot(x - this.pos.x, z - this.pos.z);
    const los = level.lineOfSight(this.pos.x, this.pos.z, x, z);
    const keen = this.state === SEARCH || this.listenT > 0 ? 1.3 : 1;
    const eff = radius * this.cfg.hearing * (los ? 1 : 0.6) * keen;
    if (d > eff) return false;
    // 가까운 소리거나 이미 뭔가 들은 상태면 곧장 달려든다
    if (d < eff * 0.55 || this.state !== WANDER) {
      if (this.state !== CHASE) this.pending.push('chase');
      this.state = CHASE;
      this.huntTarget = { x, z };
      this.repath = 0;
      this.path = [];
      this.pauseT = 0;
      this.listenT = 0;
    } else {
      this._goInvestigate(x, z, level);
      this._listen(x, z, 0.8, this.pending);
    }
    return true;
  }

  update(dt, { level, player, time, camera }) {
    const ev = [];
    if (this._sleeping(dt, ev)) return ev;
    this._sense(player, level);
    this.listenT -= dt;
    const [ex, ey] = level.cellAt(this.pos.x, this.pos.z);
    let target = null;
    let speed = this.cfg.wander;

    if (this.state === CHASE) {
      speed = this.cfg.chase;
      const h = this.huntTarget;
      const d = Math.hypot(h.x - this.pos.x, h.z - this.pos.z);
      if (d < 0.7) {
        // 소리 난 자리에 도착. 멈춰서 귀를 기울인 뒤 주변을 더듬는다
        this._goSearch(level.cellAt(h.x, h.z), 9, 1.4);
        this._listen(h.x + Math.sin(this.yaw), h.z + Math.cos(this.yaw), 1.4, ev);
        ev.push('lost');
      } else {
        const direct = d < 6 && level.lineOfSight(this.pos.x, this.pos.z, h.x, h.z);
        target = this._chaseTarget(dt, level, ex, ey, h, direct);
      }
    } else {
      // 배회하다 가끔 멈춰 귀를 기울인다
      if (this.state === WANDER && this.pauseT <= 0 && Math.random() < dt * 0.12) {
        this.pauseT = 2 + Math.random() * 2;
        this._listen(this.pos.x + Math.sin(this.yaw + 1), this.pos.z + Math.cos(this.yaw + 1), this.pauseT, ev);
      }
      ({ target, speed } = this._routine(dt, level, player, ex, ey));
    }

    const moving = this._move(dt, level, target, speed, null, true);
    if (moving) this._footstep(dt, this.state === CHASE ? 1.3 : 0.8, ev);
    if (this.dist < 0.95) ev.push('caught');
    this._animate(dt, time, moving);
    return this._flush(ev);
  }

  jumpscarePose() {
    this.syncMesh();
    this.setScream(true);
    this.fringe.visible = false;
    this.hair.rotation.set(0.6, 0, 0); // 덮치는 기세에 머리카락이 뒤로 젖혀진다
    // 앞발을 들고 일어서며 두 팔을 뻗는다
    this.hips.rotation.set(-0.8, 0, 0);
    this.hips.position.y = HIPS.y;
    for (const a of this.arms) {
      a.sh.rotation.x = -1.3;
      a.el.rotation.x = 0.2;
    }
  }

  _animate(dt, time, moving) {
    const hunt = this.state === CHASE;
    this.setScream(hunt);
    this.walk += this.speed * dt * (hunt ? 2.4 : 3.2);
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.yaw;
    const k = moving ? Math.min(1, this.speed / 1.2) : 0;
    const w = this.walk;
    // 대각선 다리끼리 같이 움직인다 (왼앞·오른뒤 / 오른앞·왼뒤)
    for (let i = 0; i < 2; i++) {
      const a = this.arms[i];
      const pa = w + (i ? Math.PI : 0);
      a.sh.rotation.x = ARM_UP + Math.sin(pa) * 0.35 * k;
      a.el.rotation.x = ARM_FORE + Math.max(0, Math.sin(pa + Math.PI / 2)) * 0.35 * k;
      a.wr.rotation.x = -(a.sh.rotation.x + a.el.rotation.x);
      const l = this.legs[i];
      const pl = w + (i ? 0 : Math.PI);
      l.hip.rotation.x = LEG_UP + Math.sin(pl) * 0.3 * k;
      l.kn.rotation.x = LEG_KNEE + Math.max(0, Math.sin(pl + Math.PI / 2)) * 0.45 * k;
      l.an.rotation.x = -(l.hip.rotation.x + l.kn.rotation.x);
    }
    this.hips.position.y = HIPS.y + Math.abs(Math.sin(w)) * 0.03 * k;
    this.hips.rotation.set(hunt ? 0.06 : 0, 0, Math.sin(w) * 0.05 * k);

    // 머리: 좌우로 천천히 흔들다가, 귀를 기울일 때는 소리 쪽으로 고개를 꺾는다
    let hx = HEAD_X;
    let hy = Math.sin(time * 1.1) * 0.35;
    let hz = 0;
    if (this.listenT > 0) {
      hx = HEAD_X - 0.25;
      hy = this.listenYaw;
      hz = 0.55 + Math.sin(time * 3) * 0.1;
    }
    if (hunt) {
      hx = HEAD_X - 0.3;
      hy = (Math.random() - 0.5) * 0.15;
    }
    this.head.rotation.set(hx, hy, hz);
    if (Math.random() < (hunt ? 0.2 : 0.02)) this.head.rotation.z += (Math.random() - 0.5) * 0.8;
    this.hair.rotation.set(0, 0, Math.sin(time * 1.7) * 0.04 + Math.sin(w) * 0.05 * k);
  }
}
