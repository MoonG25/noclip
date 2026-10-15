// 공간 사운드: 소리가 '어디서' 나는지와 '어떤 공간에서' 울리는지를 만든다.
// - 레벨마다 다른 잔향 (풀룸은 4초 넘게 울린다)
// - 형광등 하나하나가 제자리에서 웅웅거린다 (가까운 등 5개에 소리를 붙인다)
// - 벽 너머의 소리는 먹먹하게 (시야가 막히면 저역만 남긴다)
// - 풀룸: 물가의 찰랑임, 여과기 펌프, 천장에서 떨어지는 물방울, 물을 헤치는 소리,
//         텅 빈 수영장의 먼 소리들, 그리고 탈출로에서 흘러나오는 먹먹한 음악
import * as THREE from 'three';

const SPACES = {
  lobby: { decay: 1.3, tone: 3200, early: 0.02 },
  classrooms: { decay: 1.8, tone: 4200, early: 0.03 },
  pool: { decay: 4.4, tone: 9000, early: 0.07 },
};

const HUM_VOICES = 5;
const LAP_VOICES = 3;

// 탈출로 음악: 꿈속 같은 엘리베이터 음악 (자작). Fmaj7 → Em7 → Dm7 → Cmaj7
const CHORDS = [
  [174.61, 220.0, 261.63, 329.63],
  [164.81, 196.0, 246.94, 293.66],
  [146.83, 174.61, 220.0, 261.63],
  [130.81, 164.81, 196.0, 246.94],
];
const MELODY = [659.25, 587.33, 523.25, 493.88, 523.25, 440.0, 392.0, 493.88];
const BEAT = 60 / 66;

export class Soundscape {
  constructor(a) {
    this.a = a;
    const ctx = (this.ctx = a.ctx);
    this.level = null;
    this.space = null;
    this.reverb = null;
    this.occT = 0;
    this.emitT = 0;
    this.dripT = 1;
    this.eventT = 8;

    // 형광등 목소리: 120Hz 톱니 + 60Hz 사인 + 고음 지글거림. 등마다 아주 조금씩 음이 달라 맥놀이가 생긴다
    this.hum = [];
    for (let i = 0; i < HUM_VOICES; i++) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1300;
      const saw = a._osc('sawtooth', 120 * (1 + (Math.random() - 0.5) * 0.006));
      const sg = ctx.createGain();
      sg.gain.value = 0.22;
      saw.connect(sg).connect(lp);
      const sine = a._osc('sine', 60 * (1 + (Math.random() - 0.5) * 0.004));
      const sn = ctx.createGain();
      sn.gain.value = 0.45;
      sine.connect(sn).connect(lp);
      const buzz = a._loop(a.white);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 3200 + Math.random() * 1600;
      bp.Q.value = 7;
      const bg = ctx.createGain();
      bg.gain.value = 0.3;
      buzz.connect(bp).connect(bg).connect(lp);
      const g = ctx.createGain();
      g.gain.value = 0;
      const p = this._panner(1.6, 1.3);
      lp.connect(g).connect(p);
      this._route(p, 0.08);
      this.hum.push({ g, p, f: null, b: 0 });
    }

    // 풀룸: 물가의 찰랑임 (갈색 잡음을 느린 LFO 두 개로 출렁이게)
    this.laps = [];
    for (let i = 0; i < LAP_VOICES; i++) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 420 + Math.random() * 200;
      bp.Q.value = 0.8;
      const am = ctx.createGain();
      am.gain.value = 0.5;
      for (const [f, amt] of [
        [0.27 + Math.random() * 0.1, 0.32],
        [0.61 + Math.random() * 0.2, 0.18],
      ]) {
        const lfo = a._osc('sine', f);
        const lg = ctx.createGain();
        lg.gain.value = amt;
        lfo.connect(lg).connect(am.gain);
      }
      a._loop(a.brown).connect(bp).connect(am);
      const g = ctx.createGain();
      g.gain.value = 0;
      const p = this._panner(1.5, 1.2);
      am.connect(g).connect(p);
      this._route(p, 0.5);
      this.laps.push({ g, p });
    }

    // 여과기 펌프: 낮은 모터음 + 물이 빨려 들어가는 쉭 소리
    {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 220;
      const m = a._osc('sawtooth', 49);
      const mg = ctx.createGain();
      mg.gain.value = 0.5;
      m.connect(mg).connect(lp);
      const n = a._loop(a.white);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 900;
      bp.Q.value = 1.4;
      const ng = ctx.createGain();
      ng.gain.value = 0.25;
      n.connect(bp).connect(ng);
      const g = ctx.createGain();
      g.gain.value = 0;
      const p = this._panner(1.2, 1.4);
      lp.connect(g);
      ng.connect(g);
      g.connect(p);
      this._route(p, 0.4);
      this.pump = { g, p };
    }

    // 물을 헤치며 걷는 소리 (내 몸에서 나므로 공간 정위 없이)
    {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 800;
      bp.Q.value = 0.7;
      this.wade = ctx.createGain();
      this.wade.gain.value = 0;
      a._loop(a.white).connect(bp).connect(this.wade);
      this.wade.connect(a.master);
      this.wade.connect(a.reverbSend);
    }

    // 탈출로 음악
    {
      this.beaconIn = ctx.createGain();
      this.beaconIn.gain.value = 0.42;
      this.beaconLP = ctx.createBiquadFilter();
      this.beaconLP.type = 'lowpass';
      this.beaconLP.frequency.value = 900;
      this.beaconLP.Q.value = 0.4;
      this.beaconGate = ctx.createGain();
      this.beaconGate.gain.value = 0;
      this.beaconP = this._panner(3, 1.0);
      this.beaconIn.connect(this.beaconLP).connect(this.beaconGate).connect(this.beaconP);
      this._route(this.beaconP, 0.7);
      // 테이프가 늘어난 듯 음이 살짝 흔들린다
      this.wow = a._osc('sine', 0.55);
      this.wowAmt = ctx.createGain();
      this.wowAmt.gain.value = 9;
      this.wow.connect(this.wowAmt);
      this.music = { on: false, next: 0, beat: 0 };
    }
  }

  // ---------- 공통 ----------
  _panner(ref, roll) {
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = ref;
    p.rolloffFactor = roll;
    p.maxDistance = 400;
    return p;
  }

  // 정위된 소리를 직접음과 잔향으로 나눠 보낸다
  _route(node, send) {
    node.connect(this.a.master);
    const s = this.ctx.createGain();
    s.gain.value = send;
    node.connect(s).connect(this.a.reverbSend);
  }

  _place(p, x, y, z, tc = 0.06) {
    const t = this.ctx.currentTime;
    p.positionX.setTargetAtTime(x, t, tc);
    p.positionY.setTargetAtTime(y, t, tc);
    p.positionZ.setTargetAtTime(z, t, tc);
  }

  _impulse({ decay, tone, early }) {
    const ctx = this.ctx;
    const sr = ctx.sampleRate;
    const len = Math.floor(sr * decay);
    const buf = ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let y = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        // 높은 소리일수록 빨리 사라진다 (공기와 벽이 고음을 먹는다)
        const cutoff = tone * (1 - 0.75 * (t / decay));
        const k = 1 - Math.exp((-2 * Math.PI * cutoff) / sr);
        y += k * (Math.random() * 2 - 1 - y);
        d[i] = y * Math.exp((-6.9 * t) / decay);
      }
      // 초기 반사음: 가까운 벽에서 먼저 튕겨 오는 소리
      for (let r = 0; r < 14; r++) {
        const ti = Math.floor((0.003 + Math.random() * early) * sr);
        d[ti] += (Math.random() < 0.5 ? -1 : 1) * (0.8 - r * 0.045);
      }
    }
    return buf;
  }

  // 레벨이 바뀔 때: 잔향을 갈아 끼우고, 풀룸 전용 소리를 켜고 끈다
  setLevel(level) {
    const a = this.a;
    const ctx = this.ctx;
    this.level = level;
    const space = level.theme.audio.space || level.theme.id;
    if (space !== this.space) {
      this.space = space;
      const conv = ctx.createConvolver();
      conv.buffer = this._impulse(SPACES[space] || SPACES.lobby);
      a.reverbSend.disconnect();
      a.reverbSend.connect(conv).connect(a.master);
      const old = this.reverb;
      this.reverb = conv;
      if (old) setTimeout(() => old.disconnect(), 200);
    }
    const t = ctx.currentTime;
    const pool = !!level.theme.audio.pool;
    this.pool = pool;
    for (const l of this.laps) l.g.gain.setTargetAtTime(pool ? 0.28 : 0, t, 0.6);
    this.pump.g.gain.setTargetAtTime(0, t, 0.3);
    this.humLevel = level.theme.audio.hum;
    const beacon = level.exit.kind === 'light';
    this.music.on = beacon;
    this.beaconGate.gain.cancelScheduledValues(t);
    this.beaconGate.gain.setTargetAtTime(beacon ? 1 : 0, t, 0.8);
    this.beaconLP.frequency.cancelScheduledValues(t);
    this.beaconLP.frequency.setValueAtTime(900, t);
    if (beacon) this.music.next = t + 1;
    this.leaving = false;
    for (const h of this.hum) h.f = null;
  }

  stop() {
    const t = this.ctx.currentTime;
    this.music.on = false;
    this.beaconGate.gain.setTargetAtTime(0, t, 0.3);
    for (const h of this.hum) h.g.gain.setTargetAtTime(0, t, 0.2);
    for (const l of this.laps) l.g.gain.setTargetAtTime(0, t, 0.3);
    this.pump.g.gain.setTargetAtTime(0, t, 0.3);
    this.wade.gain.setTargetAtTime(0, t, 0.2);
  }

  // ---------- 매 프레임 ----------
  update(dt, { cam, lights, player }) {
    const lv = this.level;
    if (!lv) return;
    const t = this.ctx.currentTime;
    const near = (x, z) => {
      const w = lv.wrapDelta(x - cam.x, z - cam.z);
      return { x: cam.x + w.x, z: cam.z + w.z, d: Math.hypot(w.x, w.z) };
    };

    // 형광등: 가까운 등 다섯 개가 각자 자리에서 운다. 깜빡이면 소리도 끊긴다
    const list = lights.nearest || [];
    for (let i = 0; i < this.hum.length; i++) {
      const h = this.hum[i];
      const n = list[i];
      if (!n) {
        h.g.gain.setTargetAtTime(0, t, 0.05);
        continue;
      }
      const f = n[1];
      if (h.f !== f) {
        h.f = f;
        this._place(h.p, n[2], lv.wallH - 0.15, n[3], 0.01);
      } else this._place(h.p, n[2], lv.wallH - 0.15, n[3]);
      // 꺼졌다 켜질 때 '틱' 하고 안정기가 운다
      if (f.b > 0.5 && h.b <= 0.5) this._tink(n[2], lv.wallH - 0.1, n[3]);
      h.b = f.b;
      h.g.gain.setTargetAtTime(0.11 * (this.humLevel ?? 1) * f.b, t, 0.015);
    }

    // 벽에 가려지는지는 0.2초마다만 본다
    this.occT -= dt;
    const checkOcc = this.occT <= 0;
    if (checkOcc) this.occT = 0.2;

    // 탈출로 음악: 멀수록, 벽에 가릴수록 먹먹하다. 가까이 가면 또렷해진다
    if (this.music.on) {
      const ex = lv.exit;
      const b = near(ex.sx, ex.sz);
      this._place(this.beaconP, b.x, 1.4 + lv.groundAt(ex.x, ex.z), b.z, 0.03);
      if (checkOcc && !this.leaving) {
        const open = lv.lineOfSight(cam.x, cam.z, b.x, b.z);
        const clear = Math.max(0, 1 - b.d / 30);
        const target = open ? 700 + 4300 * clear * clear : 260 + 260 * clear;
        this.beaconLP.frequency.setTargetAtTime(target, t, 0.35);
      }
      this._scheduleMusic(t);
    }

    if (this.pool) {
      // 찰랑임: 가장 가까운 물가 세 곳으로 소리를 옮긴다
      this.emitT -= dt;
      if (this.emitT <= 0) {
        this.emitT = 0.5;
        const edges = (lv.poolEdges || [])
          .map((e) => near(e.ex, e.ez))
          .sort((p, q) => p.d - q.d)
          .slice(0, LAP_VOICES);
        edges.forEach((e, i) => this._place(this.laps[i].p, e.x, lv.groundAt(e.x, e.z) - 0.3, e.z, 0.4));
        let best = null;
        for (const d of lv.drains || []) {
          const p = near(d.x, d.z);
          if (!best || p.d < best.d) best = p;
        }
        if (best) {
          this._place(this.pump.p, best.x, 0.05, best.z, 0.3);
          this.pump.g.gain.setTargetAtTime(best.d < 20 ? 0.16 : 0, t, 0.8);
        }
      }
      // 물을 헤치는 소리
      const speed = Math.hypot(player.vel.x, player.vel.y);
      this.wade.gain.setTargetAtTime(player.inWater ? Math.min(0.12, speed * 0.05) : 0, t, 0.12);
      // 천장에서 떨어지는 물방울
      this.dripT -= dt;
      if (this.dripT <= 0) {
        this.dripT = 0.35 + Math.random() * 1.8;
        const ang = Math.random() * Math.PI * 2;
        const r = 2 + Math.random() * 9;
        const x = cam.x + Math.cos(ang) * r;
        const z = cam.z + Math.sin(ang) * r;
        this._drip(x, lv.groundAt(x, z) + 0.02, z, lv.isWaterAt(x, z), checkOcc && !lv.lineOfSight(cam.x, cam.z, x, z));
      }
      // 텅 빈 수영장의 먼 소리들
      this.eventT -= dt;
      if (this.eventT <= 0) {
        this.eventT = 9 + Math.random() * 16;
        const ang = Math.random() * Math.PI * 2;
        const r = 14 + Math.random() * 22;
        const x = cam.x + Math.cos(ang) * r;
        const z = cam.z + Math.sin(ang) * r;
        this._poolEvent(x, z, !lv.lineOfSight(cam.x, cam.z, x, z));
      }
    }
  }

  // ---------- 한 번 나는 소리들 ----------
  // 정위된 일회성 소리의 입구. 가려져 있으면 먹먹하게, 멀수록 잔향을 더 보낸다
  _spot(x, y, z, { occluded = false, send = 0.6, life = 3 } = {}) {
    const ctx = this.ctx;
    const inp = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = occluded ? 420 : 9000;
    const p = this._panner(2, 1);
    p.positionX.value = x;
    p.positionY.value = y;
    p.positionZ.value = z;
    inp.connect(lp).connect(p);
    p.connect(this.a.master);
    const s = ctx.createGain();
    s.gain.value = send;
    p.connect(s).connect(this.a.reverbSend);
    setTimeout(() => {
      p.disconnect();
      s.disconnect();
    }, life * 1000);
    return inp;
  }

  _tink(x, y, z) {
    const a = this.a;
    const out = this._spot(x, y, z, { send: 0.3, life: 1 });
    const t = this.ctx.currentTime;
    a._tone(out, t, { type: 'square', f0: 2400, f1: 1800, gain: 0.02, decay: 0.03 });
    a._noiseHit(out, t, { freq: 5000, type: 'highpass', gain: 0.05, decay: 0.02 });
  }

  _drip(x, y, z, water, occluded) {
    const a = this.a;
    const out = this._spot(x, y, z, { occluded, send: 0.9, life: 5 });
    const t = this.ctx.currentTime;
    const f = 900 + Math.random() * 1400;
    if (water) {
      // 물 위로 떨어지면 '똑' 하고 위로 휘는 소리
      a._tone(out, t, { f0: f, f1: f * 2.4, gain: 0.12, attack: 0.002, decay: 0.06 });
    } else {
      a._noiseHit(out, t, { freq: 3500, type: 'bandpass', q: 3, gain: 0.08, decay: 0.02 });
    }
  }

  _poolEvent(x, z, occluded) {
    const a = this.a;
    const out = this._spot(x, 0.6, z, { occluded, send: 1.4, life: 8 });
    const t = this.ctx.currentTime;
    const kind = Math.floor(Math.random() * 6);
    if (kind === 0) {
      // 누군가 물에 뛰어든 듯한 첨벙 소리
      a._noiseHit(out, t, { freq: 900, type: 'bandpass', q: 0.6, gain: 0.7, decay: 0.5 });
      for (let i = 0; i < 6; i++) a._tone(out, t + 0.1 + Math.random() * 0.5, { f0: 500 + Math.random() * 600, f1: 1400, gain: 0.07, decay: 0.05 });
    } else if (kind === 1) {
      // 멀리서 울리는 호루라기 (안전요원은 없다)
      const o = this.ctx.createOscillator();
      o.frequency.setValueAtTime(2900, t);
      const vib = a._osc('sine', 28);
      const vg = this.ctx.createGain();
      vg.gain.value = 60;
      vib.connect(vg).connect(o.frequency);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.09, t + 0.03);
      g.gain.setValueAtTime(0.09, t + 0.5);
      g.gain.linearRampToValueAtTime(0, t + 0.62);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.7);
      setTimeout(() => vib.stop(), 900);
    } else if (kind === 2) {
      // 공이 타일 위에서 통통 튀다 멈춘다
      let gap = 0.5;
      let tt = t;
      for (let i = 0; i < 9; i++) {
        a._tone(out, tt, { f0: 190, f1: 120, gain: 0.25 * (1 - i * 0.09), decay: 0.07 });
        a._noiseHit(out, tt, { freq: 1200, type: 'bandpass', gain: 0.08, decay: 0.03 });
        tt += gap;
        gap *= 0.78;
      }
    } else if (kind === 3) {
      // 쇠 사다리가 '깡' 하고 울린다
      for (const m of [1, 2.76, 5.4]) a._tone(out, t, { f0: 520 * m, gain: 0.08 / m, decay: 1.2 });
    } else if (kind === 4) {
      // 배관이 길게 신음한다
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(70, t);
      o.frequency.linearRampToValueAtTime(52, t + 2.5);
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 340;
      bp.Q.value = 6;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.25, t + 0.6);
      g.gain.linearRampToValueAtTime(0, t + 2.6);
      o.connect(bp).connect(g).connect(out);
      o.start(t);
      o.stop(t + 2.7);
    } else {
      // 젖은 맨발로 걷는 소리. 아무도 없는데
      for (let i = 0; i < 5; i++) a._noiseHit(out, t + i * 0.55, { freq: 1100, type: 'bandpass', q: 1.5, gain: 0.12, decay: 0.05 });
    }
  }

  // 탈출로 음악을 0.3초 앞까지 미리 예약한다
  _scheduleMusic(now) {
    const m = this.music;
    if (m.next < now) m.next = now + 0.05;
    while (m.next < now + 0.3) {
      const bar = Math.floor(m.beat / 4);
      const chord = CHORDS[bar % CHORDS.length];
      const step = m.beat % 4;
      // 박마다 화음을 한 음씩 짚고, 첫 박에는 화음 전체를 깔고 선율을 얹는다
      this._ep(m.next, chord[step] * 2, 0.2, 1.6);
      if (step === 0) {
        for (const f of chord) this._ep(m.next, f, 0.09, BEAT * 4);
        this._ep(m.next, MELODY[bar % MELODY.length], 0.16, BEAT * 3);
      }
      m.next += BEAT;
      m.beat++;
    }
  }

  // 전자 피아노 비슷한 음 하나: 사인 + 금방 사라지는 배음 + 약한 트레몰로
  _ep(t, f, gain, len) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    g.connect(this.beaconIn);
    for (const [mul, amp, dec] of [
      [1, 1, len],
      [2, 0.35, 0.4],
      [3.01, 0.12, 0.2],
    ]) {
      const o = ctx.createOscillator();
      o.frequency.value = f * mul;
      this.wowAmt.connect(o.detune);
      const og = ctx.createGain();
      og.gain.setValueAtTime(amp, t);
      og.gain.exponentialRampToValueAtTime(0.0001, t + dec);
      o.connect(og).connect(g);
      o.start(t);
      o.stop(t + len + 0.05);
    }
  }

  // 빛 속으로 걸어 들어갈 때: 음악이 물 밖으로 나온 듯 또렷해지고 하얗게 번진다
  enterLight() {
    const a = this.a;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    this.leaving = true;
    this.beaconLP.frequency.cancelScheduledValues(t);
    this.beaconLP.frequency.setTargetAtTime(9000, t, 0.4);
    this.beaconIn.gain.setTargetAtTime(0.7, t, 0.6);
    this.beaconGate.gain.setTargetAtTime(0, t + 2.2, 0.5);
    for (const l of this.laps) l.g.gain.setTargetAtTime(0, t, 0.8);
    for (const h of this.hum) h.g.gain.setTargetAtTime(0, t, 0.8);
    // 위로 번지는 반짝임
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.12, t + 1.6);
    g.gain.linearRampToValueAtTime(0, t + 3.2);
    g.connect(a.master);
    g.connect(a.reverbSend);
    for (const f of [523.25, 659.25, 783.99, 1046.5]) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * 2, t + 3.2);
      o.connect(g);
      o.start(t);
      o.stop(t + 3.3);
    }
    setTimeout(() => this.beaconIn.gain.setValueAtTime(0.42, ctx.currentTime), 4000);
  }
}
