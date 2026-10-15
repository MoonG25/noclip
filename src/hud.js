const $ = (id) => document.getElementById(id);
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
// 녹화 시작 시각: 1996-10-15 03:14:00
const START = new Date(1996, 9, 15, 3, 14, 0).getTime();

function pad(n) {
  return String(n).padStart(2, '0');
}

export class HUD {
  constructor() {
    this.root = $('hud');
    this.el = {
      counter: $('counter'),
      clock: $('clock'),
      date: $('date'),
      batFill: $('battery-fill'),
      batPct: $('battery-pct'),
      bat: document.querySelector('.battery'),
      signal: [...document.querySelectorAll('#signal i')],
      stamina: $('stamina'),
      staminaFill: $('stamina-fill'),
      level: $('level-code'),
      objective: $('objective'),
      prompt: $('prompt'),
      message: $('message'),
      segs: [...document.querySelectorAll('#audio-meter i')],
      micTag: $('mic-tag'),
      note: $('note'),
      noteText: $('note-text'),
      tc: $('titlecard'),
    };
    this.msgT = 0;
    this._last = {};
  }

  show(v) {
    this.root.classList.toggle('hidden', !v);
  }

  _set(key, el, text) {
    if (this._last[key] === text) return;
    this._last[key] = text;
    el.textContent = text;
  }

  update(dt, s) {
    const e = this.el;
    const sec = Math.floor(s.elapsed);
    this._set('counter', e.counter, `${Math.floor(sec / 3600)}:${pad(Math.floor(sec / 60) % 60)}:${pad(sec % 60)}`);
    const d = new Date(START + s.elapsed * 1000);
    const h = d.getHours();
    this._set('clock', e.clock, `${h < 12 ? 'AM' : 'PM'} ${h % 12 || 12}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`);
    this._set('date', e.date, `${MONTHS[d.getMonth()]}. ${d.getDate()} ${d.getFullYear()}`);

    const b = Math.ceil(s.battery);
    e.batFill.style.width = `${b}%`;
    this._set('bat', e.batPct, `${b}%`);
    e.bat.classList.toggle('low', b < 20);
    e.bat.classList.toggle('off', !s.flashOn);

    const bars = Math.ceil(s.sanity * 5);
    e.signal.forEach((el, i) => el.classList.toggle('off', i >= bars));

    e.staminaFill.style.width = `${s.stamina * 100}%`;
    e.stamina.style.opacity = s.stamina < 0.99 ? 1 : 0;
    e.stamina.classList.toggle('tired', s.exhausted);

    this._set('level', e.level, s.levelCode);
    this._set('obj', e.objective, s.objective);

    const lit = Math.ceil(Math.min(1, s.noise) * e.segs.length - 0.001);
    if (lit !== this._lit) {
      this._lit = lit;
      e.segs.forEach((el, i) => el.classList.toggle('on', i < lit));
    }
    e.micTag.classList.toggle('hidden', !s.micOn);

    if (this.msgT > 0) {
      this.msgT -= dt;
      if (this.msgT <= 0) e.message.style.opacity = 0;
    }
  }

  prompt(text) {
    this._set('prompt', this.el.prompt, text || '');
  }

  message(text, dur = 3.5) {
    this.el.message.textContent = text;
    this.el.message.style.opacity = 1;
    this.msgT = dur;
  }

  openNote(text) {
    this.el.noteText.textContent = text;
    this.el.note.classList.remove('hidden');
  }

  closeNote() {
    this.el.note.classList.add('hidden');
  }

  titleCard(code, name, hint) {
    const tc = this.el.tc;
    $('tc-code').textContent = code;
    $('tc-name').textContent = name;
    $('tc-hint').textContent = hint || '';
    tc.classList.add('hidden');
    void tc.offsetWidth; // 애니메이션 재시작
    tc.classList.remove('hidden');
    clearTimeout(this._tcTimer);
    this._tcTimer = setTimeout(() => tc.classList.add('hidden'), 3300);
  }
}
