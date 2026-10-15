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

  bfs(sx, sy, tx = -1, ty = -1) {
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
        if (dist[n] >= 0) continue;
        dist[n] = dist[c] + 1;
        prev[n] = c;
        q.push(n);
      }
    }
    return { dist, prev };
  }

  findPath(sx, sy, tx, ty) {
    if (sx === tx && sy === ty) return [];
    const { dist, prev } = this.bfs(sx, sy, tx, ty);
    const W = this.W;
    let c = ty * W + tx;
    if (dist[c] < 0) return [];
    const path = [];
    while (c !== sy * W + sx && c >= 0) {
      path.push([c % W, (c / W) | 0]);
      c = prev[c];
    }
    return path.reverse();
  }

  randomCellAround(cx, cy, minD, maxD) {
    const { dist } = this.bfs(cx, cy);
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

    // 6. 거리 기반 배치: 출구, 엔티티 시작점
    const { dist } = this.bfs(...this.spawnCell);
    this.spawnDist = dist;
    this.maxDist = Math.max(...dist);
    const exitOpts = [];
    for (let i = 0; i < W * H; i++) {
      if (dist[i] < this.maxDist * 0.75) continue;
      if (R.enclosed && this.roomOf[i] >= 0) continue;
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

    const entOpts = [];
    for (let i = 0; i < W * H; i++) if (dist[i] >= this.maxDist * 0.55) entOpts.push(i);
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
      if (state === WALL) piece(alongZ, fixed, mid, L, 0, WH, true);
      else if (state === DOOR) {
        const dw = t.doorW;
        const seg = (L - dw) / 2;
        piece(alongZ, fixed, mid - dw / 2 - seg / 2, seg, 0, WH, true);
        piece(alongZ, fixed, mid + dw / 2 + seg / 2, seg, 0, WH, true);
        piece(alongZ, fixed, mid, dw, t.doorH, WH, false);
      }
    };
    for (let y = 0; y < H; y++) for (let x = 0; x < W - 1; x++) edgeWall(true, (x + 1) * S, (y + 0.5) * S, this.v[y * (W - 1) + x]);
    for (let y = 0; y < H - 1; y++) for (let x = 0; x < W; x++) edgeWall(false, (y + 1) * S, (x + 0.5) * S, this.h[y * W + x]);
    // 바깥 경계
    piece(true, 0, (H * S) / 2, H * S + T, 0, WH, true);
    piece(true, W * S, (H * S) / 2, H * S + T, 0, WH, true);
    piece(false, 0, (W * S) / 2, W * S + T, 0, WH, true);
    piece(false, H * S, (W * S) / 2, W * S + T, 0, WH, true);
    for (const [px, pz] of this.pillars) {
      wallG.push(box(0.6, WH, 0.6, px, WH / 2, pz, su, su));
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
    const floor = new THREE.PlaneGeometry(W * S, H * S);
    floor.rotateX(-Math.PI / 2);
    floor.translate((W * S) / 2, 0, (H * S) / 2);
    worldUV(floor, t.uv.floor, t.uv.floor);
    this.group.add(new THREE.Mesh(floor, new THREE.MeshLambertMaterial({ map: tex[t.textures.floor] })));
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

    add(wallG, wallMat);
    this._placeItems();
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
      // 칠판 쪽 벽: 문이 없는 변을 고른다
      const sides = [0, 1, 2, 3].map((d) => {
        let doors = 0;
        for (const dd of room.doors) if (dd[2] === d) doors++;
        return { d, doors, len: d < 2 ? room.h * S : room.w * S };
      });
      sides.sort((a, b) => a.doors - b.doors || b.len - a.len);
      const side = sides[0].d;
      const nx = -DX[side];
      const nz = -DY[side];
      const cxm = (minX + maxX) / 2;
      const czm = (minZ + maxZ) / 2;
      const bx = side === 0 ? maxX : side === 1 ? minX : cxm;
      const bz = side === 2 ? maxZ : side === 3 ? minZ : czm;
      const bw = Math.min(sides[0].len - 1.6, 5.5);
      const board = new THREE.Mesh(new THREE.PlaneGeometry(bw, bw * 0.375), boardMat);
      board.position.set(bx + nx * 0.02, 1.55, bz + nz * 0.02);
      board.rotation.y = Math.atan2(nx, nz);
      this.group.add(board);
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
      mesh.position.set(p.x, 0.25, p.z);
      this.group.add(mesh);
      this.items.push({ type, mesh, x: p.x, z: p.z, y: 0.25, taken: false, phase: r.next() * 10 });
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
    for (const it of this.items) {
      if (it.taken || it.type === 'note') continue;
      it.mesh.position.y = it.y + Math.sin(time * 2 + it.phase) * 0.05;
      it.mesh.rotation.y = time * 0.8 + it.phase;
      if (it.mesh.userData.glow) it.mesh.userData.glow.material.opacity = 0.4 + Math.sin(time * 3 + it.phase) * 0.15;
    }
  }

  setFixture(i, b) {
    const col = this.panelMesh.geometry.attributes.color;
    const c = this.panelColor;
    const v = 0.06 + b * 0.94;
    for (let k = 0; k < 4; k++) col.setXYZ(i * 4 + k, c.r * v, c.g * v, c.b * v);
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
  }
}
