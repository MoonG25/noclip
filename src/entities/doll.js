// LEVEL 1 · 사람만 한 도자기 인형
// 빛 속에서 지켜보는 동안에는 움직이지 못한다.
// 눈을 떼거나, 불이 꺼지거나 깜빡이거나, 테이프가 튀는 순간 다가온다.
import * as THREE from 'three';
import { EntityBase, CHASE } from './base.js';

const HEAD_R = 0.23;
const _v = new THREE.Vector3();
const _f = new THREE.Vector3();
const _d = new THREE.Vector3();

export class Doll extends EntityBase {
  get awakeMessage() {
    return '…어딘가에서 오르골 소리가 들리기 시작했다';
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

  reset(level, theme) {
    super.reset(level, theme);
    this.tilt = 0.5;
    this.tiltT = 2;
    this.observed = false;
    this.seenT = 0;
    this.setScream(false);
  }

  // 플레이어가 지금 이 인형을 "보고" 있는가: 화면 안 + 벽에 안 가림 + 빛이 닿음
  _observed(player, level, camera, glitch) {
    if (glitch > 0.55 || !this.los) return false;
    camera.updateMatrixWorld();
    let inView = false;
    for (const h of [0.9, 1.7]) {
      _v.set(this.pos.x, h, this.pos.z).project(camera);
      if (_v.z < 1 && Math.abs(_v.x) < 0.95 && Math.abs(_v.y) < 0.95) {
        inView = true;
        break;
      }
    }
    if (!inView) return false;
    if (this.dist < 3) return true;
    if (player.flashOn && player.flashlight.intensity > 5) {
      camera.getWorldDirection(_f);
      _d.set(this.pos.x - camera.position.x, 1.2 - camera.position.y, this.pos.z - camera.position.z);
      const dl = _d.length();
      if (dl < 22 && _f.dot(_d) / dl > Math.cos(0.42)) return true;
    }
    const [cx, cy] = level.cellAt(this.pos.x, this.pos.z);
    return level.fixtures[cy * level.W + cx].b > 0.3 && this.dist < 16;
  }

  update(dt, { level, player, time, camera, glitch }) {
    const ev = [];
    if (this._sleeping(dt, ev)) return ev;
    this._sense(player, level);
    const observed = this._observed(player, level, camera, glitch);
    if (observed && !this.observed) this.syncMesh(); // 보는 순간의 모습이 진짜 위치다
    this.observed = observed;

    // 인형은 어둠 속에서도 본다
    const sees = this.los && this.dist < this.cfg.sight;
    if (sees) {
      this.lastSeen.copy(player.pos);
      this.lostT = 0;
      if (this.state !== CHASE) {
        this.state = CHASE;
        this.path = [];
        this.repath = 0;
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
        if (this.lostT > 8) {
          this._goSearch(level.cellAt(this.lastSeen.x, this.lastSeen.z), 10);
          ev.push('lost');
        }
      }
      if (this.state === CHASE) {
        target = this._chaseTarget(dt, level, ex, ey, sees ? player.pos : this.lastSeen, sees && this.dist < 7);
      }
    } else ({ target, speed } = this._routine(dt, level, player, ex, ey));

    const moving = this._move(dt, level, target, speed, player.pos, !observed);
    if (moving) this._footstep(dt, this.state === CHASE ? 0.9 : 1.2, ev);
    if (this.dist < 0.95) ev.push('caught');
    this._animate(dt, time, camera, moving, observed);
    return this._flush(ev);
  }

  jumpscarePose() {
    this.setScream(true);
    this.syncMesh();
    this.body.rotation.x = 0.22;
    for (let i = 0; i < 2; i++) {
      this.arms[i].rotation.x = -1.35;
      this.forearms[i].rotation.x = -0.25;
    }
  }

  _animate(dt, time, camera, moving, observed) {
    const chase = this.state === CHASE;
    this.setScream(chase);
    if (observed) {
      // 얼어붙는다. 오래 쳐다보고 있으면 고개만 아주 조금씩 꺾인다
      this.seenT += dt;
      if (this.seenT > 3 && Math.random() < dt * 0.5) this.head.rotateZ((Math.random() - 0.5) * 0.5);
      return;
    }
    this.seenT = 0;
    this.walk += this.speed * dt * 2.6;
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
      // 두 팔을 앞으로 뻗고 덜덜 떨며 다가온다
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
      if (!moving && Math.random() < 0.04) this.forearms[Math.random() < 0.5 ? 0 : 1].rotation.x = -1.4;
      this.body.position.x = 0;
    }
    // 몸이 어느 쪽을 보든 머리는 항상 플레이어를 본다
    this.head.lookAt(camera.getWorldPosition(_v));
    const twitch = Math.random() < (chase ? 0.3 : 0.05) ? (Math.random() - 0.5) * 1.2 : 0;
    this.head.rotateZ(this.tilt + twitch);
  }
}
