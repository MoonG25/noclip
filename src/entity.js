// 사람만 한 도자기 인형. 소리를 듣고, 보이면 쫓아오고, 놓치면 주변을 뒤진다.
// 움직임은 일부러 끊기게(스톱모션) 갱신해서 사람이 아닌 것처럼 보이게 한다.
import * as THREE from 'three';

const WANDER = 'wander';
const INVESTIGATE = 'investigate';
const CHASE = 'chase';
const SEARCH = 'search';
const HEAD_R = 0.23;

function angleLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export class Entity {
  constructor(tex) {
    this.tex = tex;
    this.pos = new THREE.Vector3();
    this.mesh = this._build(tex);
    this.lastSeen = new THREE.Vector3();
    this.state = WANDER;
    this.path = [];
    this.active = false;
  }

  _build(tex) {
    const g = new THREE.Group();
    const porcelain = new THREE.MeshLambertMaterial({ color: 0xe6d8c6 });
    const dressMat = new THREE.MeshLambertMaterial({ map: tex.dress, side: THREE.DoubleSide });
    const hairMat = new THREE.MeshLambertMaterial({ map: tex.hair });
    const sockMat = new THREE.MeshLambertMaterial({ color: 0xe6e0d4 });
    const shoeMat = new THREE.MeshLambertMaterial({ color: 0x141010 });
    const ribbonMat = new THREE.MeshLambertMaterial({ color: 0x7a1a22 });
    const body = new THREE.Group();
    g.add(body);
    this.body = body;
    const mesh = (geo, mat, x = 0, y = 0, z = 0, parent = body) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      parent.add(m);
      return m;
    };
    const pivot = (x, y, z, parent = body) => {
      const p = new THREE.Group();
      p.position.set(x, y, z);
      parent.add(p);
      return p;
    };

    // 다리: 구체 관절이 드러난 도자기 다리, 흰 양말, 검은 구두
    this.legs = [];
    this.shins = [];
    for (const s of [-1, 1]) {
      const hip = pivot(s * 0.09, 0.95, 0);
      mesh(new THREE.CylinderGeometry(0.055, 0.045, 0.45, 8), porcelain, 0, -0.225, 0, hip);
      mesh(new THREE.SphereGeometry(0.05, 8, 6), porcelain, 0, -0.47, 0, hip);
      const knee = pivot(0, -0.47, 0, hip);
      mesh(new THREE.CylinderGeometry(0.045, 0.038, 0.42, 8), sockMat, 0, -0.21, 0, knee);
      mesh(new THREE.BoxGeometry(0.09, 0.07, 0.17), shoeMat, 0, -0.45, 0.03, knee);
      this.legs.push(hip);
      this.shins.push(knee);
    }

    // 종 모양 드레스 + 레이스 밑단
    const skirt = new THREE.LatheGeometry(
      [
        new THREE.Vector2(0.4, 0.42),
        new THREE.Vector2(0.37, 0.55),
        new THREE.Vector2(0.29, 0.76),
        new THREE.Vector2(0.2, 0.93),
        new THREE.Vector2(0.15, 1.03),
      ],
      14,
    );
    mesh(skirt, dressMat);
    const hem = mesh(new THREE.TorusGeometry(0.4, 0.035, 6, 20), dressMat, 0, 0.43, 0);
    hem.rotation.x = Math.PI / 2;
    mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.36, 12), dressMat, 0, 1.2, 0);
    mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.04, 16), sockMat, 0, 1.39, 0);
    // 목의 리본
    for (const s of [-1, 1]) {
      const bow = mesh(new THREE.ConeGeometry(0.035, 0.07, 6), ribbonMat, s * 0.04, 1.37, 0.14);
      bow.rotation.z = (s * Math.PI) / 2;
    }
    mesh(new THREE.SphereGeometry(0.02, 6, 4), ribbonMat, 0, 1.37, 0.15);

    // 팔: 부푼 소매, 어깨·팔꿈치·손목 구체 관절
    this.arms = [];
    this.forearms = [];
    for (const s of [-1, 1]) {
      const sleeve = mesh(new THREE.SphereGeometry(0.085, 10, 8), dressMat, s * 0.19, 1.33, 0);
      sleeve.scale.set(1, 0.9, 1);
      const sh = pivot(s * 0.19, 1.31, 0);
      mesh(new THREE.CylinderGeometry(0.04, 0.036, 0.28, 8), porcelain, 0, -0.16, 0, sh);
      mesh(new THREE.SphereGeometry(0.042, 8, 6), porcelain, 0, -0.31, 0, sh);
      const el = pivot(0, -0.31, 0, sh);
      mesh(new THREE.CylinderGeometry(0.036, 0.03, 0.26, 8), porcelain, 0, -0.14, 0, el);
      mesh(new THREE.SphereGeometry(0.03, 6, 5), porcelain, 0, -0.28, 0, el);
      const hand = mesh(new THREE.SphereGeometry(0.045, 8, 6), porcelain, 0, -0.33, 0.01, el);
      hand.scale.set(0.75, 1.3, 0.45);
      this.arms.push(sh);
      this.forearms.push(el);
    }

    // 목과 머리
    mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.12, 8), porcelain, 0, 1.45, 0);
    mesh(new THREE.SphereGeometry(0.045, 8, 6), porcelain, 0, 1.5, 0);
    const head = pivot(0, 1.69, 0);
    this.faceMat = new THREE.MeshLambertMaterial({ map: tex.dollFace, emissive: 0x2a2520 });
    mesh(new THREE.SphereGeometry(HEAD_R, 28, 18), this.faceMat, 0, 0, 0, head);
    // 머리카락: 얼굴 쪽만 비운 반구 + 정수리
    const front = Math.PI / 2;
    const win = 1.45;
    mesh(new THREE.SphereGeometry(HEAD_R + 0.012, 20, 12, front + win / 2, Math.PI * 2 - win, 0, Math.PI * 0.78), hairMat, 0, 0, 0, head);
    mesh(new THREE.SphereGeometry(HEAD_R + 0.014, 20, 6, 0, Math.PI * 2, 0, Math.PI * 0.27), hairMat, 0, 0, 0, head);
    // 양 갈래 땋은 머리
    for (const s of [-1, 1]) {
      for (let i = 0; i < 7; i++) {
        const rr = 0.05 - i * 0.004;
        mesh(new THREE.SphereGeometry(rr, 8, 6), hairMat, s * (HEAD_R + i * 0.008), -0.06 - i * 0.065, -0.03, head);
      }
      const tie = mesh(new THREE.TorusGeometry(0.03, 0.012, 5, 10), ribbonMat, s * (HEAD_R + 0.06), -0.52, -0.03, head);
      tie.rotation.x = Math.PI / 2;
    }
    // 어둠 속에서 유리눈만 반짝인다
    this.glints = [];
    for (const s of [-1, 1]) {
      const phi = Math.PI / 2 + s * 0.38;
      const sp = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: tex.glow,
          color: 0xdde8ff,
          transparent: true,
          opacity: 0.55,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          fog: false,
        }),
      );
      sp.position.set(-Math.cos(phi) * HEAD_R * 1.04, 0.002, Math.sin(phi) * HEAD_R * 1.04);
      sp.scale.setScalar(0.045);
      head.add(sp);
      this.glints.push(sp);
    }
    this.head = head;
    g.visible = false;
    return g;
  }

  setScream(on) {
    this.faceMat.map = on ? this.tex.dollScream : this.tex.dollFace;
    for (const gl of this.glints) gl.visible = !on;
  }

  syncMesh() {
    this.mesh.position.copy(this.pos);
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
    this.repath = 0;
    this.lostT = 0;
    this.searchT = 0;
    this.searchCenter = [0, 0];
    this.speed = 0;
    this.farT = 0;
    this.stepT = 0;
    this.pauseT = 0;
    this.yaw = 0;
    this.walk = 0;
    this.poseT = 0;
    this.tilt = 0.5;
    this.tiltT = 2;
    this.stuckT = 0;
    this.stuckRef = { x: c.x, z: c.z };
    this.dist = 99;
    this.los = false;
    this.mesh.visible = false;
    this.setScream(false);
  }

  get chasing() {
    return this.state === CHASE;
  }

  proximity() {
    if (!this.active) return 0;
    return Math.max(0, 1 - this.dist / 20) * (this.los ? 1 : 0.55);
  }

  hear(x, z, radius, level) {
    if (!this.active || this.state === CHASE) return false;
    const d = Math.hypot(x - this.pos.x, z - this.pos.z);
    const los = level.lineOfSight(this.pos.x, this.pos.z, x, z);
    if (d > radius * this.cfg.hearing * (los ? 1 : 0.6)) return false;
    const [ex, ey] = level.cellAt(this.pos.x, this.pos.z);
    const [tx, ty] = level.cellAt(x, z);
    this.state = INVESTIGATE;
    this.path = level.findPath(ex, ey, tx, ty);
    this.searchCenter = [tx, ty];
    this.investigate = { x, z };
    this.pauseT = 0;
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
        return;
      }
    }
  }

  update(dt, level, player, time, camera) {
    const ev = [];
    if (!this.active) {
      this.grace -= dt;
      if (this.grace <= 0) {
        this.active = true;
        this.mesh.visible = true;
        ev.push('awake');
      }
      return ev;
    }

    const p = player.pos;
    const dx = p.x - this.pos.x;
    const dz = p.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    this.dist = dist;
    this.los = dist < 40 && level.lineOfSight(this.pos.x, this.pos.z, p.x, p.z);

    // 시각
    let sees = false;
    if (this.los) {
      const range = this.cfg.sight * player.visibility();
      if (dist < 2.5) sees = true;
      else if (dist < range) {
        if (this.state === CHASE) sees = true;
        else {
          const dot = (Math.sin(this.yaw) * dx + Math.cos(this.yaw) * dz) / dist;
          if (dot > Math.cos(1.15)) sees = true;
        }
      }
    }
    if (sees) {
      this.lastSeen.copy(p);
      this.lostT = 0;
      if (this.state !== CHASE) {
        this.state = CHASE;
        this.path = [];
        this.repath = 0;
        this.pauseT = 0;
        ev.push('chase');
      }
    }

    const [ex, ey] = level.cellAt(this.pos.x, this.pos.z);
    let target = null;
    let speed = this.cfg.wander;

    if (this.state === CHASE) {
      speed = this.cfg.chase;
      if (!sees) {
        this.lostT += dt;
        if (this.lostT > 4) {
          this.state = SEARCH;
          this.searchT = 10;
          this.searchCenter = level.cellAt(this.lastSeen.x, this.lastSeen.z);
          this.path = [];
          ev.push('lost');
        }
      }
      if (this.state === CHASE) {
        const tgt = sees ? p : this.lastSeen;
        if (sees && dist < 7) {
          target = { x: p.x, z: p.z };
          this.path = [];
        } else {
          this.repath -= dt;
          if (this.repath <= 0 || !this.path.length) {
            const [tx, ty] = level.cellAt(tgt.x, tgt.z);
            this.path = level.findPath(ex, ey, tx, ty);
            this.repath = 0.5;
            if (!this.path.length) target = { x: tgt.x, z: tgt.z };
          }
        }
      }
    } else if (this.state === INVESTIGATE) {
      speed = this.cfg.wander * 1.7;
      if (!this.path.length) {
        const i = this.investigate;
        if (i && Math.hypot(i.x - this.pos.x, i.z - this.pos.z) > 0.6) target = i;
        else {
          this.state = SEARCH;
          this.searchT = 8;
          this.pauseT = 1.5;
        }
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
      // 너무 멀리서 헤매면 플레이어 근처로 옮겨온다 (보이지 않는 곳으로)
      if (dist > 34) {
        this.farT += dt;
        if (this.farT > 35) {
          this.farT = 0;
          this._teleportNear(level, player);
        }
      } else this.farT = 0;
    }

    // 이동
    if (!target && this.path.length) {
      const c = level.center(...this.path[0]);
      if (Math.hypot(c.x - this.pos.x, c.z - this.pos.z) < 0.35) this.path.shift();
      else target = c;
    }
    this.pauseT -= dt;
    let moving = false;
    if (target && (this.pauseT <= 0 || this.state === CHASE)) {
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
      if (this.state === CHASE || this.los) this.yaw = angleLerp(this.yaw, Math.atan2(dx, dz), Math.min(1, dt * 3));
    }

    // 끼임 감지
    this.stuckT += dt;
    if (this.stuckT > 1.2) {
      if (moving && Math.hypot(this.pos.x - this.stuckRef.x, this.pos.z - this.stuckRef.z) < 0.25) {
        const c = level.center(ex, ey);
        this.pos.x += (c.x - this.pos.x) * 0.5;
        this.pos.z += (c.z - this.pos.z) * 0.5;
        this.path = [];
      }
      this.stuckT = 0;
      this.stuckRef = { x: this.pos.x, z: this.pos.z };
    }

    if (moving) {
      this.stepT += this.speed * dt;
      if (this.stepT > (this.state === CHASE ? 1.6 : 1.2)) {
        this.stepT = 0;
        ev.push('step');
      }
    }

    if (dist < 0.95 && this.los) ev.push('caught');

    this._animate(dt, time, camera, moving);
    return ev;
  }

  _animate(dt, time, camera, moving) {
    const chase = this.state === CHASE;
    this.walk += this.speed * dt * 2.6;
    this.setScream(chase);
    // 고개 각도는 몇 초마다 갑자기 꺾인다
    this.tiltT -= dt;
    if (this.tiltT <= 0) {
      this.tiltT = 1.5 + Math.random() * 4;
      this.tilt = (Math.random() < 0.5 ? -1 : 1) * (0.35 + Math.random() * 0.6);
    }
    // 스톱모션: 자세와 위치를 초당 8~14번만 갱신한다
    this.poseT -= dt;
    if (this.poseT > 0) return;
    this.poseT = chase ? 0.07 : 0.12;

    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.yaw;
    const k = moving ? Math.min(1, this.speed / 1.5) : 0;
    const w = this.walk;
    // 태엽 인형처럼 뻣뻣한 걸음과 좌우 흔들림
    this.legs[0].rotation.x = Math.sin(w) * 0.45 * k;
    this.legs[1].rotation.x = -Math.sin(w) * 0.45 * k;
    this.shins[0].rotation.x = Math.max(0, -Math.sin(w)) * 0.5 * k;
    this.shins[1].rotation.x = Math.max(0, Math.sin(w)) * 0.5 * k;
    this.body.rotation.z = Math.sin(w * 0.5) * 0.12 * k;
    this.body.rotation.x = chase ? 0.22 : 0.03;
    if (chase) {
      // 두 팔을 앞으로 뻗고 덜덜 떨며 달려든다
      for (let i = 0; i < 2; i++) {
        this.arms[i].rotation.x = -1.35 + (Math.random() - 0.5) * 0.3;
        this.arms[i].rotation.z = (i ? 1 : -1) * 0.12;
        this.forearms[i].rotation.x = -0.25 + (Math.random() - 0.5) * 0.4;
      }
      this.body.position.x = (Math.random() - 0.5) * 0.06;
    } else {
      for (let i = 0; i < 2; i++) {
        this.arms[i].rotation.x = (i ? -1 : 1) * Math.sin(w) * 0.18 * k;
        this.arms[i].rotation.z = (i ? 1 : -1) * 0.06;
        this.forearms[i].rotation.x = -0.15;
      }
      // 가만히 서 있을 때 가끔 한쪽 팔이 홱 꺾인다
      if (!moving && Math.random() < 0.04) this.forearms[Math.random() < 0.5 ? 0 : 1].rotation.x = -1.4;
      this.body.position.x = 0;
    }
    // 몸이 어느 쪽을 보든 머리는 항상 플레이어를 본다
    this.head.lookAt(camera.getWorldPosition(new THREE.Vector3()));
    const twitch = Math.random() < (chase ? 0.3 : 0.05) ? (Math.random() - 0.5) * 1.2 : 0;
    this.head.rotateZ(this.tilt + twitch);
  }
}
