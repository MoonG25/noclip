import * as THREE from 'three';
import { LEVELS } from './themes.js';
import { Level, WALL } from './level.js';
import { Player } from './player.js';
import { Hound } from './entities/hound.js';
import { Doll } from './entities/doll.js';
import { LightRig } from './lights.js';
import { AudioEngine } from './audio.js';
import { VHS } from './vhs.js';
import { HUD } from './hud.js';
import { makeTextures } from './textures.js';
import { randomSeed } from './rng.js';
import { createMenu } from './menu.js';
import { loadProgress, recordClear } from './progress.js';

const params = new URLSearchParams(location.search);
const TEST = params.has('test'); // 자동 테스트용: 포인터 락 없이 동작
const $ = (id) => document.getElementById(id);

const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 80);
scene.add(camera);

const tex = makeTextures(renderer);
const vhs = new VHS(renderer);
const lights = new LightRig(scene);
const player = new Player(camera);
// 레벨마다 다른 엔티티. 테마의 entity.kind 로 고른다
const entities = { hound: new Hound(tex), doll: new Doll(tex) };
for (const e of Object.values(entities)) scene.add(e.mesh);
let entity = entities.hound;
const hud = new HUD();
let audio = null;

const game = {
  state: 'title',
  time: 0,
  levelIndex: 0,
  level: null,
  have: 0,
  elapsed: 0,
  deaths: 0,
  notes: new Set(),
  glitch: 0,
  fade: 1,
  caughtT: 0,
  transT: 0,
  sanityT: 0,
  micT: 0,
  noise: 0,
  levelT: 0,
  menuGlitch: 0,
  target: null,
};

// 설정: 감도·음량·밝기. 타이틀과 일시정지 화면의 슬라이더가 같은 값을 공유한다
const SETTINGS_KEY = 'noclip.settings';
const settings = { sens: 1, volume: 0.8, bright: 1 };
try {
  const old = Number(localStorage.getItem('noclip.sens'));
  if (old) settings.sens = old;
  Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'));
} catch {}

function applySettings() {
  if (audio) audio.setVolume(settings.volume);
  if (game.level) vhs.uniforms.exposure.value = game.level.theme.exposure * settings.bright;
  for (const el of document.querySelectorAll('[data-setting]')) el.value = settings[el.dataset.setting];
}

const ITEM_LABEL = {
  fuse: '퓨즈 줍기',
  key: '열쇠 줍기',
  battery: '건전지 줍기',
  water: '아몬드 워터 마시기',
  note: '쪽지 읽기',
};
const DXY = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

// ---------- 레벨 ----------
function loadLevel(index, seed) {
  if (game.level) {
    scene.remove(game.level.group);
    game.level.dispose();
  }
  const theme = LEVELS[index];
  const level = new Level(theme, seed, tex);
  Object.assign(game, { level, levelIndex: index, seed, have: 0 });
  scene.add(level.group);
  scene.fog = new THREE.Fog(theme.fog.color, theme.fog.near, theme.fog.far);
  scene.background = new THREE.Color(theme.fog.color);
  lights.setLevel(level);
  vhs.uniforms.exposure.value = theme.exposure * settings.bright;

  const [sx, sy] = level.spawnCell;
  const c = level.center(sx, sy);
  let yaw = 0;
  for (let d = 0; d < 4; d++) {
    if (level.getEdge(sx, sy, d) !== WALL) {
      yaw = Math.atan2(-DXY[d][0], -DXY[d][1]);
      break;
    }
  }
  player.reset(c.x, c.z, yaw);
  player.flashOn = false;
  for (const e of Object.values(entities)) e.hide();
  entity = entities[theme.entity.kind];
  entity.reset(level, theme);
  if (audio) {
    audio.setTheme(theme);
    audio.setEntityKind(theme.entity.kind);
    audio.attachEntity(entity.audioAnchor);
  }
  updateObjective();
  if (TEST) window.__noclip.level = level;
}

function updateObjective() {
  const lv = game.level;
  const g = lv.theme.goal;
  game.objective = lv.exit.unlocked ? '비상구로 가라' : `${g.name} ${game.have}/${lv.goalTotal}`;
}

// ---------- 상태 ----------
function showScreen(id) {
  for (const s of document.querySelectorAll('.screen')) s.classList.toggle('hidden', s.id !== id);
}

function setState(s) {
  game.state = s;
  const inGame = s === 'playing' || s === 'reading' || s === 'caught' || s === 'transition';
  hud.show(inGame);
  if (inGame) showScreen(null);
  if (s !== 'reading') hud.closeNote();
  player.frozen = s !== 'playing';
}

function lockPointer() {
  if (TEST) return;
  try {
    const p = canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => {});
  } catch {}
}

function unlockPointer() {
  if (document.pointerLockElement) document.exitPointerLock();
}

function ensureAudio() {
  if (!audio) {
    audio = new AudioEngine(camera);
    audio.setEntityKind(entity.cfg.kind);
    audio.attachEntity(entity.audioAnchor);
    audio.setVolume(settings.volume);
    if (game.level) audio.setTheme(game.level.theme);
  }
  audio.resume();
}

const progress = loadProgress();

function startGame(index = defaultTape()) {
  ensureAudio();
  menu.hide();
  game.elapsed = 0;
  game.deaths = 0;
  game.notes.clear();
  player.battery = 100;
  const seed = params.has('seed') ? Number(params.get('seed')) : randomSeed();
  loadLevel(Math.min(LEVELS.length - 1, index), seed);
  beginLevel();
  lockPointer();
}

function defaultTape() {
  return Math.min(LEVELS.length - 1, Number(params.get('level')) || 0);
}

function beginLevel() {
  const t = game.level.theme;
  game.levelT = 0;
  setState('playing');
  game.fade = 0;
  game.glitch = 0.8;
  hud.titleCard(t.code, `${t.subtitle} · ${t.name}`, t.hint);
  setTimeout(() => {
    if (game.state === 'playing' && game.levelIndex === 0) hud.message('벽 너머로 빠졌다. 여기서 나가야 한다.', 4);
  }, 3600);
}

function pause() {
  if (game.state !== 'playing' && game.state !== 'reading') return;
  game.resumeState = game.state;
  game.state = 'paused';
  player.frozen = true;
  player.keys = {};
  showScreen('screen-pause');
  if (audio) audio.ctx.suspend();
}

function resume() {
  if (game.state !== 'paused') return;
  if (audio) audio.resume();
  showScreen(null);
  setState(game.resumeState || 'playing');
  if (game.state === 'reading') hud.openNote(game.readingText);
  lockPointer();
}

function toTitle() {
  unlockPointer();
  if (audio) {
    audio.resume();
    audio.setHum(0);
    audio.setStatic(0);
    audio.setEntityMood(false, false);
    audio.setBreath(0);
  }
  loadLevel(0, 1996);
  setState('title');
  menu.show('title');
}

// ---------- 상호작용 ----------
const _fwd = new THREE.Vector3();
function findTarget() {
  const lv = game.level;
  const cp = camera.position;
  player.forward(_fwd);
  let best = null;
  let bestScore = Infinity;
  for (const it of lv.items) {
    if (it.taken) continue;
    const dx = it.x - cp.x;
    const dy = it.mesh.position.y - cp.y;
    const dz = it.z - cp.z;
    const d = Math.hypot(dx, dy, dz);
    if (d > 2.4) continue;
    const dot = (dx * _fwd.x + dy * _fwd.y + dz * _fwd.z) / d;
    if (dot < 0.82 && d > 1.1) continue;
    const score = d * (2 - dot);
    if (score < bestScore) {
      bestScore = score;
      best = { kind: 'item', it };
    }
  }
  const ex = lv.exit;
  const de = Math.hypot(ex.x - cp.x, ex.z - cp.z);
  if (de < 1.7 && de < bestScore) best = { kind: 'exit' };
  return best;
}

function promptFor(t) {
  if (!t) return '';
  if (t.kind === 'exit') {
    const lv = game.level;
    if (lv.exit.unlocked) return '[E] 비상구 열기';
    return `잠겨 있다 — ${lv.theme.goal.name} ${game.have}/${lv.goalTotal}`;
  }
  return `[E] ${ITEM_LABEL[t.it.type]}`;
}

function interact() {
  if (game.state === 'reading') {
    setState('playing');
    return;
  }
  if (game.state !== 'playing') return;
  const t = game.target;
  if (!t) return;
  const lv = game.level;
  if (t.kind === 'exit') {
    if (lv.exit.unlocked) exitLevel();
    else audio.denied();
    return;
  }
  const it = t.it;
  if (it.type === 'note') {
    game.notes.add(it.text);
    game.readingText = it.text;
    hud.openNote(it.text);
    setState('reading');
    audio.click();
    return;
  }
  it.taken = true;
  it.mesh.visible = false;
  audio.pickup();
  game.glitch = Math.max(game.glitch, 0.15);
  if (it.type === lv.theme.goal.item) {
    game.have++;
    if (game.have >= lv.goalTotal && !lv.exit.unlocked) {
      lv.exit.unlocked = true;
      lv.exit.obj.setUnlocked(true);
      audio.unlock();
      hud.message('어딘가에서 전원이 들어오는 소리가 났다.\n비상구로 가라.', 5);
    } else hud.message(`${lv.theme.goal.name} 획득 (${game.have}/${lv.goalTotal})`);
    updateObjective();
  } else if (it.type === 'battery') {
    player.battery = Math.min(100, player.battery + 45);
    hud.message('건전지를 갈아 끼웠다');
  } else if (it.type === 'water') {
    player.sanity = Math.min(1, player.sanity + 0.45);
    player.stamina = 1;
    player.exhausted = false;
    hud.message('아몬드 워터. 머리가 조금 맑아진다');
  }
}

function exitLevel() {
  recordClear(progress, game.levelIndex, game.levelT, LEVELS.length);
  setState('transition');
  game.transT = 0;
  audio.setStatic(0.5, 0.4);
  player.keys = {};
}

function caught() {
  setState('caught');
  game.caughtT = 0;
  game.deaths++;
  audio.jumpscare();
  player.keys = {};
}

// ---------- 루프 ----------
function update(dt) {
  const s = game.state;
  const lv = game.level;
  game.glitch = Math.max(0, game.glitch - dt * 1.4);
  vhs.uniforms.time.value = game.time;

  if (s === 'title') {
    // 타이틀 뒤로 레벨 0에서 가장 넓은 방을 천천히 둘러본다
    if (!game.titleView || game.titleView.level !== lv) {
      let best = null;
      for (const r of lv.rooms) if (!best || r.w * r.h > best.w * best.h) best = r;
      const c = best ? { x: (best.x0 + best.w / 2) * lv.S, z: (best.y0 + best.h / 2) * lv.S } : lv.center(...lv.spawnCell);
      game.titleView = { level: lv, x: c.x, z: c.z };
    }
    camera.position.set(game.titleView.x, 1.55, game.titleView.z);
    camera.rotation.set(Math.sin(game.time * 0.1) * 0.04, game.time * 0.045 + 0.6, 0);
    lights.update(dt, game.time, camera.position, entity);
    vhs.uniforms.fade.value = 0.62;
    vhs.uniforms.stress.value = 0;
    vhs.uniforms.glitch.value = Math.max(game.glitch, game.menuGlitch);
    return;
  }
  if (s === 'paused' || s === 'dead' || s === 'ending') return;

  if (s === 'playing' || s === 'reading' || s === 'transition') game.elapsed += dt;
  if (s === 'playing' || s === 'reading') game.levelT += dt;
  game.fade = Math.min(1, game.fade + dt * 0.8);

  const { steps } = player.update(dt, lv, game.time);
  // 오디오 레벨 미터: 발소리·마이크 소리가 튀었다가 서서히 가라앉는다
  game.noise = Math.max(0, game.noise - dt * 1.2);
  for (const loud of steps) {
    game.noise = Math.max(game.noise, loud);
    audio.footstep(lv.theme.surface, loud);
    entity.hear(player.pos.x, player.pos.z, loud * 17, lv);
  }

  player.lit = lights.update(dt, game.time, camera.position, entity);

  if (s === 'caught') updateCaught(dt);
  else {
    const ev = entity.update(dt, { level: lv, player, time: game.time, camera, glitch: game.glitch });
    for (const e of ev) {
      if (e === 'awake') {
        lights.flash(1.4);
        audio.stinger();
        game.glitch = 0.7;
        hud.message(entity.awakeMessage, 4);
      } else if (e === 'chase') {
        audio.stinger();
        audio.entityAlert();
        game.glitch = 0.9;
      } else if (e === 'listen') audio.entityListen();
      else if (e === 'step') audio.entityStep(entity.chasing);
      else if (e === 'caught' && s !== 'transition') caught();
    }
  }
  lv.update(game.time);

  // 정신력: 그것이 가까이 있거나 어둠 속에 있으면 깎인다
  const prox = entity.proximity();
  const dark = player.lit < 0.25 && !player.flashOn;
  player.sanity -= dt * (prox * 0.045 + (dark ? 0.007 : 0));
  if (prox === 0 && !dark) player.sanity += dt * 0.004;
  player.sanity = Math.max(0, Math.min(1, player.sanity));
  if (player.sanity < 0.15 && s === 'playing') {
    game.sanityT -= dt;
    if (game.sanityT <= 0) {
      game.sanityT = 12;
      entity.hear(player.pos.x, player.pos.z, 999, lv);
      game.glitch = 0.5;
      hud.message('그것이 당신을 느낀다');
    }
  }
  if (player.sanity < 0.4 && Math.random() < dt * 0.15) game.glitch = Math.max(game.glitch, 0.35);

  // 마이크
  let mic = null;
  if (audio.mic) {
    mic = Math.max(0, Math.min(1, (audio.micLevel() - 0.015) / 0.12));
    game.noise = Math.max(game.noise, mic);
    game.micT -= dt;
    if (mic > 0.35 && game.micT <= 0 && s === 'playing') {
      game.micT = 0.4;
      entity.hear(player.pos.x, player.pos.z, 5 + mic * 20, lv);
    }
  }

  if (s === 'playing') {
    game.target = findTarget();
    hud.prompt(promptFor(game.target));
  } else hud.prompt('');

  if (s === 'transition') {
    game.transT += dt;
    game.fade = Math.max(0, 1 - game.transT / 1.4);
    if (game.transT > 1.8) {
      const next = game.levelIndex + 1;
      if (next < LEVELS.length) {
        loadLevel(next, randomSeed());
        audio.setStatic(0, 0.3);
        beginLevel();
      } else endGame();
    }
  }

  // 오디오 · 화면 효과
  const stress = prox * 0.85 + (1 - player.sanity) * 0.5;
  audio.setHum(lights.localLight);
  if (s !== 'caught') audio.setStatic(game.glitch * 0.5 + prox * 0.06 + (s === 'transition' ? 0.4 : 0));
  audio.heartbeat(dt, prox);
  audio.setBreath(player.exhausted ? 1 : player.sprinting ? 0.4 : 0);
  audio.setEntityMood(entity.active, entity.chasing);
  if (audio.ambient(dt) === 'bell') hud.message('…종이 울린다', 3);

  vhs.uniforms.glitch.value = Math.min(1, game.glitch);
  vhs.uniforms.stress.value = Math.min(1, stress);
  vhs.uniforms.fade.value = game.fade;

  hud.update(dt, {
    elapsed: game.elapsed,
    battery: player.battery,
    flashOn: player.flashOn,
    sanity: player.sanity,
    stamina: player.stamina,
    exhausted: player.exhausted,
    levelCode: lv.theme.code,
    objective: game.objective,
    noise: game.noise,
    micOn: !!audio.mic,
  });
}

const _head = new THREE.Vector3();
function updateCaught(dt) {
  game.caughtT += dt;
  // 처음엔 얼굴이 또렷하게 보이고, 마지막에 테이프가 완전히 찢어진다
  game.glitch = game.caughtT < 0.9 ? 0.3 : 1;
  // 그것이 덮쳐 오는 자세를 잡고, 고개가 강제로 그것을 향한다
  entity.yaw = Math.atan2(player.pos.x - entity.pos.x, player.pos.z - entity.pos.z);
  entity.mesh.rotation.y = entity.yaw;
  entity.jumpscarePose();
  entity.mesh.updateMatrixWorld(true);
  entity.head.getWorldPosition(_head);
  const dx = _head.x - camera.position.x;
  const dy = _head.y - camera.position.y;
  const dz = _head.z - camera.position.z;
  const yaw = Math.atan2(-dx, -dz);
  const pitch = Math.atan2(dy, Math.hypot(dx, dz));
  let dyaw = yaw - player.yaw;
  while (dyaw > Math.PI) dyaw -= Math.PI * 2;
  while (dyaw < -Math.PI) dyaw += Math.PI * 2;
  const k = Math.min(1, dt * 14);
  player.yaw += dyaw * k;
  player.pitch += (pitch - player.pitch) * k;
  // 얼굴이 화면을 채울 때까지 다가온다 (몸 중심이 아니라 머리 기준)
  const toward = Math.hypot(player.pos.x - entity.pos.x, player.pos.z - entity.pos.z);
  if (Math.hypot(dx, dz) > 0.55 && toward > 0.3) {
    entity.pos.x += ((player.pos.x - entity.pos.x) / toward) * dt * 3;
    entity.pos.z += ((player.pos.z - entity.pos.z) / toward) * dt * 3;
  }
  entity.syncMesh();
  entity.head.lookAt(camera.position);
  if (game.caughtT > 1.3) {
    setState('dead');
    unlockPointer();
    audio.setStatic(0.15, 0.2);
    audio.setEntityMood(false, false);
    $('dead-text').textContent = `${game.level.theme.code} · 테이프가 여기서 끊겨 있다.\n끊긴 횟수 ${game.deaths}회`;
    showScreen('screen-dead');
  }
}

function retry() {
  ensureAudio();
  audio.setStatic(0, 0.1);
  loadLevel(game.levelIndex, randomSeed());
  player.battery = Math.max(player.battery, 60);
  beginLevel();
  lockPointer();
}

function endGame() {
  setState('ending');
  unlockPointer();
  audio.setStatic(0.08, 0.5);
  audio.setEntityMood(false, false);
  audio.setHum(0);
  const sec = Math.floor(game.elapsed);
  const total = LEVELS.reduce((n, l) => n + l.notes.length, 0);
  $('end-text').textContent =
    `녹화 시간 ${Math.floor(sec / 60)}분 ${sec % 60}초\n` +
    `발견한 쪽지 ${game.notes.size}/${total}장\n` +
    `테이프가 끊긴 횟수 ${game.deaths}회\n\n` +
    '비상구 너머에는 또 다른 복도가 있었다.\n형광등 소리가 다시 들리기 시작한다.\n\n— 녹화는 여기서 끝난다 —';
  showScreen('screen-end');
}

function render() {
  vhs.render(scene, camera);
}

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  game.time += dt;
  update(dt);
  render();
}

function resize() {
  const w = innerWidth;
  const h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  vhs.setSize(w, h);
}

// ---------- 입력 ----------
addEventListener('resize', resize);
document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement) pause();
});
document.addEventListener('mousemove', (e) => {
  if (game.state !== 'playing') return;
  if (!TEST && !document.pointerLockElement) return;
  player.look(e.movementX, e.movementY, 0.0022 * settings.sens);
});
canvas.addEventListener('click', () => {
  if (game.state === 'playing' && !document.pointerLockElement) lockPointer();
});
addEventListener('keydown', (e) => {
  if (e.code === 'Tab') e.preventDefault();
  if (game.state === 'playing' || game.state === 'reading') {
    player.keys[e.code] = true;
    if (e.repeat) return;
    if (e.code === 'KeyE') interact();
    if (e.code === 'KeyF' && game.state === 'playing') {
      player.toggleFlash();
      audio.click();
    }
    if (TEST && e.code === 'Escape') pause();
  }
});
addEventListener('keyup', (e) => {
  player.keys[e.code] = false;
});
addEventListener('blur', () => {
  player.keys = {};
});

$('btn-resume').addEventListener('click', resume);
$('btn-quit').addEventListener('click', toTitle);
$('btn-retry').addEventListener('click', retry);
$('btn-dead-quit').addEventListener('click', toTitle);
$('btn-again').addEventListener('click', toTitle);
$('screen-pause').addEventListener('click', (e) => {
  if (e.target.id === 'screen-pause') resume();
});
for (const el of document.querySelectorAll('[data-setting]')) {
  el.addEventListener('input', () => {
    settings[el.dataset.setting] = Number(el.value);
    applySettings();
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {}
  });
}
// 터치 전용 기기에서는 플레이할 수 없다고 미리 알려준다
if (matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches) {
  $('mobile-warn').classList.remove('hidden');
}
$('opt-mic').addEventListener('change', async (e) => {
  if (!e.target.checked) return;
  ensureAudio();
  try {
    if (!audio.mic) await audio.enableMic();
  } catch {
    e.target.checked = false;
    alert('마이크를 사용할 수 없습니다.');
  }
});

// ---------- 부팅 ----------
// 메뉴 소리는 오디오가 준비된 뒤에만 (첫 클릭·키 입력 때 만든다)
const UI_SOUNDS = { move: 'uiMove', select: 'uiSelect', back: 'uiBack', denied: 'denied', insert: 'tapeInsert' };
const menu = createMenu({
  levels: LEVELS,
  progress: () => progress,
  defaultTape: defaultTape(),
  test: TEST,
  onStart: (i) => startGame(i),
  onFirstInput: () => ensureAudio(),
  sound: (name) => {
    if (audio) audio[UI_SOUNDS[name]]();
  },
  setGlitch: (pulse, hold) => {
    game.glitch = Math.max(game.glitch, pulse);
    if (hold !== undefined) game.menuGlitch = hold;
  },
});

if (TEST) {
  window.__noclip = {
    game,
    player,
    entities,
    get entity() {
      return entity;
    },
    lights,
    startGame,
    menu,
    progress,
    interact,
    loadLevel,
    LEVELS,
    camera,
  };
}

resize();
loadLevel(0, 1996);
applySettings();
menu.show('title');
requestAnimationFrame(frame);
window.__booted = true;
$('loading').classList.add('hidden');
