// 절차적 레벨: 셀 격자 + 셀 사이 벽(edge). 미로 → 방 → 추가 개구부 → 연결성 보정 순으로 만든다.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RNG } from './rng.js';
import { box, worldUV, makeItem, makeExit, deskGeoms } from './props.js';

export const OPEN = 0;
export const WALL = 1;
export const DOOR = 2;
const DX = [1, -1, 0, 0];
const DY = [0, 0, 1, -1];
const T = 0.2; // 벽 두께
// 풀룸: 물에 잠긴 칸의 바닥 높이와 수면 높이 (마른 바닥 = 0)
export const POOL_FLOOR = -1.0;
export const WATER_Y = -0.35;

export class Level {
  constructor(theme, seed, tex) {
    this.theme = theme;
    this.seed = seed;
    this.tex = tex;
    this.rng = new RNG(seed);
    const W = (this.W = theme.W);
    const H = (this.H = theme.H);
    this.S = theme.cell;
    this.wallH = theme.wallH;
    this.v = new Uint8Array((W - 1) * H).fill(WALL); // (x,y)-(x+1,y)
    this.h = new Uint8Array(W * (H - 1)).fill(WALL); // (x,y)-(x,y+1)
    this.pv = new Uint8Array(this.v.length);
    this.ph = new Uint8Array(this.h.length);
    this.roomOf = new Int16Array(W * H).fill(-1);
    this.water = new Uint8Array(W * H); // 1 = 물에 잠긴 칸
    this.waterRegion = new Int16Array(W * H).fill(-1); // 이어진 물 구역 번호
    this.ripples = [];
    this.rooms = [];
    this.pillars = [];
    this.fixtures = [];
    this.items = [];
    this.colliders = [];
    this.cgrid = Array.from({ length: W * H }, () => []);
    this.reserved = new Set();
    this.group = new THREE.Group();
    this._generate();
    this._build();
  }

  // ---------- 격자 기본 연산 ----------
  inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.W && y < this.H;
  }
  _ref(x, y, d) {
    const W = this.W;
    const H = this.H;
    if (d === 0) return x < W - 1 ? ['v', y * (W - 1) + x] : null;
    if (d === 1) return x > 0 ? ['v', y * (W - 1) + x - 1] : null;
    if (d === 2) return y < H - 1 ? ['h', y * W + x] : null;
    return y > 0 ? ['h', (y - 1) * W + x] : null;
  }
  getEdge(x, y, d) {
    const r = this._ref(x, y, d);
    return r ? this[r[0]][r[1]] : WALL;
  }
  setEdge(x, y, d, val) {
    const r = this._ref(x, y, d);
    if (r) this[r[0]][r[1]] = val;
  }
  _protect(x, y, d) {
    const r = this._ref(x, y, d);
    if (r) this['p' + r[0]][r[1]] = 1;
  }
  cellAt(wx, wz) {
    const cx = Math.min(this.W - 1, Math.max(0, Math.floor(wx / this.S)));
    const cy = Math.min(this.H - 1, Math.max(0, Math.floor(wz / this.S)));
    return [cx, cy];
  }
  center(cx, cy) {
    return { x: (cx + 0.5) * this.S, z: (cy + 0.5) * this.S };
  }

  isWaterAt(x, z) {
    const [cx, cy] = this.cellAt(x, z);
    return this.water[cy * this.W + cx] === 1;
  }
  groundAt(x, z) {
    return this.isWaterAt(x, z) ? POOL_FLOOR : 0;
  }
  surfaceAt(x, z) {
    return this.isWaterAt(x, z) ? 'water' : this.theme.surface;
  }

  // pass(셀 번호)가 주어지면 그 조건을 만족하는 칸만 지난다 (익사체는 물속만)
  bfs(sx, sy, tx = -1, ty = -1, pass = null) {
    const W = this.W;
    const dist = new Int16Array(W * this.H).fill(-1);
    const prev = new Int32Array(W * this.H).fill(-1);
    const q = [sy * W + sx];
    dist[q[0]] = 0;
    for (let qi = 0; qi < q.length; qi++) {
      const c = q[qi];
      const x = c % W;
      const y = (c / W) | 0;
      if (x === tx && y === ty) break;
      for (let d = 0; d < 4; d++) {
        if (this.getEdge(x, y, d) === WALL) continue;
        const n = (y + DY[d]) * W + x + DX[d];
        if (dist[n] >= 0 || (pass && !pass(n))) continue;
        dist[n] = dist[c] + 1;
        prev[n] = c;
        q.push(n);
      }
    }
    return { dist, prev };
  }

  findPath(sx, sy, tx, ty, pass = null) {
    if (sx === tx && sy === ty) return [];
    const W = this.W;
    if (pass && !pass(ty * W + tx)) return [];
    const { dist, prev } = this.bfs(sx, sy, tx, ty, pass);
    let c = ty * W + tx;
    if (dist[c] < 0) return [];
    const path = [];
    while (c !== sy * W + sx && c >= 0) {
      path.push([c % W, (c / W) | 0]);
      c = prev[c];
    }
    return path.reverse();
  }

  randomCellAround(cx, cy, minD, maxD, pass = null) {
    const { dist } = this.bfs(cx, cy, -1, -1, pass);
    const opts = [];
    for (let i = 0; i < dist.length; i++) if (dist[i] >= minD && dist[i] <= maxD) opts.push(i);
    if (!opts.length) return [cx, cy];
    const c = opts[Math.floor(Math.random() * opts.length)];
    return [c % this.W, (c / this.W) | 0];
  }

  // 시야: 0.25m 간격으로 진행하며 넘는 벽을 검사. 문틀은 실제 틈 안으로 지나는지까지 본다.
  lineOfSight(x1, z1, x2, z2) {
    const S = this.S;
    const dx = x2 - x1;
    const dz = z2 - z1;
    const steps = Math.ceil(Math.hypot(dx, dz) / 0.25);
    let cx = Math.floor(x1 / S);
    let cy = Math.floor(z1 / S);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const nx = Math.floor((x1 + dx * t) / S);
      const ny = Math.floor((z1 + dz * t) / S);
      if (nx === cx && ny === cy) continue;
      const ox = nx - cx;
      const oy = ny - cy;
      if (Math.abs(ox) + Math.abs(oy) === 1) {
        const d = ox === 1 ? 0 : ox === -1 ? 1 : oy === 1 ? 2 : 3;
        const e = this.getEdge(cx, cy, d);
        if (e === WALL) return false;
        if (e === DOOR) {
          const half = this.theme.doorW / 2 - 0.1;
          if (d < 2) {
            const X = (cx + (ox > 0 ? 1 : 0)) * S;
            const zc = z1 + (dz * (X - x1)) / (dx || 1e-6);
            if (Math.abs(zc - (cy + 0.5) * S) > half) return false;
          } else {
            const Z = (cy + (oy > 0 ? 1 : 0)) * S;
            const xc = x1 + (dx * (Z - z1)) / (dz || 1e-6);
            if (Math.abs(xc - (cx + 0.5) * S) > half) return false;
          }
        }
      } else {
        const dX = ox > 0 ? 0 : 1;
        const dY = oy > 0 ? 2 : 3;
        const a = this.getEdge(cx, cy, dX) !== WALL && this.getEdge(cx + ox, cy, dY) !== WALL;
        const b = this.getEdge(cx, cy, dY) !== WALL && this.getEdge(cx, cy + oy, dX) !== WALL;
        if (!(a && b)) return false;
      }
      cx = nx;
      cy = ny;
    }
    return true;
  }

  // ---------- 충돌 ----------
  _addCollider(minX, minZ, maxX, maxZ, soft = false) {
    const c = { minX, minZ, maxX, maxZ, soft };
    this.colliders.push(c);
    const S = this.S;
    const x0 = Math.max(0, Math.floor((minX - 0.6) / S));
    const x1 = Math.min(this.W - 1, Math.floor((maxX + 0.6) / S));
    const y0 = Math.max(0, Math.floor((minZ - 0.6) / S));
    const y1 = Math.min(this.H - 1, Math.floor((maxZ + 0.6) / S));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.cgrid[y * this.W + x].push(c);
  }

  hitsCollider(x, z, r) {
    const [cx, cy] = this.cellAt(x, z);
    for (const c of this.cgrid[cy * this.W + cx]) {
      const px = Math.max(c.minX, Math.min(x, c.maxX));
      const pz = Math.max(c.minZ, Math.min(z, c.maxZ));
      if ((x - px) ** 2 + (z - pz) ** 2 < r * r) return true;
    }
    return false;
  }

  // 원(반지름 r)을 AABB들 밖으로 밀어낸다. 벽을 따라 미끄러지게 된다.
  // skipSoft: 엔티티는 책상 같은 가구를 통과한다.
  collide(pos, r, skipSoft = false) {
    for (let iter = 0; iter < 2; iter++) {
      const [cx, cy] = this.cellAt(pos.x, pos.z);
      for (const c of this.cgrid[cy * this.W + cx]) {
        if (skipSoft && c.soft) continue;
        const px = Math.max(c.minX, Math.min(pos.x, c.maxX));
        const pz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
        const dx = pos.x - px;
        const dz = pos.z - pz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          pos.x += (dx / d) * (r - d);
          pos.z += (dz / d) * (r - d);
        } else {
          const l = pos.x - c.minX;
          const rr = c.maxX - pos.x;
          const t = pos.z - c.minZ;
          const b = c.maxZ - pos.z;
          const m = Math.min(l, rr, t, b);
          if (m === l) pos.x = c.minX - r;
          else if (m === rr) pos.x = c.maxX + r;
          else if (m === t) pos.z = c.minZ - r;
          else pos.z = c.maxZ + r;
        }
      }
    }
    pos.x = Math.max(r, Math.min(this.W * this.S - r, pos.x));
    pos.z = Math.max(r, Math.min(this.H * this.S - r, pos.z));
  }

  // ---------- 생성 ----------
  _generate() {
    const r = this.rng;
    const t = this.theme;
    const W = this.W;
    const H = this.H;

    // 1. 완전 미로 (randomized DFS)
    const vis = new Uint8Array(W * H);
    const stack = [[r.int(0, W - 1), r.int(0, H - 1)]];
    vis[stack[0][1] * W + stack[0][0]] = 1;
    while (stack.length) {
      const [x, y] = stack[stack.length - 1];
      const opts = [];
      for (let d = 0; d < 4; d++) {
        const nx = x + DX[d];
        const ny = y + DY[d];
        if (this.inBounds(nx, ny) && !vis[ny * W + nx]) opts.push(d);
      }
      if (!opts.length) {
        stack.pop();
        continue;
      }
      const d = r.pick(opts);
      this.setEdge(x, y, d, r.chance(t.maze.doorChance) ? DOOR : OPEN);
      vis[(y + DY[d]) * W + x + DX[d]] = 1;
      stack.push([x + DX[d], y + DY[d]]);
    }

    // 2. 방: 내부 벽을 모두 터서 넓은 공간을 만든다. 교실 레벨은 둘레를 막고 문 1~2개만 남긴다.
    const R = t.rooms;
    const margin = R.enclosed ? 1 : 0;
    for (let tries = 0; tries < 300 && this.rooms.length < R.count; tries++) {
      const w = r.int(R.min, R.max);
      const h = r.int(R.min, R.max);
      const x0 = r.int(0, W - w);
      const y0 = r.int(0, H - h);
      let ok = true;
      for (let y = y0 - margin; y < y0 + h + margin && ok; y++) {
        for (let x = x0 - margin; x < x0 + w + margin; x++) {
          if (this.inBounds(x, y) && this.roomOf[y * W + x] >= 0) {
            ok = false;
            break;
          }
        }
      }
      if (!ok) continue;
      const id = this.rooms.length;
      const room = { id, x0, y0, w, h, doors: [] };
      this.rooms.push(room);
      for (let y = y0; y < y0 + h; y++) {
        for (let x = x0; x < x0 + w; x++) {
          this.roomOf[y * W + x] = id;
          if (x < x0 + w - 1) this.setEdge(x, y, 0, OPEN);
          if (y < y0 + h - 1) this.setEdge(x, y, 2, OPEN);
        }
      }
      if (R.enclosed) {
        const perim = [];
        for (let y = y0; y < y0 + h; y++) {
          for (let x = x0; x < x0 + w; x++) {
            for (let d = 0; d < 4; d++) {
              const nx = x + DX[d];
              const ny = y + DY[d];
              if (!this.inBounds(nx, ny) || this.roomOf[ny * W + nx] === id) continue;
              this.setEdge(x, y, d, WALL);
              this._protect(x, y, d);
              perim.push([x, y, d]);
            }
          }
        }
        r.shuffle(perim);
        const n = Math.min(perim.length, r.int(1, 2));
        for (let i = 0; i < n; i++) {
          this.setEdge(...perim[i], DOOR);
          room.doors.push(perim[i]);
        }
      }
    }

    // 3. 추가 개구부로 순환 경로를 만든다 (백룸 특유의 뻥 뚫린 느낌)
    for (const k of ['v', 'h']) {
      const arr = this[k];
      const prot = this['p' + k];
      for (let i = 0; i < arr.length; i++) {
        if (arr[i] === WALL && !prot[i] && r.chance(t.maze.openChance)) {
          arr[i] = r.chance(t.maze.doorChance) ? DOOR : OPEN;
        }
      }
    }

    // 4. 시작 지점 + 모든 셀이 이어지도록 보정
    const starts = [];
    for (let i = 0; i < W * H; i++) if (!R.enclosed || this.roomOf[i] < 0) starts.push(i);
    const s = r.pick(starts);
    this.spawnCell = [s % W, (s / W) | 0];
    for (;;) {
      const { dist } = this.bfs(...this.spawnCell);
      const edges = [];
      for (let i = 0; i < W * H; i++) {
        if (dist[i] < 0) continue;
        const x = i % W;
        const y = (i / W) | 0;
        for (let d = 0; d < 4; d++) {
          const nx = x + DX[d];
          const ny = y + DY[d];
          if (this.inBounds(nx, ny) && dist[ny * W + nx] < 0 && this.getEdge(x, y, d) === WALL) edges.push([x, y, d]);
        }
      }
      if (!edges.length) break;
      this.setEdge(...r.pick(edges), DOOR);
    }

    // 5. 기둥: 네 방향이 모두 뚫린 모서리에만
    for (let j = 1; j < H; j++) {
      for (let i = 1; i < W; i++) {
        const open =
          this.v[(j - 1) * (W - 1) + i - 1] === OPEN &&
          this.v[j * (W - 1) + i - 1] === OPEN &&
          this.h[(j - 1) * W + i - 1] === OPEN &&
          this.h[(j - 1) * W + i] === OPEN;
        if (open && r.chance(t.pillarChance)) this.pillars.push([i * this.S, j * this.S]);
      }
    }

    if (t.water) this._genWater();

    // 6. 거리 기반 배치: 출구, 엔티티 시작점
    const { dist } = this.bfs(...this.spawnCell);
    this.spawnDist = dist;
    this.maxDist = Math.max(...dist);
    const exitOpts = [];
    for (let i = 0; i < W * H; i++) {
      if (dist[i] < this.maxDist * 0.75) continue;
      if (R.enclosed && this.roomOf[i] >= 0) continue;
      if (this.water[i]) continue; // 비상구는 마른 바닥에
      const x = i % W;
      const y = (i / W) | 0;
      for (let d = 0; d < 4; d++) if (this.getEdge(x, y, d) === WALL) exitOpts.push([x, y, d]);
    }
    if (!exitOpts.length) {
      // 안전장치: 가장 먼 셀의 아무 벽
      const i = dist.indexOf(this.maxDist);
      const x = i % W;
      const y = (i / W) | 0;
      for (let d = 0; d < 4; d++) if (this.getEdge(x, y, d) === WALL) exitOpts.push([x, y, d]);
    }
    this.exitFace = r.pick(exitOpts);
    this.reserved.add(this.exitFace.join(','));

    let entOpts = [];
    for (let i = 0; i < W * H; i++) if (dist[i] >= this.maxDist * 0.55 && (!t.water || this.water[i])) entOpts.push(i);
    if (!entOpts.length) for (let i = 0; i < W * H; i++) if (!t.water || this.water[i]) entOpts.push(i);
    const e = r.pick(entOpts);
    this.entityCell = [e % W, (e / W) | 0];

    // 7. 조명: 셀마다 하나. 0=고장, 1=정상, 2=깜빡임
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let state = r.chance(t.lights.broken) ? 0 : r.chance(t.lights.flicker) ? 2 : 1;
        const isKey =
          (x === this.spawnCell[0] && y === this.spawnCell[1]) || (x === this.exitFace[0] && y === this.exitFace[1]);
        if (isKey) state = 1;
        const c = this.center(x, y);
        this.fixtures.push({ x: c.x, z: c.z, state, phase: r.next() * 100, b: 1, cx: x, cy: y });
      }
    }
  }

  // 방은 대부분 수영장, 복도는 군데군데 잠긴다. 시작 칸과 그 주변은 마른 바닥
  _genWater() {
    const r = this.rng;
    const cfg = this.theme.water;
    const W = this.W;
    const H = this.H;
    const noise = Float32Array.from({ length: W * H }, () => r.next());
    const poolRoom = new Uint8Array(this.rooms.length);
    this.rooms.forEach((room, k) => (poolRoom[k] = r.chance(cfg.room) ? 1 : 0));
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (this.roomOf[i] >= 0) {
          this.water[i] = poolRoom[this.roomOf[i]];
          continue;
        }
        let sum = noise[i];
        let n = 1;
        for (let d = 0; d < 4; d++) {
          const nx = x + DX[d];
          const ny = y + DY[d];
          if (!this.inBounds(nx, ny)) continue;
          sum += noise[ny * W + nx];
          n++;
        }
        this.water[i] = sum / n > cfg.threshold ? 1 : 0;
      }
    }
    const [sx, sy] = this.spawnCell;
    for (let y = sy - 1; y <= sy + 1; y++) for (let x = sx - 1; x <= sx + 1; x++) if (this.inBounds(x, y)) this.water[y * W + x] = 0;

    // 이어진 물 구역에 번호를 매긴다. 3칸보다 작은 웅덩이는 말려 버린다
    this._labelWater();
    const size = new Int32Array(this.waterRegions);
    for (let i = 0; i < W * H; i++) if (this.waterRegion[i] >= 0) size[this.waterRegion[i]]++;
    for (let i = 0; i < W * H; i++) if (this.waterRegion[i] >= 0 && size[this.waterRegion[i]] < 3) this.water[i] = 0;
    this._labelWater();
  }

  _labelWater() {
    const W = this.W;
    const H = this.H;
    this.waterRegion.fill(-1);
    let region = 0;
    for (let i = 0; i < W * H; i++) {
      if (!this.water[i] || this.waterRegion[i] >= 0) continue;
      const q = [i];
      this.waterRegion[i] = region;
      for (let qi = 0; qi < q.length; qi++) {
        const c = q[qi];
        const x = c % W;
        const y = (c / W) | 0;
        for (let d = 0; d < 4; d++) {
          if (this.getEdge(x, y, d) === WALL) continue;
          const nb = (y + DY[d]) * W + x + DX[d];
          if (!this.water[nb] || this.waterRegion[nb] >= 0) continue;
          this.waterRegion[nb] = region;
          q.push(nb);
        }
      }
      region++;
    }
    this.waterRegions = region;
  }

  // ---------- 메시 ----------
  _build() {
    const t = this.theme;
    const tex = this.tex;
    const S = this.S;
    const WH = this.wallH;
    const W = this.W;
    const H = this.H;
    const su = t.uv.wall;
    const wallG = [];
    const yb = t.water ? POOL_FLOOR : 0; // 벽 아래쪽 끝

    const piece = (alongZ, fixed, mid, len, y0, y1, collide) => {
      if (alongZ) {
        wallG.push(box(T, y1 - y0, len, fixed, (y0 + y1) / 2, mid, su, su));
        if (collide) this._addCollider(fixed - T / 2, mid - len / 2, fixed + T / 2, mid + len / 2);
      } else {
        wallG.push(box(len, y1 - y0, T, mid, (y0 + y1) / 2, fixed, su, su));
        if (collide) this._addCollider(mid - len / 2, fixed - T / 2, mid + len / 2, fixed + T / 2);
      }
    };
    const edgeWall = (alongZ, fixed, mid, state) => {
      const L = S + T;
      if (state === WALL) piece(alongZ, fixed, mid, L, yb, WH, true);
      else if (state === DOOR) {
        const dw = t.doorW;
        const seg = (L - dw) / 2;
        piece(alongZ, fixed, mid - dw / 2 - seg / 2, seg, yb, WH, true);
        piece(alongZ, fixed, mid + dw / 2 + seg / 2, seg, yb, WH, true);
        piece(alongZ, fixed, mid, dw, t.doorH, WH, false);
      }
    };
    for (let y = 0; y < H; y++) for (let x = 0; x < W - 1; x++) edgeWall(true, (x + 1) * S, (y + 0.5) * S, this.v[y * (W - 1) + x]);
    for (let y = 0; y < H - 1; y++) for (let x = 0; x < W; x++) edgeWall(false, (y + 1) * S, (x + 0.5) * S, this.h[y * W + x]);
    // 바깥 경계
    piece(true, 0, (H * S) / 2, H * S + T, yb, WH, true);
    piece(true, W * S, (H * S) / 2, H * S + T, yb, WH, true);
    piece(false, 0, (W * S) / 2, W * S + T, yb, WH, true);
    piece(false, H * S, (W * S) / 2, W * S + T, yb, WH, true);
    for (const [px, pz] of this.pillars) {
      wallG.push(box(0.6, WH - yb, 0.6, px, (WH + yb) / 2, pz, su, su));
      this._addCollider(px - 0.3, pz - 0.3, px + 0.3, pz + 0.3);
    }

    const wallMat = new THREE.MeshLambertMaterial({ map: tex[t.textures.wall] });
    const add = (geos, mat) => {
      if (!geos.length) return null;
      const m = new THREE.Mesh(mergeGeometries(geos), mat);
      geos.forEach((g) => g.dispose());
      this.group.add(m);
      return m;
    };

    // 바닥/천장
    if (t.water) this._buildPool(add);
    else {
      const floor = new THREE.PlaneGeometry(W * S, H * S);
      floor.rotateX(-Math.PI / 2);
      floor.translate((W * S) / 2, 0, (H * S) / 2);
      worldUV(floor, t.uv.floor, t.uv.floor);
      const floorMat = t.floorShine
        ? new THREE.MeshPhongMaterial({ map: tex[t.textures.floor], shininess: t.floorShine, specular: 0x6e6448 })
        : new THREE.MeshLambertMaterial({ map: tex[t.textures.floor] });
      this.group.add(new THREE.Mesh(floor, floorMat));
    }
    const ceil = new THREE.PlaneGeometry(W * S, H * S);
    ceil.rotateX(Math.PI / 2);
    ceil.translate((W * S) / 2, WH, (H * S) / 2);
    worldUV(ceil, t.uv.ceil, t.uv.ceil);
    this.group.add(new THREE.Mesh(ceil, new THREE.MeshLambertMaterial({ map: tex[t.textures.ceil] })));

    // 형광등 패널: 정점 색으로 밝기를 개별 제어 (깜빡임용)
    const panels = [];
    for (const f of this.fixtures) {
      const g = new THREE.PlaneGeometry(1.2, 0.6);
      g.rotateX(Math.PI / 2);
      g.translate(f.x, WH - 0.01, f.z);
      g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(12).fill(1), 3));
      panels.push(g);
    }
    const panelMat = new THREE.MeshBasicMaterial({ map: tex.panel, vertexColors: true });
    this.panelMesh = add(panels, panelMat);
    this.panelColor = new THREE.Color(t.lights.panel);

    // 모든 형광등 아래 바닥에 빛이 고인다 (가까운 8개만 진짜 광원이라 먼 바닥이 어두워지는 것을 보완)
    const lc = new THREE.Color(t.lights.color);
    const pools = [];
    for (const f of this.fixtures) {
      const g = new THREE.PlaneGeometry(3.6, 3.6);
      g.rotateX(-Math.PI / 2);
      g.translate(f.x, this.groundAt(f.x, f.z) + 0.006, f.z);
      const a = f.state === 0 ? 0 : 1;
      g.setAttribute('color', new THREE.Float32BufferAttribute([0, 1, 2, 3].flatMap(() => [lc.r, lc.g, lc.b, a]), 4));
      pools.push(g);
    }
    this.lightPool = add(
      pools,
      new THREE.MeshBasicMaterial({
        map: tex.glow,
        vertexColors: true,
        transparent: true,
        opacity: t.lights.pool ?? 0.14,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }),
    );

    // 출구
    const [ex, ey, ed] = this.exitFace;
    const ec = this.center(ex, ey);
    const off = S / 2 - T / 2;
    const exit = makeExit(tex);
    exit.group.position.set(ec.x + DX[ed] * off, 0, ec.z + DY[ed] * off);
    exit.group.rotation.y = Math.atan2(-DX[ed], -DY[ed]);
    this.group.add(exit.group);
    this.exit = {
      x: ec.x + DX[ed] * (off - 0.6),
      z: ec.z + DY[ed] * (off - 0.6),
      obj: exit,
      unlocked: false,
    };

    if (t.furniture === 'classroom') this._buildClassroom();
    this._buildAO();

    add(wallG, wallMat);
    this._placeItems();
    this._buildDetails();
  }

  // ---------- 소품 ----------
  // 벽·천장·바닥에 드문드문 놓는 작은 것들. 같은 재질끼리 합쳐서 그리기 부담을 줄인다
  _buildDetails() {
    const t = this.theme;
    const r = this.rng;
    const tex = this.tex;
    const S = this.S;
    const WH = this.wallH;
    const W = this.W;
    const H = this.H;
    const lists = new Map();
    const put = (key, geo) => {
      if (!lists.has(key)) lists.set(key, []);
      lists.get(key).push(geo);
    };
    // 셀 (x,y) 의 d 방향 벽면 위 한 점. s: 벽을 따라 옮김, off: 벽에서 띄우는 거리
    const onWall = (x, y, d, s, off) => {
      const c = this.center(x, y);
      const k = S / 2 - T / 2 - off;
      return {
        x: c.x + DX[d] * k + (d < 2 ? 0 : s),
        z: c.z + DY[d] * k + (d < 2 ? s : 0),
        ry: Math.atan2(-DX[d], -DY[d]),
      };
    };
    const place = (geo, p, y) => geo.rotateY(p.ry).translate(p.x, y, p.z);
    const tube = (a, b, rad) => {
      const dir = new THREE.Vector3().subVectors(b, a);
      const g = new THREE.CylinderGeometry(rad, rad, dir.length(), 8);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
      return g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    };
    const faces = [];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (this.water[y * W + x]) continue;
        for (let d = 0; d < 4; d++) {
          if (this.getEdge(x, y, d) === WALL && !this.reserved.has(`${x},${y},${d}`)) faces.push([x, y, d]);
        }
      }
    }
    r.shuffle(faces);

    // 콘센트 (로비·교실)
    const outlet = (f) => {
      const s = r.range(-1.3, 1.3);
      put('white', place(new THREE.BoxGeometry(0.075, 0.115, 0.012), onWall(...f, s, 0.006), 0.3));
      // 판 앞면에 살짝 튀어나온 콘센트 구멍 두 개
      for (const dy of [0.018, -0.018]) put('dark', place(new THREE.BoxGeometry(0.03, 0.014, 0.004), onWall(...f, s, 0.0135), 0.3 + dy));
    };
    // 천장 환기구 (조명 패널을 피해 한쪽으로 비켜 둔다)
    const ventAt = (x, y) => {
      const c = this.center(x, y);
      const k = r.int(0, 3);
      const g = new THREE.PlaneGeometry(0.55, 0.55);
      g.rotateX(Math.PI / 2);
      g.translate(c.x + DX[k] * 1.25, WH - 0.006, c.z + DY[k] * 1.25);
      put('vent', g);
    };

    if (t.id === 'lobby' || t.id === 'classrooms') {
      const n = Math.floor(faces.length * (t.id === 'lobby' ? 0.18 : 0.1));
      for (const f of faces.slice(0, n)) outlet(f);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (r.chance(0.16)) ventAt(x, y);
    }

    if (t.id === 'classrooms') {
      // 복도 게시판
      let boards = 0;
      for (const f of faces.slice(Math.floor(faces.length * 0.1))) {
        if (boards >= 14 || this.roomOf[f[1] * W + f[0]] >= 0 || !r.chance(0.3)) continue;
        const p = onWall(...f, r.range(-0.8, 0.8), 0.012);
        put('cork', place(new THREE.BoxGeometry(1.35, 0.9, 0.024), p, 1.5));
        this.reserved.add(f.join(','));
        boards++;
      }
      // 칠판 위 시계
      for (const b of this.boardSpots || []) {
        const ry = Math.atan2(b.nx, b.nz);
        const y = Math.min(WH - 0.28, b.top + 0.32);
        const face = new THREE.CircleGeometry(0.22, 28);
        face.rotateY(ry).translate(b.x + b.nx * 0.052, y, b.z + b.nz * 0.052);
        put('clock', face);
        const rim = new THREE.CylinderGeometry(0.245, 0.245, 0.05, 28, 1, true);
        rim.rotateX(Math.PI / 2).rotateY(ry).translate(b.x + b.nx * 0.026, y, b.z + b.nz * 0.026);
        put('rim', rim);
      }
      this._buildClassDoors(put);
    }

    if (t.id === 'poolrooms') {
      // 데크 배수구
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          if (this.water[y * W + x] || !r.chance(0.16)) continue;
          const c = this.center(x, y);
          const g = new THREE.CircleGeometry(0.2, 20);
          g.rotateX(-Math.PI / 2);
          g.translate(c.x + r.range(-1.2, 1.2), 0.004, c.z + r.range(-1.2, 1.2));
          put('drain', g);
        }
      }
      // 사다리와 수심 표시
      for (const e of this.poolEdges || []) {
        const roll = r.next();
        if (roll > 0.26) continue;
        const s = r.range(-1.1, 1.1);
        const at = (along, perp, y) =>
          e.alongZ ? new THREE.Vector3(e.ex + perp, y, e.ez + along) : new THREE.Vector3(e.ex + along, y, e.ez + perp);
        if (roll < 0.14) {
          const wet = -e.dry * 0.16;
          const deck = e.dry * 0.28;
          for (const a of [s - 0.24, s + 0.24]) {
            put('chrome', tube(at(a, wet, POOL_FLOOR + 0.05), at(a, wet, 0.82), 0.022));
            put('chrome', tube(at(a, wet, 0.82), at(a, deck, 0.82), 0.022));
            put('chrome', tube(at(a, deck, 0.82), at(a, deck, 0.05), 0.022));
          }
          for (const y of [-0.22, -0.5, -0.78]) put('chrome', tube(at(s - 0.24, wet, y), at(s + 0.24, wet, y), 0.016));
        } else {
          const g = new THREE.PlaneGeometry(0.75, 0.28);
          g.rotateX(-Math.PI / 2);
          const w = at(0, -e.dry, 0).sub(at(0, 0, 0));
          g.rotateY(Math.atan2(-w.x, -w.z));
          const p = at(s, e.dry * 0.62, 0.005);
          g.translate(p.x, p.y, p.z);
          put('depth', g);
        }
      }
    }

    const mats = {
      white: () => new THREE.MeshLambertMaterial({ color: 0xe6e2d6 }),
      dark: () => new THREE.MeshBasicMaterial({ color: 0x15130f }),
      vent: () => new THREE.MeshLambertMaterial({ map: tex.vent }),
      cork: () => new THREE.MeshLambertMaterial({ map: tex.corkboard }),
      clock: () => new THREE.MeshLambertMaterial({ map: tex.clock }),
      rim: () => new THREE.MeshLambertMaterial({ color: 0x2b2a28, side: THREE.DoubleSide }),
      frame: () => new THREE.MeshLambertMaterial({ color: 0x4f3b26 }),
      door: () => new THREE.MeshLambertMaterial({ map: tex.classDoor }),
      plate: () => new THREE.MeshLambertMaterial({ map: tex.classPlate }),
      chrome: () => new THREE.MeshPhongMaterial({ color: 0xc9d0d3, specular: 0xffffff, shininess: 90 }),
      drain: () => new THREE.MeshLambertMaterial({ map: tex.drain, transparent: true, alphaTest: 0.5 }),
      depth: () =>
        new THREE.MeshLambertMaterial({
          map: tex.depthMark,
          transparent: true,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -1,
        }),
    };
    for (const [key, geos] of lists) {
      const m = new THREE.Mesh(mergeGeometries(geos), mats[key]());
      geos.forEach((g) => g.dispose());
      this.group.add(m);
    }
  }

  // 교실 레벨 문: 모든 문틀에 나무 테두리. 교실 출입문에는 열어 둔 미닫이문과 '3-2' 표지판
  _buildClassDoors(put) {
    const t = this.theme;
    const S = this.S;
    const W = this.W;
    const H = this.H;
    const dw = t.doorW;
    const dh = t.doorH;
    // alongZ: 벽이 z 축을 따라 놓였는가. fixed: 벽선 좌표, mid: 문 중심, perp: 벽에서 수직으로 옮김
    const edgeBox = (alongZ, fixed, along, len, depth, y0, y1, perp = 0) => {
      const g = new THREE.BoxGeometry(alongZ ? depth : len, y1 - y0, alongZ ? len : depth);
      return alongZ ? g.translate(fixed + perp, (y0 + y1) / 2, along) : g.translate(along, (y0 + y1) / 2, fixed + perp);
    };
    const frame = (alongZ, fixed, mid) => {
      for (const s of [-1, 1]) put('frame', edgeBox(alongZ, fixed, mid + s * (dw / 2 + 0.04), 0.08, T + 0.08, 0, dh + 0.06));
      put('frame', edgeBox(alongZ, fixed, mid, dw + 0.16, T + 0.08, dh, dh + 0.09));
    };
    for (let y = 0; y < H; y++) for (let x = 0; x < W - 1; x++) if (this.v[y * (W - 1) + x] === DOOR) frame(true, (x + 1) * S, (y + 0.5) * S);
    for (let y = 0; y < H - 1; y++) for (let x = 0; x < W; x++) if (this.h[y * W + x] === DOOR) frame(false, (y + 1) * S, (x + 0.5) * S);

    // 교실 둘레를 직접 훑는다 (연결성 보정으로 나중에 뚫린 문도 포함)
    const perim = [];
    for (const room of this.rooms) {
      for (let y = room.y0; y < room.y0 + room.h; y++) {
        for (let x = room.x0; x < room.x0 + room.w; x++) {
          for (let d = 0; d < 4; d++) {
            const nx = x + DX[d];
            const ny = y + DY[d];
            if (!this.inBounds(nx, ny) || this.roomOf[ny * W + nx] === room.id) continue;
            if (this.getEdge(x, y, d) === DOOR) perim.push([x, y, d]);
          }
        }
      }
    }
    {
      for (const [x, y, d] of perim) {
        const alongZ = d < 2;
        const fixed = alongZ ? (x + (d === 0 ? 1 : 0)) * S : (y + (d === 2 ? 1 : 0)) * S;
        const mid = alongZ ? (y + 0.5) * S : (x + 0.5) * S;
        const side = d === 0 || d === 2 ? 1 : -1; // 복도 쪽
        const h = this.rng.chance(0.5) ? 1 : -1; // 문을 밀어 둔 쪽
        const door = new THREE.BoxGeometry(alongZ ? 0.035 : dw, dh - 0.03, alongZ ? dw : 0.035);
        door.translate(
          alongZ ? fixed + side * (T / 2 + 0.03) : mid + h * dw,
          (dh - 0.03) / 2 + 0.01,
          alongZ ? mid + h * dw : fixed + side * (T / 2 + 0.03),
        );
        put('door', door);
        put('frame', edgeBox(alongZ, fixed, mid + (h * dw) / 2, dw * 2 + 0.12, 0.05, dh + 0.09, dh + 0.15, side * (T / 2 + 0.03)));
        // 복도로 튀어나온 학급 표지판
        const plate = new THREE.BoxGeometry(alongZ ? 0.56 : 0.035, 0.2, alongZ ? 0.035 : 0.56);
        const po = side * (T / 2 + 0.29);
        plate.translate(alongZ ? fixed + po : mid - h * 0.2, dh + 0.42, alongZ ? mid - h * 0.2 : fixed + po);
        put('plate', plate);
      }
    }
  }

  // ---------- 접촉 그림자 ----------
  // 벽 아래·벽 위·벽 앞 바닥에 은은한 그늘 띠를 깐다. 벽이 바닥에 세워 둔 판처럼 보이지 않게 한다
  _buildAO() {
    const S = this.S;
    const WH = this.wallH;
    const W = this.W;
    const H = this.H;
    const t = this.theme;
    const eps = 0.004;
    const bands = { base: [], top: [], floor: [] };
    const push = (list, corners, vFar) => {
      // corners: 접합선 쪽 두 점(a0, a1), 먼 쪽 두 점(b0, b1)
      const [a0, a1, b0, b1] = corners;
      const base = list.length / 5;
      list.push(...a0, 0, 0, ...a1, 1, 0, ...b0, 0, vFar, ...b1, 1, vFar);
      return base;
    };
    // face: 셀 안쪽을 향한 벽면 한 조각. along: 벽을 따라가는 방향, n: 셀 안쪽 방향
    const face = (cx, cz, along, n, from, to, ground) => {
      const p0 = [cx + along[0] * from + n[0] * eps, cz + along[1] * from + n[1] * eps];
      const p1 = [cx + along[0] * to + n[0] * eps, cz + along[1] * to + n[1] * eps];
      push(bands.base, [[p0[0], ground, p0[1]], [p1[0], ground, p1[1]], [p0[0], ground + 0.7, p0[1]], [p1[0], ground + 0.7, p1[1]]], 1);
      push(bands.top, [[p0[0], WH, p0[1]], [p1[0], WH, p1[1]], [p0[0], WH - 0.4, p0[1]], [p1[0], WH - 0.4, p1[1]]], 1);
      const f = 0.5;
      const g = ground + 0.003;
      push(bands.floor, [[p0[0], g, p0[1]], [p1[0], g, p1[1]], [p0[0] + n[0] * f, g, p0[1] + n[1] * f], [p1[0] + n[0] * f, g, p1[1] + n[1] * f]], 1);
    };
    const T2 = T / 2;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const c = this.center(x, y);
        const ground = this.groundAt(c.x, c.z);
        for (let d = 0; d < 4; d++) {
          const e = this.getEdge(x, y, d);
          if (e === OPEN) continue;
          const n = [-DX[d], -DY[d]];
          const along = d < 2 ? [0, 1] : [1, 0];
          const fx = c.x + DX[d] * (S / 2 - T2);
          const fz = c.z + DY[d] * (S / 2 - T2);
          const half = S / 2;
          if (e === WALL) face(fx, fz, along, n, -half, half, ground);
          else {
            const g = t.doorW / 2;
            face(fx, fz, along, n, -half, -g, ground);
            face(fx, fz, along, n, g, half, ground);
          }
        }
      }
    }
    for (const [px, pz] of this.pillars) {
      const ground = this.groundAt(px + 0.5, pz + 0.5);
      for (let d = 0; d < 4; d++) {
        const n = [DX[d], DY[d]];
        const along = d < 2 ? [0, 1] : [1, 0];
        face(px + DX[d] * 0.3, pz + DY[d] * 0.3, along, n, -0.3, 0.3, ground);
      }
    }
    const make = (arr, opacity) => {
      const quads = arr.length / 20;
      const pos = new Float32Array(quads * 12);
      const uv = new Float32Array(quads * 8);
      const idx = [];
      for (let q = 0; q < quads; q++) {
        for (let k = 0; k < 4; k++) {
          const s = (q * 4 + k) * 5;
          pos.set(arr.slice(s, s + 3), (q * 4 + k) * 3);
          uv.set(arr.slice(s + 3, s + 5), (q * 4 + k) * 2);
        }
        const b = q * 4;
        idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      g.setIndex(idx);
      const m = new THREE.Mesh(
        g,
        new THREE.MeshBasicMaterial({
          color: 0x000000,
          alphaMap: this.tex.ao,
          transparent: true,
          opacity,
          depthWrite: false,
          side: THREE.DoubleSide,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1,
        }),
      );
      this.group.add(m);
    };
    const k = t.ao ?? 1;
    make(bands.base, 0.62 * k);
    make(bands.top, 0.4 * k);
    make(bands.floor, 0.52 * k);
  }

  // 마른 데크 바닥, 한 단 꺼진 수영장 바닥과 옆면, 가장자리 턱, 전체를 덮는 수면
  _buildPool(add) {
    const t = this.theme;
    const tex = this.tex;
    const S = this.S;
    const W = this.W;
    const H = this.H;
    const deck = [];
    const basin = [];
    const sides = [];
    const lips = [];
    const lights = [];
    const quad = (x, y, h, list, uv) => {
      const g = new THREE.PlaneGeometry(S, S);
      g.rotateX(-Math.PI / 2);
      g.translate((x + 0.5) * S, h, (y + 0.5) * S);
      list.push(worldUV(g, uv, uv));
      if (list === basin) {
        const c = new THREE.PlaneGeometry(S, S);
        c.rotateX(-Math.PI / 2);
        c.translate((x + 0.5) * S, h + 0.01, (y + 0.5) * S);
        lights.push(worldUV(c, 1 / 2.4, 1 / 2.4));
      }
    };
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const wet = this.water[y * W + x];
        quad(x, y, wet ? POOL_FLOOR : 0, wet ? basin : deck, t.uv.floor);
        // 오른쪽·아래 이웃과 물/마른 바닥이 갈리고 벽이 없으면 수영장 옆면과 턱
        for (const d of [0, 2]) {
          const nx = x + DX[d];
          const ny = y + DY[d];
          if (!this.inBounds(nx, ny) || this.getEdge(x, y, d) === WALL) continue;
          const nWet = this.water[ny * W + nx];
          if (nWet === wet) continue;
          const alongZ = d === 0;
          const ex = alongZ ? (x + 1) * S : (x + 0.5) * S;
          const ez = alongZ ? (y + 0.5) * S : (y + 1) * S;
          const g = new THREE.PlaneGeometry(S, -POOL_FLOOR);
          if (alongZ) g.rotateY(Math.PI / 2);
          g.translate(ex, POOL_FLOOR / 2, ez);
          sides.push(worldUV(g, t.uv.floor, t.uv.floor));
          // 턱은 마른 쪽으로 15cm
          const dry = wet ? 1 : -1;
          const lx = alongZ ? ex + dry * 0.15 : ex;
          const lz = alongZ ? ez : ez + dry * 0.15;
          lips.push(box(alongZ ? 0.3 : S, 0.06, alongZ ? S : 0.3, lx, 0.03, lz, 1, 1));
          (this.poolEdges ||= []).push({ ex, ez, alongZ, dry });
        }
      }
    }
    add(deck, new THREE.MeshLambertMaterial({ map: tex[t.textures.floor] }));
    add(basin, new THREE.MeshLambertMaterial({ map: tex[t.textures.basin] }));
    add(sides, new THREE.MeshLambertMaterial({ map: tex[t.textures.basin], side: THREE.DoubleSide }));
    add(lips, new THREE.MeshLambertMaterial({ map: tex[t.textures.floor], color: 0xe9ece6 }));

    // 수면: 맵 전체를 덮지만 마른 바닥 아래로는 가려진다
    const wg = new THREE.PlaneGeometry(W * S, H * S);
    wg.rotateX(-Math.PI / 2);
    wg.translate((W * S) / 2, WATER_Y, (H * S) / 2);
    worldUV(wg, 1 / 3, 1 / 3);
    // 잔물결 노멀맵으로 형광등 빛이 수면 위에서 반짝인다
    this.waterMat = new THREE.MeshPhongMaterial({
      map: tex.water,
      color: 0x8fd0dc,
      emissive: 0x0d3a44,
      specular: 0xffffff,
      shininess: 90,
      normalMap: tex.waterNormal,
      normalScale: new THREE.Vector2(0.55, 0.55),
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    this.waterNormalB = tex.waterNormal;

    // 수영장 바닥의 물빛: 서로 다른 방향으로 흐르는 두 겹을 더해 일렁이게 한다
    this.caustics = [];
    if (lights.length) {
      const cg = mergeGeometries(lights);
      lights.forEach((g) => g.dispose());
      for (const [scale, op] of [
        [1, 0.32],
        [1.37, 0.24],
      ]) {
        const map = tex.caustics.clone();
        map.repeat.set(scale, scale);
        map.needsUpdate = true;
        const m = new THREE.Mesh(
          cg,
          new THREE.MeshBasicMaterial({
            map,
            color: 0xbfefff,
            transparent: true,
            opacity: op,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          }),
        );
        this.group.add(m);
        this.caustics.push(map);
      }
    }
    const wm = new THREE.Mesh(wg, this.waterMat);
    wm.renderOrder = 1;
    this.group.add(wm);

    // 물결 고리 풀
    const rg = new THREE.PlaneGeometry(1, 1);
    rg.rotateX(-Math.PI / 2);
    for (let i = 0; i < 32; i++) {
      const m = new THREE.Mesh(
        rg,
        new THREE.MeshBasicMaterial({ map: tex.ripple, transparent: true, opacity: 0, depthWrite: false }),
      );
      m.renderOrder = 2;
      m.visible = false;
      this.group.add(m);
      this.ripples.push({ m, life: 1, max: 1, size: 1, strength: 0 });
    }
  }

  // 물 위에 퍼지는 물결 하나
  ripple(x, z, size = 1, strength = 0.5) {
    if (!this.ripples.length || !this.isWaterAt(x, z)) return;
    let best = this.ripples[0];
    for (const r of this.ripples) if (r.life / r.max > best.life / best.max) best = r;
    best.m.position.set(x, WATER_Y + 0.01, z);
    best.life = 0;
    best.max = 1 + size * 0.5;
    best.size = size;
    best.strength = strength;
    best.m.visible = true;
  }

  _buildClassroom() {
    const t = this.theme;
    const tex = this.tex;
    const r = this.rng;
    const S = this.S;
    const wood = [];
    const metal = [];
    const lockers = [];
    const boardMat = new THREE.MeshLambertMaterial({ map: tex.chalkboard });

    for (const room of this.rooms) {
      const minX = room.x0 * S + T / 2;
      const maxX = (room.x0 + room.w) * S - T / 2;
      const minZ = room.y0 * S + T / 2;
      const maxZ = (room.y0 + room.h) * S - T / 2;
      // 칠판 쪽 벽: 실제 벽 상태를 보고, 문 없이 가장 길게 이어진 벽을 고른다
      // (연결성 보정 단계에서 교실 벽에 새 문이 뚫릴 수 있어 room.doors 만으로는 부족하다)
      const sides = [0, 1, 2, 3].map((d) => {
        const n = d < 2 ? room.h : room.w;
        let best = { start: 0, len: 0 };
        let run = 0;
        let doors = 0;
        for (let i = 0; i < n; i++) {
          const cx = d === 0 ? room.x0 + room.w - 1 : d === 1 ? room.x0 : room.x0 + i;
          const cy = d === 2 ? room.y0 + room.h - 1 : d === 3 ? room.y0 : room.y0 + i;
          if (this.getEdge(cx, cy, d) === WALL) {
            run++;
            if (run > best.len) best = { start: i - run + 1, len: run };
          } else {
            run = 0;
            doors++;
          }
        }
        return { d, doors, run: best };
      });
      sides.sort((a, b) => b.run.len - a.run.len || a.doors - b.doors);
      const side = sides[0].d;
      const run = sides[0].run;
      const nx = -DX[side];
      const nz = -DY[side];
      const runMid = (side < 2 ? room.y0 : room.x0) * S + (run.start + run.len / 2) * S;
      const bx = side === 0 ? maxX : side === 1 ? minX : runMid;
      const bz = side === 2 ? maxZ : side === 3 ? minZ : runMid;
      const bw = Math.min(run.len * S - 1.2, 5.5);
      const board = new THREE.Mesh(new THREE.PlaneGeometry(bw, bw * 0.375), boardMat);
      board.position.set(bx + nx * 0.02, 1.55, bz + nz * 0.02);
      board.rotation.y = Math.atan2(nx, nz);
      this.group.add(board);
      (this.boardSpots ||= []).push({ x: bx, z: bz, nx, nz, top: 1.55 + bw * 0.1875 });
      // 칠판 벽에는 쪽지가 붙지 않게
      for (let y = room.y0; y < room.y0 + room.h; y++)
        for (let x = room.x0; x < room.x0 + room.w; x++) this.reserved.add(`${x},${y},${side}`);

      // 교탁
      const tdx = bx + nx * 1.3;
      const tdz = bz + nz * 1.3;
      const tw = Math.abs(nx) > 0 ? 0.7 : 1.4;
      const td = Math.abs(nx) > 0 ? 1.4 : 0.7;
      wood.push(worldUV(new THREE.BoxGeometry(tw, 0.78, td).translate(tdx, 0.39, tdz), 1.5, 1.5));
      this._addCollider(tdx - tw / 2, tdz - td / 2, tdx + tw / 2, tdz + td / 2, true);

      // 학생 책상 격자
      const rot = Math.atan2(nx, nz);
      const inset = 1.3;
      const x0 = minX + inset + (side === 1 ? 1.4 : 0);
      const x1 = maxX - inset - (side === 0 ? 1.4 : 0);
      const z0 = minZ + inset + (side === 3 ? 1.4 : 0);
      const z1 = maxZ - inset - (side === 2 ? 1.4 : 0);
      const stepAcross = 1.25;
      const stepDepth = 1.45;
      const sx = Math.abs(nx) > 0 ? stepDepth : stepAcross;
      const sz = Math.abs(nx) > 0 ? stepAcross : stepDepth;
      for (let x = x0; x <= x1 + 1e-3; x += sx) {
        for (let z = z0; z <= z1 + 1e-3; z += sz) {
          if (r.chance(0.12)) continue;
          const a = rot + (r.next() - 0.5) * 0.3;
          const g = deskGeoms(x, z, a);
          wood.push(...g.wood);
          metal.push(...g.metal);
          // 책상+의자 모서리를 회전시켜 AABB를 잡는다
          let mnx = Infinity;
          let mnz = Infinity;
          let mxx = -Infinity;
          let mxz = -Infinity;
          for (const [lx, lz] of [
            [-0.34, -0.26],
            [0.34, -0.26],
            [-0.34, 0.76],
            [0.34, 0.76],
          ]) {
            const wx = x + lx * Math.cos(a) + lz * Math.sin(a);
            const wz = z - lx * Math.sin(a) + lz * Math.cos(a);
            mnx = Math.min(mnx, wx);
            mxx = Math.max(mxx, wx);
            mnz = Math.min(mnz, wz);
            mxz = Math.max(mxz, wz);
          }
          this._addCollider(mnx, mnz, mxx, mxz, true);
        }
      }
    }

    // 복도 사물함
    for (let y = 0; y < this.H; y++) {
      for (let x = 0; x < this.W; x++) {
        if (this.roomOf[y * this.W + x] >= 0) continue;
        for (let d = 0; d < 4; d++) {
          const key = `${x},${y},${d}`;
          if (this.getEdge(x, y, d) !== WALL || this.reserved.has(key) || !r.chance(0.3)) continue;
          this.reserved.add(key);
          const c = this.center(x, y);
          const len = S - 1.0;
          const dep = 0.45;
          const off = S / 2 - T / 2 - dep / 2;
          const px = c.x + DX[d] * off;
          const pz = c.z + DY[d] * off;
          const alongZ = d < 2;
          const g = new THREE.BoxGeometry(alongZ ? dep : len, 1.85, alongZ ? len : dep);
          g.translate(px, 0.925, pz);
          worldUV(g, 1 / 0.45, 1 / 1.85, alongZ ? pz - len / 2 : px - len / 2, 0);
          lockers.push(g);
          if (alongZ) this._addCollider(px - dep / 2, pz - len / 2, px + dep / 2, pz + len / 2);
          else this._addCollider(px - len / 2, pz - dep / 2, px + len / 2, pz + dep / 2);
        }
      }
    }

    const add = (geos, mat) => {
      if (!geos.length) return;
      this.group.add(new THREE.Mesh(mergeGeometries(geos), mat));
      geos.forEach((g) => g.dispose());
    };
    add(wood, new THREE.MeshLambertMaterial({ map: tex.wood }));
    add(metal, new THREE.MeshLambertMaterial({ color: 0x5d6166 }));
    add(lockers, new THREE.MeshLambertMaterial({ map: tex.locker }));
  }

  _freeSpot(cx, cy, rad) {
    const c = this.center(cx, cy);
    for (let i = 0; i < 16; i++) {
      const x = c.x + this.rng.range(-1.4, 1.4);
      const z = c.z + this.rng.range(-1.4, 1.4);
      if (!this.hitsCollider(x, z, rad)) return { x, z };
    }
    return null;
  }

  _placeItems() {
    this._shadowGeo = new THREE.PlaneGeometry(0.42, 0.42).rotateX(-Math.PI / 2);
    this._shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      alphaMap: this.tex.glow,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const t = this.theme;
    const r = this.rng;
    const W = this.W;
    const dist = this.spawnDist;
    const used = new Set([this.spawnCell.join(','), `${this.exitFace[0]},${this.exitFace[1]}`]);
    const chosen = [];

    const pick = (count, minDist, spacing) => {
      const cells = [];
      for (let i = 0; i < dist.length; i++) {
        const key = `${i % W},${(i / W) | 0}`;
        if (dist[i] >= minDist && !used.has(key)) cells.push([i % W, (i / W) | 0]);
      }
      r.shuffle(cells);
      const out = [];
      for (const pass of [spacing, 1]) {
        for (const c of cells) {
          if (out.length >= count) break;
          if (used.has(c.join(','))) continue;
          if (!chosen.every((o) => Math.abs(o[0] - c[0]) + Math.abs(o[1] - c[1]) >= pass)) continue;
          out.push(c);
          chosen.push(c);
          used.add(c.join(','));
        }
      }
      return out;
    };

    const spawnItem = (type, cell) => {
      const p = this._freeSpot(cell[0], cell[1], 0.45);
      if (!p) return false;
      const mesh = makeItem(type, this.tex);
      const ground = this.groundAt(p.x, p.z);
      const iy = ground + 0.25;
      mesh.position.set(p.x, iy, p.z);
      this.group.add(mesh);
      // 바닥에 떨어진 둥근 그림자
      const shadow = new THREE.Mesh(this._shadowGeo, this._shadowMat);
      shadow.position.set(p.x, ground + 0.006, p.z);
      this.group.add(shadow);
      this.items.push({ type, mesh, shadow, x: p.x, z: p.z, y: iy, taken: false, phase: r.next() * 10 });
      return true;
    };

    const goalCells = pick(t.goal.count + 2, Math.floor(this.maxDist * 0.35), Math.max(3, Math.floor(W / 4)));
    let placed = 0;
    for (const c of goalCells) if (placed < t.goal.count && spawnItem(t.goal.item, c)) placed++;
    this.goalTotal = placed;
    for (const c of pick(t.pickups.battery, 2, 3)) spawnItem('battery', c);
    for (const c of pick(t.pickups.water, 2, 3)) spawnItem('water', c);

    // 쪽지: 벽에 붙인다
    const faces = [];
    for (let i = 0; i < dist.length; i++) {
      const x = i % W;
      const y = (i / W) | 0;
      if (dist[i] < 1) continue;
      for (let d = 0; d < 4; d++) {
        if (this.getEdge(x, y, d) === WALL && !this.reserved.has(`${x},${y},${d}`)) faces.push([x, y, d]);
      }
    }
    r.shuffle(faces);
    const noteCells = [];
    for (const text of t.notes) {
      const f = faces.find((f) => noteCells.every((o) => Math.abs(o[0] - f[0]) + Math.abs(o[1] - f[1]) >= 4));
      if (!f) break;
      noteCells.push(f);
      this.reserved.add(f.join(','));
      const [x, y, d] = f;
      const c = this.center(x, y);
      const off = this.S / 2 - T / 2 - 0.012;
      const slide = r.range(-1, 1);
      const px = c.x + DX[d] * off + (d >= 2 ? slide : 0);
      const pz = c.z + DY[d] * off + (d < 2 ? slide : 0);
      const mesh = makeItem('note', this.tex);
      mesh.position.set(px, 1.45, pz);
      mesh.rotation.y = Math.atan2(-DX[d], -DY[d]);
      mesh.rotation.z = r.range(-0.12, 0.12);
      this.group.add(mesh);
      this.items.push({ type: 'note', mesh, x: px, z: pz, y: 1.45, taken: false, text });
    }
  }

  update(time) {
    const dt = Math.min(0.1, time - (this._lastT ?? time));
    this._lastT = time;
    if (this.waterMat) {
      this.waterMat.map.offset.set(time * 0.018, time * 0.011);
      this.waterMat.normalMap.offset.set(time * 0.03, -time * 0.021);
      if (this.caustics[0]) this.caustics[0].offset.set(time * 0.035, time * 0.022);
      if (this.caustics[1]) this.caustics[1].offset.set(-time * 0.027, time * 0.031);
      for (const r of this.ripples) {
        if (!r.m.visible) continue;
        r.life += dt;
        const k = r.life / r.max;
        if (k >= 1) {
          r.m.visible = false;
          continue;
        }
        const sc = 0.3 + r.size * 2.2 * k;
        r.m.scale.set(sc, 1, sc);
        r.m.material.opacity = r.strength * (1 - k);
      }
    }
    for (const it of this.items) {
      if (it.taken || it.type === 'note') continue;
      const bob = Math.sin(time * 2 + it.phase) * 0.05;
      it.mesh.position.y = it.y + bob;
      if (it.shadow) it.shadow.scale.setScalar(1 - bob * 2);
      it.mesh.rotation.y = time * 0.8 + it.phase;
      if (it.mesh.userData.glow) it.mesh.userData.glow.material.opacity = 0.4 + Math.sin(time * 3 + it.phase) * 0.15;
    }
  }

  setFixture(i, b) {
    const col = this.panelMesh.geometry.attributes.color;
    const c = this.panelColor;
    const v = 0.06 + b * 0.94;
    for (let k = 0; k < 4; k++) col.setXYZ(i * 4 + k, c.r * v, c.g * v, c.b * v);
    if (this.lightPool) {
      const pc = this.lightPool.geometry.attributes.color;
      for (let k = 0; k < 4; k++) pc.setW(i * 4 + k, b);
    }
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
  }
}
