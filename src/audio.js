// 모든 소리는 WebAudio로 합성한다. 오디오 파일 없음.
import * as THREE from 'three';

function noiseBuffer(ctx, sec, brown = false) {
  const len = Math.floor(ctx.sampleRate * sec);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (brown) {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    } else d[i] = w;
  }
  return buf;
}

function distortion(ctx, amount) {
  const ws = ctx.createWaveShaper();
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / n) * 2 - 1;
    curve[i] = ((1 + amount) * x) / (1 + amount * Math.abs(x));
  }
  ws.curve = curve;
  return ws;
}

// 오르골 선율 (자작, 단조 왈츠). 숫자는 A5 기준 반음, null은 쉼표
const MELODY = [12, 7, 3, 12, 7, 3, 10, 7, 2, 10, 7, 2, 8, 5, 0, 7, 3, -1, 0, null, null, null, null, null];

export class AudioEngine {
  constructor(camera) {
    this.listener = new THREE.AudioListener();
    camera.add(this.listener);
    const ctx = (this.ctx = this.listener.context);
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -12;
    this.comp.connect(this.listener.getInput());
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(this.comp);
    this.white = noiseBuffer(ctx, 2);
    this.brown = noiseBuffer(ctx, 4, true);
    this.heartT = 0;
    this.distantT = 18;
    this.bellT = 60;
    this.mic = null;
    this._initBeds();
  }

  resume() {
    if (this.ctx.state !== 'running') this.ctx.resume();
  }

  setVolume(v) {
    this.master.gain.setTargetAtTime(0.9 * v, this.ctx.currentTime, 0.05);
  }

  _loop(buf) {
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    s.start();
    return s;
  }

  _osc(type, freq) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.start();
    return o;
  }

  _initBeds() {
    const ctx = this.ctx;
    // 형광등 웅웅거림 (120Hz 계열)
    this.hum = ctx.createGain();
    this.hum.gain.value = 0;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    const saw = this._osc('sawtooth', 120);
    const sg = ctx.createGain();
    sg.gain.value = 0.25;
    saw.connect(sg).connect(lp);
    const sine = this._osc('sine', 60);
    const sn = ctx.createGain();
    sn.gain.value = 0.5;
    sine.connect(sn).connect(lp);
    const buzz = this._loop(this.white);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 3800;
    bp.Q.value = 6;
    const bg = ctx.createGain();
    bg.gain.value = 0.35;
    buzz.connect(bp).connect(bg).connect(lp);
    lp.connect(this.hum).connect(this.master);

    // 낮은 드론
    this.drone = ctx.createGain();
    this.drone.gain.value = 0;
    const br = this._loop(this.brown);
    const dl = ctx.createBiquadFilter();
    dl.type = 'lowpass';
    dl.frequency.value = 160;
    br.connect(dl).connect(this.drone);
    for (const f of [36.7, 37.3]) {
      const o = this._osc('sine', f);
      const g = ctx.createGain();
      g.gain.value = 0.18;
      o.connect(g).connect(this.drone);
    }
    this.drone.connect(this.master);

    // 테이프 잡음 (글리치 때 커진다)
    this.static = ctx.createGain();
    this.static.gain.value = 0;
    const st = this._loop(this.white);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1200;
    st.connect(hp).connect(this.static).connect(this.master);
    // 상시 깔리는 아주 약한 테이프 히스
    const hiss = ctx.createGain();
    hiss.gain.value = 0.012;
    hp.connect(hiss).connect(this.master);

    // 숨 가쁨
    this.breath = ctx.createGain();
    this.breath.gain.value = 0;
    const bn = this._loop(this.white);
    const bf = ctx.createBiquadFilter();
    bf.type = 'bandpass';
    bf.frequency.value = 900;
    bf.Q.value = 1.2;
    const lfo = this._osc('sine', 1.6);
    const lg = ctx.createGain();
    lg.gain.value = 0.5;
    const bmod = ctx.createGain();
    bmod.gain.value = 0.5;
    lfo.connect(lg).connect(bmod.gain);
    bn.connect(bf).connect(bmod).connect(this.breath).connect(this.master);
  }

  setTheme(theme) {
    this.theme = theme;
    this.humBase = 0.05 * theme.audio.hum;
    this.drone.gain.setTargetAtTime(0.09 * theme.audio.drone, this.ctx.currentTime, 1.5);
  }

  // 엔티티 3D 사운드. 버스 하나를 현재 레벨의 엔티티에 붙이고, 종류별 소리를 흘려보낸다
  attachEntity(obj) {
    if (!this.entityAudio) {
      const ctx = this.ctx;
      const pa = new THREE.PositionalAudio(this.listener);
      pa.setRefDistance(2.5);
      pa.setRolloffFactor(1.3);
      pa.setDistanceModel('inverse');
      this.entityBus = ctx.createGain();
      pa.setNodeSource(this.entityBus);
      this.entityAudio = pa;

      // 인형: 오르골
      this.musicBox = ctx.createGain();
      this.musicBox.gain.value = 0;
      this.musicBox.connect(this.entityBus);
      this.mb = { on: false, next: 0, i: 0, wind: 1 };
      this.giggleT = 30;

      // 하운드: 젖은 쇳소리 섞인 숨
      const mod = ctx.createGain();
      mod.gain.value = 0.5;
      this.houndLfo = this._osc('sine', 0.6);
      const lg = ctx.createGain();
      lg.gain.value = 0.5;
      this.houndLfo.connect(lg).connect(mod.gain);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 700;
      bp.Q.value = 1.2;
      this._loop(this.white).connect(bp).connect(mod);
      const glp = ctx.createBiquadFilter();
      glp.type = 'lowpass';
      glp.frequency.value = 220;
      this._loop(this.brown).connect(glp).connect(mod);
      this.houndBreath = ctx.createGain();
      this.houndBreath.gain.value = 0;
      mod.connect(this.houndBreath).connect(this.entityBus);
    }
    obj.add(this.entityAudio);
  }

  setEntityKind(kind) {
    this.kind = kind;
    if (!this.entityAudio) return;
    const t = this.ctx.currentTime;
    this.mbWanted = false;
    this.mb.on = false;
    this.musicBox.gain.cancelScheduledValues(t);
    this.musicBox.gain.setValueAtTime(0, t);
    this.houndBreath.gain.setValueAtTime(0, t);
  }

  // 인형: 배회·수색 중에는 오르골이 흐르고, 추격이 시작되면 뚝 끊긴다
  // 하운드: 늘 숨소리가 나고, 사냥할 때는 거칠고 빨라진다
  setEntityMood(active, chasing) {
    this.entityActive = active;
    this.entityChasing = chasing;
    this.mbWanted = this.kind === 'doll' && active && !chasing;
    if (!this.houndBreath) return;
    const t = this.ctx.currentTime;
    const hound = this.kind === 'hound' && active;
    this.houndBreath.gain.setTargetAtTime(hound ? (chasing ? 0.9 : 0.45) : 0, t, 0.3);
    this.houndLfo.frequency.setTargetAtTime(chasing ? 2.4 : 0.6, t, 0.4);
  }

  // 추격 시작 신호: 인형은 킥킥거리고, 하운드는 비명을 지른다
  entityAlert() {
    if (this.kind === 'hound') this._houndScreech();
    else this.giggle(1);
  }

  // 하운드가 귀를 기울일 때 내는 딸깍거리는 소리
  entityListen() {
    if (!this.entityBus || this.kind !== 'hound') return;
    const t0 = this.ctx.currentTime;
    const n = 4 + Math.floor(Math.random() * 5);
    let t = t0;
    for (let i = 0; i < n; i++) {
      this._noiseHit(this.entityBus, t, { freq: 2600 + Math.random() * 1200, type: 'bandpass', q: 8, gain: 0.7, decay: 0.012 });
      t += 0.05 + Math.random() * 0.07;
    }
  }

  _houndScreech() {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const g = ctx.createGain();
    this._env(g, t, 0.5, 0.03, 1.0);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1700;
    bp.Q.value = 1.5;
    const d = distortion(ctx, 30);
    d.connect(bp).connect(g).connect(this.entityBus);
    for (const m of [1, 1.47, 0.52]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(700 * m, t);
      o.frequency.exponentialRampToValueAtTime(1400 * m, t + 0.25);
      o.frequency.exponentialRampToValueAtTime(520 * m, t + 1.0);
      o.connect(d);
      o.start(t);
      o.stop(t + 1.1);
    }
    this._noiseHit(this.entityBus, t, { freq: 2500, type: 'bandpass', q: 0.8, gain: 0.4, decay: 0.8 });
  }

  _musicBox() {
    if (!this.musicBox) return;
    const t = this.ctx.currentTime;
    const mb = this.mb;
    if (!this.mbWanted) {
      if (mb.on) {
        mb.on = false;
        this.musicBox.gain.cancelScheduledValues(t);
        this.musicBox.gain.setValueAtTime(0, t);
      }
      return;
    }
    if (!mb.on) {
      mb.on = true;
      mb.next = t + 0.05;
      mb.i = 0;
      this.musicBox.gain.cancelScheduledValues(t);
      this.musicBox.gain.setValueAtTime(1, t);
    }
    while (mb.next < t + 0.25) {
      const n = MELODY[mb.i % MELODY.length];
      // 한 바퀴 돌 때마다 태엽이 풀려 느려지고 낮아진다. 다 풀리면 다시 감긴다
      if (mb.i > 0 && mb.i % MELODY.length === 0) mb.wind = mb.wind > 0.72 ? mb.wind - 0.07 : 1;
      if (n !== null) {
        const f = 880 * Math.pow(2, n / 12) * (0.94 + mb.wind * 0.06) * (1 + (Math.random() - 0.5) * 0.012);
        this._mbNote(mb.next, f);
      }
      mb.next += (0.3 / mb.wind) * (1 + (Math.random() - 0.5) * 0.08);
      mb.i++;
    }
  }

  _mbNote(t, f) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    this._env(g, t, 0.22, 0.003, 1.6);
    g.connect(this.musicBox);
    for (const [mul, amp] of [
      [1, 1],
      [2, 0.1],
      [4.02, 0.25],
    ]) {
      const o = ctx.createOscillator();
      o.frequency.value = f * mul;
      const og = ctx.createGain();
      og.gain.value = amp;
      o.connect(og).connect(g);
      o.start(t);
      o.stop(t + 1.7);
    }
    this._noiseHit(this.musicBox, t, { freq: 6000, type: 'highpass', gain: 0.03, decay: 0.01 });
  }

  // 태엽 장난감 같은 킥킥거림
  giggle(loud = 1) {
    if (!this.entityBus) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + 0.02;
    const out = ctx.createGain();
    out.gain.value = 0.55 * loud;
    const f1 = ctx.createBiquadFilter();
    f1.type = 'bandpass';
    f1.frequency.value = 900;
    f1.Q.value = 4;
    const f2 = ctx.createBiquadFilter();
    f2.type = 'bandpass';
    f2.frequency.value = 2300;
    f2.Q.value = 6;
    f1.connect(out);
    f2.connect(out);
    out.connect(this.entityBus);
    const n = 5 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const t = t0 + i * 0.13;
      const p = 560 - i * 22 + Math.random() * 30;
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(p * 1.15, t);
      o.frequency.exponentialRampToValueAtTime(p * 0.8, t + 0.08);
      const g = ctx.createGain();
      this._env(g, t, 0.6, 0.01, 0.08);
      o.connect(g);
      g.connect(f1);
      g.connect(f2);
      o.start(t);
      o.stop(t + 0.12);
      this._noiseHit(f2, t, { freq: 3000, type: 'bandpass', gain: 0.25, decay: 0.06 });
    }
  }

  _env(node, t, peak, attack, decay) {
    node.gain.setValueAtTime(0, t);
    node.gain.linearRampToValueAtTime(peak, t + attack);
    node.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  _noiseHit(dest, t, { freq = 800, type = 'lowpass', q = 1, gain = 0.3, decay = 0.1, rate = 1 }) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = this.white;
    s.playbackRate.value = rate;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    this._env(g, t, gain, 0.005, decay);
    s.connect(f).connect(g).connect(dest);
    s.start(t, Math.random() * 1.5);
    s.stop(t + decay + 0.1);
  }

  _tone(dest, t, { type = 'sine', f0 = 440, f1 = null, gain = 0.2, attack = 0.005, decay = 0.2 }) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + attack + decay);
    const g = this.ctx.createGain();
    this._env(g, t, gain, attack, decay);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + attack + decay + 0.05);
  }

  footstep(surface, loud) {
    const t = this.ctx.currentTime;
    const v = 0.08 + loud * 0.22;
    if (surface === 'carpet') {
      this._noiseHit(this.master, t, { freq: 380 + Math.random() * 120, gain: v, decay: 0.09 });
    } else {
      this._noiseHit(this.master, t, { freq: 1800 + Math.random() * 400, type: 'bandpass', q: 1.5, gain: v * 0.9, decay: 0.06 });
      this._tone(this.master, t, { f0: 120 + Math.random() * 30, f1: 60, gain: v * 0.5, decay: 0.08 });
    }
  }

  entityStep(chasing) {
    if (!this.entityBus) return;
    const t = this.ctx.currentTime;
    if (this.kind === 'hound') {
      // 맨살이 카펫을 짚는 둔탁한 소리와 손톱 긁는 소리
      const v = chasing ? 0.9 : 0.4;
      this._noiseHit(this.entityBus, t, { freq: 260, gain: v, decay: chasing ? 0.09 : 0.12 });
      this._noiseHit(this.entityBus, t + 0.03, { freq: 1500, type: 'bandpass', q: 2, gain: v * 0.25, decay: 0.03 });
      return;
    }
    // 도자기 발이 바닥에 부딪히는 딱딱한 소리, 가끔 관절이 삐걱거린다
    const v = chasing ? 0.8 : 0.45;
    this._noiseHit(this.entityBus, t, { freq: 2600 + Math.random() * 600, type: 'bandpass', q: 3, gain: v, decay: 0.035 });
    this._tone(this.entityBus, t, { type: 'triangle', f0: 1100 + Math.random() * 200, f1: 700, gain: v * 0.35, decay: 0.05 });
    if (Math.random() < 0.25) {
      this._tone(this.entityBus, t + 0.05, { type: 'sawtooth', f0: 180, f1: 140, gain: 0.08, attack: 0.03, decay: 0.25 });
    }
  }

  heartbeat(dt, prox) {
    if (prox < 0.12) return;
    this.heartT -= dt;
    if (this.heartT > 0) return;
    this.heartT = 1.05 - prox * 0.65;
    const t = this.ctx.currentTime;
    const g = 0.25 + prox * 0.55;
    this._tone(this.master, t, { f0: 62, f1: 40, gain: g, decay: 0.12 });
    this._tone(this.master, t + 0.17, { f0: 55, f1: 36, gain: g * 0.7, decay: 0.14 });
  }

  stinger() {
    const t = this.ctx.currentTime;
    const ctx = this.ctx;
    const g = ctx.createGain();
    this._env(g, t, 0.35, 0.02, 1.8);
    const d = distortion(ctx, 20);
    d.connect(g).connect(this.master);
    for (const f of [311, 329, 466, 622]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * 0.7, t + 1.8);
      o.connect(d);
      o.start(t);
      o.stop(t + 2);
    }
    this._noiseHit(this.master, t, { freq: 3000, type: 'highpass', gain: 0.25, decay: 0.8 });
  }

  jumpscare() {
    const t = this.ctx.currentTime;
    const ctx = this.ctx;
    const g = ctx.createGain();
    this._env(g, t, 0.9, 0.01, 1.4);
    const d = distortion(ctx, 50);
    d.connect(g).connect(this.master);
    for (const f of [880, 932, 1245, 220]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * 0.25, t + 1.4);
      o.connect(d);
      o.start(t);
      o.stop(t + 1.5);
    }
    this._noiseHit(this.master, t, { freq: 2000, type: 'bandpass', gain: 0.8, decay: 1.2 });
    this.setStatic(1, 0.01);
  }

  setStatic(v, tc = 0.05) {
    this.static.gain.setTargetAtTime(v * 0.35, this.ctx.currentTime, tc);
  }

  setBreath(v) {
    this.breath.gain.setTargetAtTime(v * 0.08, this.ctx.currentTime, 0.4);
  }

  setHum(level) {
    this.hum.gain.setTargetAtTime((this.humBase || 0) * level, this.ctx.currentTime, 0.03);
  }

  pickup() {
    const t = this.ctx.currentTime;
    this._tone(this.master, t, { type: 'square', f0: 1320, gain: 0.06, decay: 0.06 });
    this._tone(this.master, t + 0.09, { type: 'square', f0: 1760, gain: 0.06, decay: 0.08 });
  }

  click() {
    const t = this.ctx.currentTime;
    this._noiseHit(this.master, t, { freq: 4000, type: 'highpass', gain: 0.15, decay: 0.02 });
    this._tone(this.master, t, { f0: 2400, gain: 0.05, decay: 0.02 });
  }

  unlock() {
    const t = this.ctx.currentTime;
    this._tone(this.master, t, { type: 'sawtooth', f0: 55, f1: 110, gain: 0.25, attack: 0.3, decay: 1.2 });
    this._tone(this.master, t + 0.3, { f0: 880, gain: 0.08, decay: 0.4 });
    this._tone(this.master, t + 0.5, { f0: 1175, gain: 0.08, decay: 0.6 });
  }

  // ---------- 메뉴 ----------
  uiMove() {
    const t = this.ctx.currentTime;
    this._noiseHit(this.master, t, { freq: 3200, type: 'bandpass', q: 4, gain: 0.08, decay: 0.015 });
  }

  uiSelect() {
    const t = this.ctx.currentTime;
    this._noiseHit(this.master, t, { freq: 1800, type: 'bandpass', q: 2, gain: 0.18, decay: 0.03 });
    this._tone(this.master, t, { type: 'square', f0: 220, f1: 110, gain: 0.05, decay: 0.06 });
  }

  uiBack() {
    const t = this.ctx.currentTime;
    this._noiseHit(this.master, t, { freq: 900, type: 'bandpass', q: 2, gain: 0.12, decay: 0.03 });
  }

  // VCR에 테이프를 밀어 넣는 소리: 덜컥 → 헤드가 감기며 모터가 돈다 → 재생
  tapeInsert() {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    this._tone(this.master, t, { f0: 140, f1: 60, gain: 0.35, decay: 0.12 });
    this._noiseHit(this.master, t, { freq: 1200, type: 'bandpass', q: 1.5, gain: 0.3, decay: 0.08 });
    this._noiseHit(this.master, t + 0.22, { freq: 2400, type: 'bandpass', q: 3, gain: 0.2, decay: 0.04 });
    // 모터 웅웅거림
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(40, t + 0.3);
    o.frequency.linearRampToValueAtTime(90, t + 0.9);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 320;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t + 0.3);
    g.gain.linearRampToValueAtTime(0.12, t + 0.45);
    g.gain.linearRampToValueAtTime(0.0001, t + 1.1);
    o.connect(lp).connect(g).connect(this.master);
    o.start(t + 0.3);
    o.stop(t + 1.15);
    this._noiseHit(this.master, t + 0.95, { freq: 2600, type: 'bandpass', q: 3, gain: 0.18, decay: 0.03 });
  }

  denied() {
    const t = this.ctx.currentTime;
    this._tone(this.master, t, { type: 'square', f0: 180, gain: 0.07, decay: 0.15 });
    this._tone(this.master, t + 0.18, { type: 'square', f0: 140, gain: 0.07, decay: 0.2 });
  }

  // 멀리서 들리는 정체불명의 소리. 좌우 위치를 무작위로.
  _distant() {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 2 - 1;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 700;
    const g = ctx.createGain();
    g.gain.value = 0.5 + Math.random() * 0.4;
    lp.connect(g).connect(pan).connect(this.master);
    const kind = Math.floor(Math.random() * 4);
    if (kind === 0) {
      // 노크 세 번
      for (let i = 0; i < 3; i++) this._tone(lp, t + i * 0.32, { f0: 140, f1: 70, gain: 0.5, decay: 0.12 });
    } else if (kind === 1) {
      // 쾅 닫히는 문
      this._tone(lp, t, { f0: 70, f1: 30, gain: 0.8, decay: 0.6 });
      this._noiseHit(lp, t, { freq: 500, gain: 0.6, decay: 0.4 });
    } else if (kind === 2) {
      // 누군가 뛰어가는 소리
      const n = 6 + Math.floor(Math.random() * 6);
      for (let i = 0; i < n; i++) this._noiseHit(lp, t + i * 0.27, { freq: 420, gain: 0.35, decay: 0.08 });
    } else {
      // 금속이 끌리는 소리
      this._tone(lp, t, { type: 'sawtooth', f0: 300, f1: 180, gain: 0.25, attack: 0.4, decay: 1.6 });
      lp.frequency.value = 1400;
    }
  }

  // 교실 레벨: 일그러진 학교 종소리
  _bell() {
    const t = this.ctx.currentTime;
    const notes = [659, 523, 587, 392, 392, 587, 659, 523];
    notes.forEach((f, i) => {
      this._tone(this.master, t + i * 0.55, { type: 'triangle', f0: f * 0.97, f1: f * 0.9, gain: 0.07, attack: 0.01, decay: 0.9 });
      this._tone(this.master, t + i * 0.55, { f0: f * 2.01, gain: 0.02, decay: 0.5 });
    });
  }

  ambient(dt) {
    this._musicBox();
    if (this.kind === 'doll' && this.entityActive && !this.entityChasing) {
      this.giggleT -= dt;
      if (this.giggleT <= 0) {
        this.giggleT = 25 + Math.random() * 30;
        this.giggle(0.5);
      }
    }
    this.distantT -= dt;
    if (this.distantT <= 0) {
      this.distantT = 18 + Math.random() * 30;
      this._distant();
    }
    if (this.theme && this.theme.audio.bell) {
      this.bellT -= dt;
      if (this.bellT <= 0) {
        this.bellT = 70 + Math.random() * 60;
        this._bell();
        return 'bell';
      }
    }
    return null;
  }

  async enableMic() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    const src = this.ctx.createMediaStreamSource(stream);
    const an = this.ctx.createAnalyser();
    an.fftSize = 1024;
    src.connect(an);
    this.mic = { an, buf: new Float32Array(an.fftSize) };
  }

  micLevel() {
    if (!this.mic) return 0;
    this.mic.an.getFloatTimeDomainData(this.mic.buf);
    let s = 0;
    for (const v of this.mic.buf) s += v * v;
    return Math.sqrt(s / this.mic.buf.length);
  }
}
