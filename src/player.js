import * as THREE from 'three';

const WALK = 2.6;
const SPRINT = 5.0;
const CROUCH = 1.3;
const RADIUS = 0.32;
const WADE = 0.62; // 물속에서는 이만큼 느려진다

export class Player {
  constructor(camera) {
    this.camera = camera;
    camera.rotation.order = 'YXZ';
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector2();
    this.yaw = 0;
    this.pitch = 0;
    this.keys = {};
    this.stamina = 1;
    this.exhausted = false;
    this.crouch = 0;
    this.bob = 0;
    this.stepDist = 0;
    this.battery = 100;
    this.flashOn = false;
    this.sanity = 1;
    this.sprinting = false;
    this.lit = 1;
    this.frozen = false;
    this.groundY = 0;
    this.inWater = false;

    this.flashlight = new THREE.SpotLight(0xfff1d6, 0, 24, 0.45, 0.6, 1.4);
    this.flashlight.position.set(0.12, -0.08, 0);
    this.flashlight.target.position.set(0, -0.12, -1);
    camera.add(this.flashlight, this.flashlight.target);
  }

  reset(x, z, yaw) {
    this.pos.set(x, 0, z);
    this.groundY = 0;
    this.inWater = false;
    this.vel.set(0, 0);
    this.yaw = yaw;
    this.pitch = 0;
    this.stamina = 1;
    this.exhausted = false;
    this.sanity = 1;
    this.keys = {};
  }

  look(dx, dy, sens) {
    if (this.frozen) return;
    this.yaw -= dx * sens;
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch - dy * sens));
  }

  toggleFlash() {
    if (this.battery <= 0) {
      this.flashOn = false;
      return false;
    }
    this.flashOn = !this.flashOn;
    return true;
  }

  // 시각 노출도: 엔티티의 시야 거리 배율
  visibility() {
    let v = this.flashOn ? 1.25 : this.lit > 0.35 ? 1.0 : 0.55;
    if (this.crouch > 0.5) v *= 0.7;
    return v;
  }

  forward(out = new THREE.Vector3()) {
    return this.camera.getWorldDirection(out);
  }

  update(dt, level, time) {
    const k = this.keys;
    const steps = [];
    const fwd = this.frozen ? 0 : (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
    const str = this.frozen ? 0 : (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
    const crouching = !this.frozen && (k.KeyC || k.ControlLeft);
    this.crouch += ((crouching ? 1 : 0) - this.crouch) * Math.min(1, dt * 10);

    const moving = fwd !== 0 || str !== 0;
    this.sprinting = !!(k.ShiftLeft || k.ShiftRight) && fwd > 0 && !this.exhausted && !crouching && moving;
    this.inWater = !!(level.isWaterAt && level.isWaterAt(this.pos.x, this.pos.z));
    const speed = (crouching ? CROUCH : this.sprinting ? SPRINT : WALK) * (this.inWater ? WADE : 1);

    const sy = Math.sin(this.yaw);
    const cy = Math.cos(this.yaw);
    let mx = -sy * fwd + cy * str;
    let mz = -cy * fwd - sy * str;
    const ml = Math.hypot(mx, mz);
    if (ml > 0) {
      mx = (mx / ml) * speed;
      mz = (mz / ml) * speed;
    }
    const a = Math.min(1, dt * (moving ? 10 : 8));
    this.vel.x += (mx - this.vel.x) * a;
    this.vel.y += (mz - this.vel.y) * a;

    const before = { x: this.pos.x, z: this.pos.z };
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.y * dt;
    level.collide(this.pos, RADIUS);
    const moved = Math.hypot(this.pos.x - before.x, this.pos.z - before.z);

    // 스태미나: 다 쓰면 한동안 못 뛴다
    if (this.sprinting) {
      this.stamina -= dt / 5.5;
      if (this.stamina <= 0) {
        this.stamina = 0;
        this.exhausted = true;
      }
    } else {
      this.stamina = Math.min(1, this.stamina + dt / (this.exhausted ? 7 : 4));
      if (this.exhausted && this.stamina > 0.4) this.exhausted = false;
    }

    // 발소리 = 엔티티에게 들리는 소음
    const stride = this.sprinting ? 1.7 : crouching ? 0.75 : 1.15;
    this.stepDist += moved;
    if (this.stepDist > stride) {
      this.stepDist = 0;
      steps.push(this.sprinting ? 1 : crouching ? 0.12 : 0.42);
    }

    // 헤드밥 + 숨찬 흔들림
    const spd = moved / Math.max(dt, 1e-4);
    this.bob += moved * (Math.PI * 2) / (stride * 2);
    const amp = Math.min(1, spd / WALK) * (this.sprinting ? 0.07 : 0.035);
    // 물에 들어가거나 나올 때 시점이 계단처럼 부드럽게 내려가고 올라간다
    const ground = level.groundAt ? level.groundAt(this.pos.x, this.pos.z) : 0;
    this.groundY += (ground - this.groundY) * Math.min(1, dt * 6);
    const eye = this.groundY + 1.62 - this.crouch * 0.6;
    const pant = this.exhausted ? Math.sin(time * 9) * 0.012 : 0;
    this.camera.position.set(this.pos.x, eye + Math.abs(Math.sin(this.bob)) * amp + pant, this.pos.z);
    const roll = Math.sin(this.bob * 0.5) * amp * 0.25 + Math.sin(time * 0.6) * 0.004;
    this.camera.rotation.set(this.pitch + Math.sin(time * 0.9) * 0.003, this.yaw, roll);

    // 손전등 배터리
    if (this.flashOn) {
      this.battery = Math.max(0, this.battery - dt * 0.6);
      if (this.battery <= 0) this.flashOn = false;
    }
    let fi = this.flashOn ? 38 : 0;
    if (this.flashOn && this.battery < 15 && Math.sin(time * 37) * Math.sin(time * 13.3) > 0.6) fi *= 0.15;
    this.flashlight.intensity = fi;

    return { steps, moved };
  }
}
