// LEVEL 3 · 스마일러
// 어둠 속에서만 움직이는 웃는 얼굴. 정상 등이 켜진 칸으로는 들어오지 못하고, 불빛 가장자리에서 기다린다.
// 손전등을 보고 온다: 켜고 있으면 멀리서도 보고, 벽 너머에서도 불빛 쪽으로 다가온다.
// 차단기를 올려 등이 들어오면 그 자리에서 쉿 소리를 내며 어둠으로 달아난다.
import * as THREE from 'three';
import { EntityBase, CHASE } from './base.js';

const _v = new THREE.Vector3();

export class Smiler extends EntityBase {
  get awakeMessage() {
    return '…어둠 속에서 무언가 웃고 있다';
  }

  // 길을 찾을 때 켜진 등 아래 칸은 지나지 않는다
  passable(level) {
    const W = level.W;
    return (i) => !level.isLit(i % W, (i / W) | 0);
  }

  _build(tex) {
    const g = new THREE.Group();
    // 몸은 빛을 반사하지 않는 검은 형체. 손전등을 비추면 사람 모양의 구멍처럼 보인다
    const black = new THREE.MeshBasicMaterial({ color: 0x020203 });
    const body = new THREE.Group();
    g.add(body);
    this.body = body;
    const mesh = (geo, x, y, z, parent = body) => {
      const m = new THREE.Mesh(geo, black);
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
    // 가늘고 긴 다리
    this.legs = [];
    for (const s of [-1, 1]) {
      const hip = pivot(s * 0.1, 1.0, 0);
      mesh(new THREE.CylinderGeometry(0.06, 0.035, 1.0, 6), 0, -0.5, 0, hip);
      this.legs.push(hip);
    }
    // 앞으로 굽은 몸통
    const torso = pivot(0, 1.0, 0);
    this.torso = torso;
    const chest = mesh(new THREE.CylinderGeometry(0.2, 0.11, 0.8, 8), 0, 0.4, 0, torso);
    chest.scale.z = 0.6;
    // 무릎까지 늘어진 팔
    this.arms = [];
    for (const s of [-1, 1]) {
      const sh = pivot(s * 0.22, 0.76, 0, torso);
      mesh(new THREE.CylinderGeometry(0.04, 0.025, 1.05, 6), 0, -0.52, 0, sh);
      // 손가락처럼 갈라진 끝
      for (const f of [-1, 0, 1]) {
        const fg = mesh(new THREE.CylinderGeometry(0.012, 0.004, 0.2, 4), f * 0.025, -1.12, 0, sh);
        fg.rotation.z = f * 0.18;
      }
      this.arms.push(sh);
    }
    mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.16, 6), 0, 0.86, 0, torso);
    const head = pivot(0, 1.02, 0.04, torso);
    mesh(new THREE.SphereGeometry(0.2, 12, 10), 0, 0, 0, head).scale.set(1, 1.15, 0.9);
    // 얼굴: 안개에 묻히지 않고 가산 혼합으로 빛난다 (검은 부분은 보이지 않는다)
    this.faceMat = new THREE.MeshBasicMaterial({
      map: tex.smile,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    // 색을 1보다 크게 줘서 어둠 속에서 하얗게 타오르게 한다. 웃음은 머리보다 넓다
    this.faceMat.color.setRGB(1.7, 1.65, 1.5);
    this.face = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.675), this.faceMat);
    this.face.position.set(0, -0.04, 0.26);
    this.face.renderOrder = 10;
    // 얼굴 뒤의 어둠: 머리보다 넓은 웃음이 검은 바탕 위에 떠 있게 한다 (작은 머리가 웃음 사이로 비치지 않게)
    this.voidMat = new THREE.MeshBasicMaterial({ color: 0x020203, alphaMap: tex.shade, transparent: true, depthWrite: false });
    this.void = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.8), this.voidMat);
    this.void.position.set(0, -0.04, 0.245);
    this.void.renderOrder = 9;
    head.add(this.void, this.face);
    this.halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: tex.glow,
        color: 0xfff2d0,
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      }),
    );
    this.halo.position.set(0, -0.02, 0.15);
    this.halo.scale.setScalar(1.3);
    head.add(this.halo);
    this.head = head;
    g.visible = false;
    return g;
  }

  reset(level, theme) {
    super.reset(level, theme);
    this.fleeing = false;
    this.lureT = 0;
    this.lurkT = 0;
    this.lurking = false;
    this.lurkSaid = false;
    this.blockT = 0;
    this.blinkT = 3;
    this.fadeK = 1;
    this.tilt = 0;
    this.tiltT = 2;
    this.face.scale.setScalar(1);
    this.faceMat.map = this.tex.smile;
    this.faceMat.depthTest = true;
    this.voidMat.depthTest = true;
  }

  syncMesh() {
    this.mesh.position.copy(this.pos);
  }

  // 가장 가까운 어두운 칸 (불빛을 피해 달아날 곳, 불빛 밖에서 기다릴 곳)
  _darkNear(level, cx, cy) {
    const { dist } = level.bfs(cx, cy);
    let best = -1;
    for (let i = 0; i < dist.length; i++) {
      if (dist[i] < 0 || level.isLit(i % level.W, (i / level.W) | 0)) continue;
      if (best < 0 || dist[i] < dist[best]) best = i;
    }
    return best < 0 ? null : [best % level.W, (best / level.W) | 0];
  }

  update(dt, { level, player, time, camera }) {
    const ev = [];
    if (this._sleeping(dt, ev)) return ev;
    this._sense(player, level);
    const cfg = this.cfg;
    const [ex, ey] = level.cellAt(this.pos.x, this.pos.z);
    const [px, py] = level.cellAt(player.pos.x, player.pos.z);
    const playerLit = level.isLit(px, py);

    // 등이 들어왔다: 쉿 소리를 내며 가장 가까운 어둠으로
    if (level.isLit(ex, ey)) {
      if (!this.fleeing) {
        this.fleeing = true;
        ev.push('flee');
        const d = this._darkNear(level, ex, ey);
        this.path = d ? level.findPath(ex, ey, ...d) : [];
      }
    } else if (this.fleeing) {
      this.fleeing = false;
      this._goSearch([ex, ey], 6, 1.5);
    }

    // 감각: 손전등을 켜면 멀리서도 보인다. 불빛 아래 서 있어도 보인다. 어둠 속에서는 코앞이어야
    const flash = player.flashOn && player.flashlight.intensity > 3;
    let range = cfg.sight * (player.crouch > 0.5 ? 0.7 : 1);
    if (playerLit) range = Math.max(range, cfg.lightSight * 0.7);
    if (flash) range = cfg.lightSight;
    const sees = !this.fleeing && this.los && this.dist < range;
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

    // 벽 너머의 손전등 불빛에 끌려온다
    this.lureT -= dt;
    if (flash && !sees && this.state !== CHASE && !this.fleeing && this.dist < cfg.lure && this.lureT <= 0) {
      this.lureT = 1.5;
      this._goInvestigate(player.pos.x, player.pos.z, level);
    }

    let target = null;
    let speed = cfg.wander;
    this.lurking = false;
    if (this.fleeing) {
      speed = cfg.chase * 1.25;
      this.pauseT = 0;
      // 등은 가까운 것부터 차례로 켜지므로, 가는 길에 또 밝아지면 다시 더 먼 어둠을 찾는다
      if (!this.path.length) {
        const d = this._darkNear(level, ex, ey);
        if (d) {
          this.path = level.findPath(ex, ey, ...d);
          if (!this.path.length) target = level.center(...d);
        }
      }
    } else if (this.state === CHASE) {
      speed = cfg.chase;
      if (!sees) {
        this.lostT += dt;
        if (this.lostT > 6) {
          this._goSearch(level.cellAt(this.lastSeen.x, this.lastSeen.z), 10);
          ev.push('lost');
        }
      }
      if (this.state === CHASE) {
        const tgt = sees ? player.pos : this.lastSeen;
        const [tx, ty] = level.cellAt(tgt.x, tgt.z);
        if (level.isLit(tx, ty)) {
          // 불빛 속으로는 못 들어간다: 바로 바깥 어둠까지 와서, 가장자리에 붙어 기다린다
          this.repath -= dt;
          if (this.repath <= 0) {
            this.repath = 0.5;
            const d = this._darkNear(level, tx, ty);
            this.path = d ? level.findPath(ex, ey, ...d, this.passable(level)) : [];
          }
          if (!this.path.length) {
            // 보이면 가장자리까지 바짝 붙고, 안 보이면 그 자리에서 기다린다
            if (sees) target = tgt;
            this.lurking = sees;
          }
        } else target = this._chaseTarget(dt, level, ex, ey, tgt, sees && this.dist < 6 && this.blockT <= 0);
      }
    } else ({ target, speed } = this._routine(dt, level, player, ex, ey));

    // 불빛 경계: 켜진 칸으로 넘어가려 하면 그 자리에 멈춘다 (달아날 때는 예외)
    this.blockT -= dt;
    const bx = this.pos.x;
    const bz = this.pos.z;
    const moving = this._move(dt, level, target, speed, player.pos);
    if (!this.fleeing) {
      const [nx, ny] = level.cellAt(this.pos.x, this.pos.z);
      if ((nx !== ex || ny !== ey) && level.isLit(nx, ny)) {
        this.pos.x = bx;
        this.pos.z = bz;
        // 곧장 가는 길이 불빛에 막혔다: 잠시 어둠을 따라 돌아간다
        this.blockT = 1.2;
        this.repath = 0;
      }
    }
    if (moving) this._footstep(dt, this.state === CHASE ? 1.1 : 1.5, ev);

    // 불빛 가장자리에서 오래 노려보고 있으면 알린다
    if (this.lurking && this.dist < 9) {
      this.lurkT += dt;
      if (this.lurkT > 1.2 && !this.lurkSaid) {
        this.lurkSaid = true;
        ev.push('lurk');
      }
    } else {
      this.lurkT = 0;
      if (this.dist > 14) this.lurkSaid = false;
    }

    if (!this.fleeing && this.dist < 0.9 && this.los) ev.push('caught');
    this._animate(dt, time, camera, moving);
    return this._flush(ev);
  }

  proximity() {
    if (!this.active) return 0;
    // 불빛 너머에서 노려보고 있을 때가 가장 무섭다
    const k = this.lurking ? 1.25 : 1;
    return Math.min(1, Math.max(0, 1 - this.dist / 18) * (this.los ? 1 : 0.5) * k);
  }

  jumpscarePose() {
    this.faceMat.map = this.tex.smileOpen;
    this.faceMat.opacity = 1;
    this.voidMat.opacity = 1;
    // 코앞까지 덮친 순간에는 굽은 몸통·목이 웃음을 가리지 않게 얼굴을 맨 위에 그린다
    this.faceMat.depthTest = false;
    this.voidMat.depthTest = false;
    this.face.scale.setScalar(1.35);
    this.halo.material.opacity = 0.3;
    this.torso.rotation.x = 0.35;
    for (let i = 0; i < 2; i++) {
      this.arms[i].rotation.x = -1.2;
      this.arms[i].rotation.z = (i ? -1 : 1) * 0.35;
    }
  }

  faceCamera(camera) {
    this.head.lookAt(camera.position);
  }

  _animate(dt, time, camera, moving) {
    const chase = this.state === CHASE;
    this.faceMat.map = this.fleeing ? this.tex.smileOpen : this.tex.smile;
    this.face.scale.setScalar(1);
    this.halo.material.opacity = 0.12;
    this.walk += this.speed * dt * 2.2;
    const w = this.walk;
    const k = moving ? Math.min(1, this.speed / 1.5) : 0;
    // 발이 바닥에 거의 닿지 않는 듯 미끄러지며 위아래로 출렁인다
    this.mesh.position.set(this.pos.x, Math.sin(time * 1.4) * 0.03, this.pos.z);
    this.mesh.rotation.y = this.yaw;
    this.legs[0].rotation.x = Math.sin(w) * 0.25 * k;
    this.legs[1].rotation.x = -Math.sin(w) * 0.25 * k;
    this.torso.rotation.x = chase ? 0.42 : 0.18;
    for (let i = 0; i < 2; i++) {
      const s = i ? -1 : 1;
      if (chase) {
        this.arms[i].rotation.x = -0.6 + Math.sin(w * 2 + i) * 0.25;
        this.arms[i].rotation.z = s * 0.25;
      } else {
        this.arms[i].rotation.x = Math.sin(time * 0.8 + i * 1.7) * 0.08 + Math.sin(w + i * Math.PI) * 0.15 * k;
        this.arms[i].rotation.z = s * 0.05;
      }
    }
    // 웃음은 늘 나를 본다. 고개는 가끔 천천히 기운다
    this.tiltT -= dt;
    if (this.tiltT <= 0) {
      this.tiltT = 2 + Math.random() * 4;
      this.tilt = (Math.random() - 0.5) * 0.9;
    }
    this.head.lookAt(camera.getWorldPosition(_v));
    this.head.rotateZ(this.tilt * (chase ? 0.4 : 1));
    // 배회할 때는 가끔 웃음이 꺼졌다가 다시 떠오른다 (어디 있는지 놓치게)
    this.blinkT -= dt;
    let want = 1;
    if (!chase && !this.lurking) {
      if (this.blinkT < 0.6) want = 0;
      if (this.blinkT <= 0) this.blinkT = 4 + Math.random() * 7;
    }
    this.fadeK += (want - this.fadeK) * Math.min(1, dt * 6);
    this.faceMat.opacity = this.fadeK * (0.92 + Math.random() * 0.08);
    this.voidMat.opacity = this.fadeK;
  }
}
