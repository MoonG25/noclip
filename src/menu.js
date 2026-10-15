// 메뉴: 시작 화면 → 테이프 선택 → INSERT TAPE? → 재생. 설정은 탭 패널.
// The Classrooms의 메뉴 문법을 따른다: 캠코더 OSD, 흰 붓질 선택 표시, 찢어진 검은 띠 확인창.
import { formatTime } from './progress.js';

const $ = (id) => document.getElementById(id);
const START = new Date(1996, 9, 15, 3, 14, 0).getTime();
const pad = (n) => String(n).padStart(2, '0');

// opts: levels, progress(), defaultTape, test, onStart(i), onFirstInput(), sound(name), setGlitch(v, hold)
export function createMenu(opts) {
  const screens = { title: $('screen-title'), tapes: $('screen-tapes'), settings: $('screen-settings') };
  const osd = $('osd');
  const dlg = $('dlg-insert');
  const fx = $('insert-fx');
  const bootAt = performance.now();
  const focus = { title: 0, tapes: 0, tabs: 0, yn: 1 };
  let current = null;
  let open = false;
  let dialog = false;
  let busy = false;
  let pending = 0;
  let openedAt = bootAt;
  let noise = [];
  let noiseT = 0;

  const lists = {
    title: () => [...document.querySelectorAll('[data-list="title"] > .mi:not(.hidden)')],
    tapes: () => [...document.querySelectorAll('#tapes-row > .tape')],
    tabs: () => [...document.querySelectorAll('[data-list="tabs"] > .tab')],
    yn: () => [...document.querySelectorAll('[data-list="yn"] > .mi-yn')],
  };

  function setFocus(list, i, silent = false) {
    const els = lists[list]();
    if (!els.length) return;
    i = (i + els.length) % els.length;
    if (i !== focus[list] && !silent) opts.sound('move');
    focus[list] = i;
    if (list === 'tabs') {
      els.forEach((el, k) => el.classList.toggle('active', k === i));
      const tab = els[i].dataset.tab;
      for (const b of document.querySelectorAll('.tab-body')) b.classList.toggle('hidden', b.dataset.body !== tab);
    } else els.forEach((el, k) => el.classList.toggle('focus', k === i));
  }

  function mode(text) {
    $('osd-mode').textContent = text;
  }

  // ---------- 테이프 목록 ----------
  function renderTapes() {
    const p = opts.progress();
    const row = $('tapes-row');
    row.innerHTML = '';
    const list = opts.levels.map((l, i) => ({ i, l }));
    list.push({ i: opts.levels.length, teaser: true }); // 아직 없는 테이프 한 장
    for (const t of list) {
      const locked = t.teaser || t.i > p.unlocked;
      const btn = document.createElement('button');
      btn.className = 'tape' + (locked ? ' locked' : '');
      btn.dataset.index = t.i;
      let cover, label, meta, hover;
      if (locked) {
        cover = '<canvas width="96" height="128"></canvas><div class="nosig">NO SIGNAL</div>';
        label = '???';
        meta = t.teaser ? '<b>LEVEL ?</b> · 녹화되지 않음' : `<b>${t.l.code}</b> · 잠김`;
        hover = t.teaser
          ? '<p>아직 아무도 돌아오지 못한 테이프.</p>'
          : '<p>이전 테이프를 끝까지 녹화하면 재생할 수 있습니다.</p>';
      } else {
        const tp = t.l.tape;
        cover = `<img src="${tp.cover}" alt=""><span class="rec"><i>●</i> REC</span>`;
        label = tp.label;
        meta = `<b>${t.l.code}</b> · ${t.l.subtitle}`;
        const best = p.best[t.i]
          ? `최고 기록 ${formatTime(p.best[t.i])} · 클리어 ${p.clears[t.i]}회`
          : '아직 끝까지 녹화하지 못했다';
        // 직접 겪기 전에는 엔티티 정보를 검게 지운다. 글자 수만 막대 길이로 남긴다
        const threat = p.seen[t.i]
          ? `<p class="threat">⚠ ${tp.threat}</p>`
          : `<p class="threat redacted" title="기록 손상">⚠ ${tp.threat
              .split(/\s+/)
              .map((w) => `<span class="bar" style="width:${(w.length * 0.95).toFixed(2)}em"></span>`)
              .join('')}</p>`;
        hover = `<p>${tp.desc}</p>${threat}<p class="best">${best}</p>`;
      }
      btn.innerHTML =
        `<div class="sleeve"><div class="sleeve-top"><span>NOCLIP · T-120</span><span>TAPE ${t.i}</span></div>` +
        `<div class="cover">${cover}</div><div class="label"><span class="hand">${label}</span></div>` +
        `<div class="meta">${meta}</div></div><div class="hover">${hover}</div>`;
      row.appendChild(btn);
    }
    noise = [...row.querySelectorAll('canvas')];
    bindPointer('tapes');
  }

  function drawNoise(now) {
    if (now - noiseT < 66) return;
    noiseT = now;
    for (const c of noise) {
      const x = c.getContext('2d');
      const img = x.createImageData(c.width, c.height);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = Math.random() * 200;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
      x.putImageData(img, 0, 0);
    }
  }

  // ---------- 화면 전환 ----------
  function show(name) {
    open = true;
    busy = false;
    for (const s of document.querySelectorAll('.screen')) s.classList.add('hidden');
    screens[name].classList.remove('hidden');
    osd.classList.remove('hidden');
    if (current !== name) {
      openedAt = performance.now();
      opts.setGlitch(0.35);
    }
    current = name;
    if (name === 'title') {
      mode('PLAY ▶');
      const p = opts.progress();
      const cont = $('mi-continue');
      cont.classList.toggle('hidden', p.unlocked < 1);
      $('mi-continue-tag').textContent = `CONTINUE · TAPE ${p.unlocked}`;
      setFocus('title', 0, true);
    } else if (name === 'tapes') {
      mode('STOP ■');
      renderTapes();
      setFocus('tapes', opts.progress().unlocked, true);
    } else {
      mode('SETUP');
      setFocus('tabs', 0, true);
    }
  }

  function hide() {
    open = false;
    dialog = false;
    current = null;
    osd.classList.add('hidden');
    dlg.classList.add('hidden');
    for (const s of Object.values(screens)) s.classList.add('hidden');
    opts.setGlitch(0, 0);
  }

  function back() {
    if (dialog) return closeDialog();
    if (current === 'tapes' || current === 'settings') {
      opts.sound('back');
      show('title');
    }
  }

  // ---------- INSERT TAPE? ----------
  function tear(el) {
    const pts = [];
    const n = 64;
    for (let i = 0; i <= n; i++) pts.push(`${(i / n) * 100}% ${Math.random() * 9}%`);
    for (let i = n; i >= 0; i--) pts.push(`${(i / n) * 100}% ${100 - Math.random() * 9}%`);
    el.style.clipPath = `polygon(${pts.join(',')})`;
  }

  function askInsert(i) {
    if (opts.test) return opts.onStart(i);
    pending = i;
    const l = opts.levels[i];
    $('dlg-tape').textContent = `TAPE ${i} · ${l.name} · ${l.subtitle}`;
    tear(dlg.querySelector('.band'));
    dlg.classList.remove('hidden');
    dialog = true;
    mode('STOP ■');
    setFocus('yn', 1, true);
    opts.sound('select');
    opts.setGlitch(0.5, 0.42);
  }

  function closeDialog() {
    dialog = false;
    dlg.classList.add('hidden');
    opts.sound('back');
    opts.setGlitch(0.2, 0);
    mode(current === 'title' ? 'PLAY ▶' : 'STOP ■');
  }

  function insert() {
    dialog = false;
    busy = true;
    dlg.classList.add('hidden');
    fx.classList.remove('hidden');
    opts.sound('insert');
    opts.setGlitch(1, 0);
    setTimeout(() => {
      fx.classList.add('hidden');
      busy = false;
      opts.onStart(pending);
    }, 1150);
  }

  // ---------- 실행 ----------
  function activate(list) {
    if (list === 'yn') {
      return lists.yn()[focus.yn].dataset.yn === 'yes' ? insert() : closeDialog();
    }
    if (list === 'title') {
      const action = lists.title()[focus.title].dataset.action;
      if (action === 'continue') askInsert(opts.progress().unlocked);
      else if (action === 'new') askInsert(opts.defaultTape);
      else {
        opts.sound('select');
        show(action);
      }
      return;
    }
    if (list === 'tapes') {
      const el = lists.tapes()[focus.tapes];
      if (el.classList.contains('locked')) {
        opts.sound('denied');
        el.classList.remove('shake');
        void el.offsetWidth;
        el.classList.add('shake');
        return;
      }
      askInsert(Number(el.dataset.index));
    }
  }

  function activeList() {
    if (dialog) return 'yn';
    if (current === 'settings') return 'tabs';
    return current;
  }

  function bindTitle(el) {
    el.addEventListener('mouseenter', () => {
      if (open && !busy && activeList() === 'title') setFocus('title', lists.title().indexOf(el));
    });
    el.addEventListener('click', (e) => {
      if (e.detail === 0 || !open || busy || activeList() !== 'title') return;
      setFocus('title', lists.title().indexOf(el), true);
      activate('title');
    });
  }

  // 순번은 이벤트가 일어난 순간에 다시 센다. '이어서 녹화'처럼 나중에 나타나는 항목이 있어
  // 연결할 때의 순번을 고정해 두면 한 칸씩 밀린다
  function bindPointer(list) {
    lists[list]().forEach((el) => {
      el.addEventListener('mouseenter', () => {
        if (open && !busy && activeList() === list) setFocus(list, lists[list]().indexOf(el));
      });
      el.addEventListener('click', (e) => {
        if (e.detail === 0) return; // 키보드가 만든 클릭은 keydown에서 이미 처리했다
        if (!open || busy || activeList() !== list) return;
        setFocus(list, lists[list]().indexOf(el), true);
        if (list === 'tabs') opts.sound('move');
        else activate(list);
      });
    });
  }

  // ---------- 입력 ----------
  addEventListener(
    'pointerdown',
    () => {
      if (open) opts.onFirstInput();
    },
    true,
  );
  addEventListener('keydown', (e) => {
    if (!open || busy) return;
    opts.onFirstInput();
    if (e.target instanceof HTMLInputElement && /Arrow/.test(e.key)) return; // 슬라이더 조작은 그대로
    const list = activeList();
    const k = e.code;
    const prev = ['ArrowUp', 'KeyW', 'ArrowLeft', 'KeyA'];
    const next = ['ArrowDown', 'KeyS', 'ArrowRight', 'KeyD'];
    const vertical = list === 'title';
    if (list === 'tabs') {
      if (k === 'KeyQ') setFocus('tabs', focus.tabs - 1);
      else if (k === 'KeyE') setFocus('tabs', focus.tabs + 1);
      else if (k === 'Escape' || k === 'Backspace') back();
      else return;
      e.preventDefault();
      return;
    }
    if ((vertical ? prev.slice(0, 2) : prev.slice(2)).includes(k)) setFocus(list, focus[list] - 1);
    else if ((vertical ? next.slice(0, 2) : next.slice(2)).includes(k)) setFocus(list, focus[list] + 1);
    else if (k === 'Enter' || k === 'Space' || k === 'KeyE') activate(list);
    else if (k === 'Escape' || k === 'Backspace') back();
    else return;
    e.preventDefault();
  });

  for (const el of document.querySelectorAll('[data-list="title"] > .mi')) bindTitle(el);
  bindPointer('tabs');
  bindPointer('yn');

  // OSD 시계와 테이프 카운터, 잠긴 테이프의 노이즈
  (function tick(now) {
    requestAnimationFrame(tick);
    if (!open) return;
    const d = new Date(START + (now - bootAt));
    const h = d.getHours();
    const t = `${h < 12 ? 'AM' : 'PM'} ${h % 12 || 12}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    const el = $('osd-time');
    if (el.textContent !== t) el.textContent = t;
    const s = Math.floor((now - openedAt) / 1000);
    const c = `${Math.floor(s / 3600)}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
    const ce = $('osd-counter');
    if (ce.textContent !== c) ce.textContent = c;
    if (current === 'tapes') drawNoise(now);
  })(performance.now());

  return {
    show,
    hide,
    get open() {
      return open;
    },
  };
}
