// 엔티티 공통: 경로 이동, 끼임 처리, 순간이동, 소리 듣기, 조사·수색·배회 루틴.
// 종류별 클래스는 _build / update / _animate / jumpscarePose 를 구현한다.
import * as THREE from 'three';

export const WANDER = 'wander';
export const INVESTIGATE = 'investigate';
export const CHASE = 'chase';
export const SEARCH = 'search';

export function angleLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export class EntityBase {
  constructor(tex) {
    this.tex = tex;
    this.pos = new THREE.Vector3();
    this.lastSeen = new THREE.Vector3();
    this.state = WANDER;
    this.path = [];
    this.active = false;
    this.pending = [];
    this.mesh = this._build(tex);
    this.mesh.visible = false;
  }

  get chasing() {
    return this.state === CHASE;
  }

  // 3D 사운드를 붙일 지점
  get audioAnchor() {
    return this.head;
  }

  reset(level, theme) {
    const c = level.center(...level.entityCell);
    this.pos.set(c.x, 0, c.z);
    this.mesh.position.copy(this.pos);
    this.cfg = theme.entity;
    this.active = false;
    this.grace = theme.entity.grace;
    this.state = WANDER;
    this.path = [];
    this.pending = [];
    this.repath = 0;
    this.lostT = 0;
    this.searchT = 0;
    this.searchCenter = [0, 0];
    this.investigate = null;
    this.speed = 0;
    this.farT = 0;
    this.stepT = 0;
    this.pauseT = 0;
    this.yaw = 0;
    this.walk = 0;
    this.poseT = 0;
    this.stuckT = 0;
    this.stuckRef = { x: c.x, z: c.z };
    this.dist = 99;
    this.los = false;
    this.mesh.visible = false;
  }

  hide() {
    this.active = false;
    this.mesh.visible = false;
  }

  proximity() {
    if (!this.active) return 0;
    return Math.max(0, 1 - this.dist / 20) * (this.los ? 1 : 0.55);
  }

  syncMesh() {
    this.mesh.position.copy(this.pos);
  }

  // 아직 잠들어 있으면 true. 깨어나는 프레임에 'awake' 이벤트
  _sleeping(dt, ev) {
    if (this.active) return false;
    this.grace -= dt;
    if (this.grace > 0) return true;
    this.active = true;
    this.mesh.visible = true;
    this.syncMesh();
    ev.push('awake');
    return false;
  }

  _sense(player, level) {
    const dx = player.pos.x - this.pos.x;
    const dz = player.pos.z - this.pos.z;
    this.dist = Math.hypot(dx, dz);
    this.los = this.dist < 40 && level.lineOfSight(this.pos.x, this.pos.z, player.pos.x, player.pos.z);
    return { dx, dz };
  }

  _goInvestigate(x, z, level) {
    const [ex, ey] = level.cellAt(this.pos.x, this.pos.z);
    const [tx, ty] = level.cellAt(x, z);
    this.state = INVESTIGATE;
    this.path = level.findPath(ex, ey, tx, ty);
    this.searchCenter = [tx, ty];
    this.investigate = { x, z };
    this.pauseT = 0;
  }

  _goSearch(cell, time, pause = 1) {
    this.state = SEARCH;
    this.searchT = time;
    this.searchCenter = cell;
    this.path = [];
    this.pauseT = pause;
  }

  // 들으면 소리 난 곳으로 간다. 들었는지 여부를 돌려준다
  hear(x, z, radius, level) {
    if (!this.active || this.state === CHASE) return false;
    const d = Math.hypot(x - this.pos.x, z - this.pos.z);
    const los = level.lineOfSight(this.pos.x, this.pos.z, x, z);
    if (d > radius * this.cfg.hearing * (los ? 1 : 0.6)) return false;
    this._goInvestigate(x, z, level);
    return true;
  }

  _teleportNear(level, player) {
    const [px, py] = level.cellAt(player.pos.x, player.pos.z);
    for (let i = 0; i < 12; i++) {
      const [cx, cy] = level.randomCellAround(px, py, 5, 8);
      const c = level.center(cx, cy);
      if (!level.lineOfSight(c.x, c.z, player.pos.x, player.pos.z)) {
        this.pos.set(c.x, 0, c.z);
        this.path = [];
        this.syncMesh();
        return;
      }
    }
  }

  // 추격 대상이 아닐 때의 조사 → 수색 → 배회 루틴
  _routine(dt, level, player, ex, ey) {
    let target = null;
    let speed = this.cfg.wander;
    if (this.state === INVESTIGATE) {
      speed = this.cfg.investigate ?? this.cfg.wander * 1.7;
      if (!this.path.length) {
        const i = this.investigate;
        if (i && Math.hypot(i.x - this.pos.x, i.z - this.pos.z) > 0.6) target = i;
        else this._goSearch(this.searchCenter, 8, 1.5);
      }
    } else if (this.state === SEARCH) {
      speed = this.cfg.wander * 1.2;
      this.searchT -= dt;
      if (!this.path.length && this.pauseT <= 0) {
        const c = level.randomCellAround(...this.searchCenter, 0, 2);
        this.path = level.findPath(ex, ey, ...c);
        this.pauseT = Math.random() * 1.5;
      }
      if (this.searchT <= 0) this.state = WANDER;
    } else {
      if (!this.path.length && this.pauseT <= 0) {
        const c = level.randomCellAround(ex, ey, 3, 10);
        this.path = level.findPath(ex, ey, ...c);
        if (Math.random() < 0.35) this.pauseT = 1.5 + Math.random() * 3.5;
      }
      // 너무 멀리서 헤매면 플레이어 근처(보이지 않는 곳)로 옮겨온다
      if (this.dist > 34) {
        this.farT += dt;
        if (this.farT > 35) {
          this.farT = 0;
          this._teleportNear(level, player);
        }
      } else this.farT = 0;
    }
    return { target, speed };
  }

  // 추격: 가까우면 직진, 아니면 0.5초마다 경로 재계산
  _chaseTarget(dt, level, ex, ey, tgt, direct) {
    if (direct) {
      this.path = [];
      return { x: tgt.x, z: tgt.z };
    }
    this.repath -= dt;
    if (this.repath <= 0 || !this.path.length) {
      const [tx, ty] = level.cellAt(tgt.x, tgt.z);
      this.path = level.findPath(ex, ey, tx, ty);
      this.repath = 0.5;
      if (!this.path.length) return { x: tgt.x, z: tgt.z };
    }
    return null;
  }

  // 경로 또는 직선 목표로 이동. 움직였으면 true
  _move(dt, level, target, speed, face, canMove = true) {
    if (!target && this.path.length) {
      const c = level.center(...this.path[0]);
      if (Math.hypot(c.x - this.pos.x, c.z - this.pos.z) < 0.35) this.path.shift();
      else target = c;
    }
    this.pauseT -= dt;
    let moving = false;
    if (canMove && target && (this.pauseT <= 0 || this.state === CHASE)) {
      this.speed += (speed - this.speed) * Math.min(1, dt * 2.5);
      const tx = target.x - this.pos.x;
      const tz = target.z - this.pos.z;
      const tl = Math.hypot(tx, tz);
      if (tl > 0.01) {
        const step = Math.min(tl, this.speed * dt);
        this.pos.x += (tx / tl) * step;
        this.pos.z += (tz / tl) * step;
        this.yaw = angleLerp(this.yaw, Math.atan2(tx, tz), Math.min(1, dt * 6));
        moving = true;
      }
      level.collide(this.pos, 0.28, true);
    } else {
      this.speed *= Math.max(0, 1 - dt * 5);
      if (canMove && face) this.yaw = angleLerp(this.yaw, Math.atan2(face.x - this.pos.x, face.z - this.pos.z), Math.min(1, dt * 3));
    }

    // 끼임 감지: 1.2초 동안 거의 못 움직였으면 셀 중앙 쪽으로 빼낸다
    this.stuckT += dt;
    if (this.stuckT > 1.2) {
      if (moving && Math.hypot(this.pos.x - this.stuckRef.x, this.pos.z - this.stuckRef.z) < 0.25) {
        const [cx, cy] = level.cellAt(this.pos.x, this.pos.z);
        const c = level.center(cx, cy);
        this.pos.x += (c.x - this.pos.x) * 0.5;
        this.pos.z += (c.z - this.pos.z) * 0.5;
        this.path = [];
      }
      this.stuckT = 0;
      this.stuckRef = { x: this.pos.x, z: this.pos.z };
    }
    return moving;
  }

  _footstep(dt, stride, ev) {
    this.stepT += this.speed * dt;
    if (this.stepT > stride) {
      this.stepT = 0;
      ev.push('step');
    }
  }

  _flush(ev) {
    if (this.pending.length) {
      ev.push(...this.pending);
      this.pending = [];
    }
    return ev;
  }
}
