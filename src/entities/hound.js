// LEVEL 0 · 하운드
// 눈이 없는 창백한 인간형이 네 발로 기어 다닌다. 앞을 못 보고 소리로만 사냥한다.
// 가까이서 소리를 들으면 전력 질주보다 빠르게 그 자리로 달려든다. 살아남으려면 소리를 내지 말 것.
import * as THREE from 'three';
import { EntityBase, WANDER, CHASE, SEARCH } from './base.js';

function wrap(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export class Hound extends EntityBase {
  get awakeMessage() {
    return '…어딘가에서 무언가가 카펫을 긁으며 기어 다니기 시작했다';
  }

  _build(tex) {
    const g = new THREE.Group();
    const skin = new THREE.MeshLambertMaterial({ map: tex.houndSkin });
    const dark = new THREE.MeshBasicMaterial({ color: 0x1a0505 });
    const tooth = new THREE.MeshLambertMaterial({ color: 0xd8cfb0 });
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

    // 엉덩이를 축으로 몸 전체가 붙어 있다. 점프스케어 때는 앞발을 들고 일어선다
    const hips = pivot(g, 0, 0.6, -0.4);
    this.hips = hips;
    const torso = add(hips, new THREE.CapsuleGeometry(0.16, 0.72, 4, 10), skin, 0, 0.06, 0.42);
    torso.rotation.x = Math.PI / 2 - 0.08;
    torso.scale.set(0.85, 1, 0.8);
    // 피부 밑으로 튀어나온 등뼈
    for (let i = 0; i < 9; i++) add(hips, new THREE.SphereGeometry(0.035, 6, 4), skin, 0, 0.19 + i * 0.006, 0.02 + i * 0.1);

    // 앞으로 처진 목과 눈 없는 머리
    const neck = add(hips, new THREE.CylinderGeometry(0.05, 0.065, 0.26, 8), skin, 0, -0.01, 1.0);
    neck.rotation.x = 2.29;
    const head = pivot(hips, 0, 0.0, 1.12);
    this.head = head;
    add(head, new THREE.SphereGeometry(0.13, 14, 10), skin).scale.set(0.85, 0.8, 1.25);
    // 눈이 있어야 할 자리는 살갗으로 덮여 움푹 꺼져 있다
    const socket = new THREE.MeshLambertMaterial({ map: tex.houndSkin, color: 0x6a5048 });
    for (const s of [-1, 1]) add(head, new THREE.SphereGeometry(0.035, 8, 6), socket, s * 0.05, 0.035, 0.135).scale.set(1.2, 0.7, 0.35);
    add(head, new THREE.SphereGeometry(0.08, 10, 8), dark, 0, -0.04, 0.06).scale.set(1, 0.7, 1.3);
    for (let i = 0; i < 9; i++) {
      const a = (i / 8 - 0.5) * 2.2;
      const t = add(head, new THREE.ConeGeometry(0.011, 0.05, 4), tooth, Math.sin(a) * 0.085, -0.07, 0.04 + Math.cos(a) * 0.1);
      t.rotation.x = Math.PI;
    }
    // 아래턱: 머리 뒤쪽이 경첩이라 축 늘어져 벌어진다
    const jaw = pivot(head, 0, -0.06, -0.06);
    this.jaw = jaw;
    add(jaw, new THREE.SphereGeometry(0.1, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), skin, 0, 0, 0.12).scale.set(0.85, 0.6, 1.4);
    for (let i = 0; i < 8; i++) {
      const a = (i / 7 - 0.5) * 2.0;
      add(jaw, new THREE.ConeGeometry(0.01, 0.045, 4), tooth, Math.sin(a) * 0.07, 0.02, 0.12 + Math.cos(a) * 0.1);
    }

    // 앞다리: 팔꿈치가 몸보다 높이 솟은 거미 같은 긴 팔
    this.arms = [];
    for (const s of [-1, 1]) {
      const sh = pivot(hips, s * 0.15, 0.08, 0.78);
      sh.rotation.z = s * 2.36;
      add(sh, new THREE.CylinderGeometry(0.04, 0.032, 0.5, 7), skin, 0, -0.25, 0);
      add(sh, new THREE.SphereGeometry(0.04, 7, 5), skin, 0, -0.5, 0);
      const el = pivot(sh, 0, -0.5, 0);
      el.rotation.z = -s * 2.26;
      add(el, new THREE.CylinderGeometry(0.03, 0.022, 1.0, 7), skin, 0, -0.5, 0);
      for (let f = -1; f <= 1; f++) {
        const finger = add(el, new THREE.CylinderGeometry(0.012, 0.005, 0.2, 5), skin, f * 0.03, -1.0, 0.08);
        finger.rotation.x = Math.PI / 2 - 0.25;
        finger.rotation.z = f * 0.35;
      }
      this.arms.push(sh);
    }

    // 뒷다리: 무릎을 바닥에 대고 발을 뒤로 끌며 긴다
    this.legs = [];
    for (const s of [-1, 1]) {
      const hip = pivot(hips, s * 0.13, -0.02, 0);
      hip.rotation.x = -0.3;
      add(hip, new THREE.CylinderGeometry(0.055, 0.04, 0.5, 7), skin, 0, -0.25, 0);
      add(hip, new THREE.SphereGeometry(0.045, 7, 5), skin, 0, -0.5, 0);
      const knee = pivot(hip, 0, -0.5, 0);
      knee.rotation.x = 1.67;
      add(knee, new THREE.CylinderGeometry(0.04, 0.025, 0.5, 7), skin, 0, -0.25, 0);
      add(knee, new THREE.BoxGeometry(0.06, 0.03, 0.12), skin, 0, -0.52, 0.03);
      this.legs.push(hip);
    }
    // 기어 다니는데도 사람보다 크게 느껴지도록
    g.scale.setScalar(1.2);
    return g;
  }

  reset(level, theme) {
    super.reset(level, theme);
    this.listenT = 0;
    this.listenYaw = 0;
    this.huntTarget = null;
    this.hips.rotation.set(0, 0, 0);
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
    this.hips.rotation.set(-0.95, 0, 0);
    for (const a of this.arms) a.rotation.x = -0.6;
    this.jaw.rotation.x = 1.1;
  }

  _animate(dt, time, moving) {
    const hunt = this.state === CHASE;
    this.walk += this.speed * dt * (hunt ? 2.2 : 3.0);
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.yaw;
    const k = moving ? Math.min(1, this.speed / 1.2) : 0;
    const w = this.walk;
    // 대각선 다리끼리 같이 움직인다
    this.arms[0].rotation.x = Math.sin(w) * 0.5 * k;
    this.arms[1].rotation.x = Math.sin(w + Math.PI) * 0.5 * k;
    this.legs[0].rotation.x = -0.3 + Math.sin(w + Math.PI) * 0.35 * k;
    this.legs[1].rotation.x = -0.3 + Math.sin(w) * 0.35 * k;
    this.hips.position.y = 0.6 + Math.abs(Math.sin(w)) * 0.05 * k;
    this.hips.rotation.set(hunt ? 0.08 : 0, 0, Math.sin(w) * 0.06 * k);

    // 머리: 냄새 맡듯 좌우로 흔들다가, 귀를 기울일 때는 소리 쪽으로 고개를 꺾는다
    let hx = 0.05;
    let hy = Math.sin(time * 1.4) * 0.45;
    let hz = 0;
    if (this.listenT > 0) {
      hx = 0.1;
      hy = this.listenYaw;
      hz = 0.55 + Math.sin(time * 3) * 0.1;
    }
    if (hunt) {
      hx = -0.05;
      hy = (Math.random() - 0.5) * 0.15;
    }
    this.head.rotation.set(hx, hy, hz);
    if (Math.random() < (hunt ? 0.2 : 0.02)) this.head.rotation.z += (Math.random() - 0.5) * 0.8;
    this.jaw.rotation.x = hunt ? 0.75 + Math.random() * 0.2 : 0.35 + Math.sin(time * 2) * 0.08;
  }
}
