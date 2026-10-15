// 모든 텍스처는 캔버스로 절차 생성한다. 에셋 파일 없음.
import * as THREE from 'three';
import { RNG } from './rng.js';

const rng = new RNG(1996);

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function grain(ctx, w, h, amount) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rng.next() - 0.5) * amount;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

// 얼룩: 반투명 원을 여러 개 겹쳐 불규칙한 모양을 만든다
function stains(ctx, w, h, count, color, maxR, alpha) {
  for (let i = 0; i < count; i++) {
    const x = rng.next() * w;
    const y = rng.next() * h;
    const r = maxR * (0.3 + rng.next() * 0.7);
    for (let j = 0; j < 6; j++) {
      const ox = x + (rng.next() - 0.5) * r;
      const oy = y + (rng.next() - 0.5) * r;
      const rr = r * (0.3 + rng.next() * 0.6);
      // 타일 경계에서 끊기지 않도록 래핑해서 그린다
      for (const dx of [-w, 0, w]) {
        for (const dy of [-h, 0, h]) {
          const g = ctx.createRadialGradient(ox + dx, oy + dy, 0, ox + dx, oy + dy, rr);
          g.addColorStop(0, `rgba(${color},${alpha})`);
          g.addColorStop(1, `rgba(${color},0)`);
          ctx.fillStyle = g;
          ctx.fillRect(ox + dx - rr, oy + dy - rr, rr * 2, rr * 2);
        }
      }
    }
  }
}

function toTex(c, aniso, { repeat = true, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  return t;
}

function wallpaper() {
  const S = 512;
  const [c, x] = canvas(S, S);
  x.fillStyle = '#c4ad5a';
  x.fillRect(0, 0, S, S);
  // 세로 줄무늬
  for (let i = 0; i < 8; i++) {
    const px = i * 64;
    x.fillStyle = 'rgba(120,96,30,0.22)';
    x.fillRect(px, 0, 10, S);
    x.fillStyle = 'rgba(255,240,170,0.18)';
    x.fillRect(px + 12, 0, 3, S);
  }
  // 줄 사이 다이아몬드 무늬
  x.fillStyle = 'rgba(110,90,30,0.16)';
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      const cx = i * 64 + 40;
      const cy = j * 64 + (i % 2) * 32 + 16;
      x.beginPath();
      x.moveTo(cx, cy - 9);
      x.lineTo(cx + 6, cy);
      x.lineTo(cx, cy + 9);
      x.lineTo(cx - 6, cy);
      x.closePath();
      x.fill();
    }
  }
  stains(x, S, S, 5, '110,85,25', 90, 0.07);
  stains(x, S, S, 3, '80,70,30', 50, 0.09);
  grain(x, S, S, 18);
  return c;
}

// 노란 장판: 얼룩 없이 고른 색, 아주 고운 표면 결, 장판 이음매만 희미하게 (2m 한 장)
function vinyl() {
  const S = 512;
  const [c, x] = canvas(S, S);
  x.fillStyle = '#d6b55a';
  x.fillRect(0, 0, S, S);
  // 한지처럼 고운 결 (거의 보이지 않을 정도)
  for (let i = 0; i < 9000; i++) {
    x.fillStyle = rng.next() > 0.5 ? 'rgba(240,215,130,0.12)' : 'rgba(150,120,50,0.1)';
    x.fillRect(rng.next() * S, rng.next() * S, 1 + rng.next() * 4, 1);
  }
  grain(x, S, S, 6);
  // 장판 이음매
  x.fillStyle = 'rgba(120,95,40,0.35)';
  x.fillRect(0, 0, 2, S);
  x.fillStyle = 'rgba(255,240,190,0.25)';
  x.fillRect(2, 0, 1, S);
  return c;
}

function ceiling() {
  const S = 512;
  const [c, x] = canvas(S, S);
  x.fillStyle = '#d9d3bc';
  x.fillRect(0, 0, S, S);
  // 흡음 타일 구멍
  for (let i = 0; i < 5000; i++) {
    x.fillStyle = `rgba(90,85,70,${0.15 + rng.next() * 0.3})`;
    x.fillRect(rng.next() * S, rng.next() * S, 1.5, 1.5);
  }
  stains(x, S, S, 3, '140,110,50', 70, 0.18);
  // 타일 격자 (2x2 = 1.2m)
  x.fillStyle = '#8e887a';
  for (let i = 0; i <= 2; i++) {
    x.fillRect(i * 256 - 3, 0, 6, S);
    x.fillRect(0, i * 256 - 3, S, 6);
  }
  grain(x, S, S, 14);
  return c;
}

function panel() {
  const [c, x] = canvas(256, 128);
  x.fillStyle = '#ffffff';
  x.fillRect(0, 0, 256, 128);
  // 프리즘 확산판 격자
  x.strokeStyle = 'rgba(200,200,190,0.6)';
  x.lineWidth = 1;
  for (let i = 0; i < 256; i += 8) {
    x.beginPath();
    x.moveTo(i, 0);
    x.lineTo(i, 128);
    x.stroke();
  }
  for (let j = 0; j < 128; j += 8) {
    x.beginPath();
    x.moveTo(0, j);
    x.lineTo(256, j);
    x.stroke();
  }
  // 안에 죽은 벌레 몇 마리
  x.fillStyle = 'rgba(40,30,20,0.5)';
  for (let i = 0; i < 4; i++) x.fillRect(20 + rng.next() * 216, 20 + rng.next() * 88, 3, 2);
  x.strokeStyle = '#777';
  x.lineWidth = 10;
  x.strokeRect(0, 0, 256, 128);
  return c;
}

function cinder() {
  const S = 512;
  const [c, x] = canvas(S, S);
  x.fillStyle = '#c9cdb6';
  x.fillRect(0, 0, S, S);
  // 블록 0.4m x 0.2m → 2m 타일에 5 x 10
  const bw = S / 5;
  const bh = S / 10;
  for (let j = 0; j < 10; j++) {
    for (let i = -1; i < 6; i++) {
      const ox = i * bw + (j % 2) * (bw / 2);
      const shade = (rng.next() - 0.5) * 14;
      x.fillStyle = `rgb(${201 + shade},${205 + shade},${182 + shade})`;
      x.fillRect(ox + 3, j * bh + 3, bw - 6, bh - 6);
    }
  }
  stains(x, S, S, 4, '90,90,70', 90, 0.12);
  // 아래쪽 때
  const g = x.createLinearGradient(0, S * 0.7, 0, S);
  g.addColorStop(0, 'rgba(60,60,50,0)');
  g.addColorStop(1, 'rgba(60,60,50,0.15)');
  x.fillStyle = g;
  x.fillRect(0, 0, S, S);
  grain(x, S, S, 16);
  return c;
}

function lino() {
  const S = 512;
  const [c, x] = canvas(S, S);
  const n = 4;
  const ts = S / n;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const dark = (i + j) % 2 === 0;
      const v = (rng.next() - 0.5) * 12;
      x.fillStyle = dark ? `rgb(${120 + v},${118 + v},${110 + v})` : `rgb(${206 + v},${200 + v},${182 + v})`;
      x.fillRect(i * ts, j * ts, ts, ts);
      // VCT 타일 특유의 반점
      for (let k = 0; k < 220; k++) {
        x.fillStyle = dark ? 'rgba(200,200,190,0.18)' : 'rgba(90,90,80,0.2)';
        x.fillRect(i * ts + rng.next() * ts, j * ts + rng.next() * ts, 2, 2);
      }
    }
  }
  x.strokeStyle = 'rgba(40,40,35,0.45)';
  x.lineWidth = 2;
  for (let i = 0; i <= n; i++) {
    x.beginPath();
    x.moveTo(i * ts, 0);
    x.lineTo(i * ts, S);
    x.stroke();
    x.beginPath();
    x.moveTo(0, i * ts);
    x.lineTo(S, i * ts);
    x.stroke();
  }
  stains(x, S, S, 5, '50,45,35', 80, 0.18);
  grain(x, S, S, 18);
  return c;
}

function chalkboard() {
  const [c, x] = canvas(1024, 384);
  x.fillStyle = '#26382b';
  x.fillRect(0, 0, 1024, 384);
  // 지우개 자국
  for (let i = 0; i < 18; i++) {
    x.fillStyle = `rgba(220,230,220,${0.03 + rng.next() * 0.05})`;
    x.beginPath();
    x.ellipse(rng.next() * 1024, rng.next() * 384, 60 + rng.next() * 120, 20 + rng.next() * 30, rng.next(), 0, Math.PI * 2);
    x.fill();
  }
  x.fillStyle = 'rgba(235,240,230,0.85)';
  x.font = 'bold 54px "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
  x.save();
  x.translate(70, 110);
  x.rotate(-0.03);
  x.fillText('1996. 10. 15  (화)', 0, 0);
  x.restore();
  x.font = '40px "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
  x.fillText('주번: 3-2', 760, 70);
  x.fillText('x² + 2x − 15 = 0', 90, 200);
  x.fillStyle = 'rgba(235,240,230,0.55)';
  x.font = '30px "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
  for (let i = 0; i < 4; i++) {
    x.fillText('나가게 해줘  나가게 해줘  나가게 해줘', 470 + (rng.next() - 0.5) * 20, 170 + i * 42);
  }
  x.fillStyle = 'rgba(255,190,190,0.7)';
  x.font = 'bold 46px "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
  x.fillText('떠들지 마시오', 90, 320);
  grain(x, 1024, 384, 14);
  // 나무 테두리
  x.strokeStyle = '#6b4a2b';
  x.lineWidth = 22;
  x.strokeRect(0, 0, 1024, 384);
  return c;
}

function locker() {
  const [c, x] = canvas(128, 512);
  x.fillStyle = '#4c6272';
  x.fillRect(0, 0, 128, 512);
  x.strokeStyle = '#2b3944';
  x.lineWidth = 4;
  x.strokeRect(4, 4, 120, 504);
  // 통풍구
  x.fillStyle = '#1d262d';
  for (let i = 0; i < 6; i++) x.fillRect(30, 30 + i * 12, 68, 5);
  for (let i = 0; i < 6; i++) x.fillRect(30, 420 + i * 12, 68, 5);
  // 손잡이, 번호판
  x.fillStyle = '#b8bec4';
  x.fillRect(96, 230, 10, 50);
  x.fillStyle = '#d6d0b0';
  x.fillRect(44, 120, 40, 20);
  x.fillStyle = '#222';
  x.font = 'bold 14px monospace';
  x.fillText(String(100 + Math.floor(rng.next() * 200)), 50, 135);
  // 녹, 긁힘
  stains(x, 128, 512, 3, '120,70,30', 40, 0.25);
  x.strokeStyle = 'rgba(200,210,220,0.25)';
  x.lineWidth = 1;
  for (let i = 0; i < 12; i++) {
    const sx = rng.next() * 128;
    const sy = rng.next() * 512;
    x.beginPath();
    x.moveTo(sx, sy);
    x.lineTo(sx + (rng.next() - 0.5) * 40, sy + (rng.next() - 0.5) * 20);
    x.stroke();
  }
  grain(x, 128, 512, 18);
  return c;
}

function wood() {
  const [c, x] = canvas(256, 256);
  x.fillStyle = '#9b7444';
  x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 60; i++) {
    x.strokeStyle = `rgba(${rng.next() > 0.5 ? '70,45,20' : '170,130,80'},0.25)`;
    x.lineWidth = 1 + rng.next() * 2;
    const y = rng.next() * 256;
    x.beginPath();
    x.moveTo(0, y);
    x.bezierCurveTo(80, y + (rng.next() - 0.5) * 12, 170, y + (rng.next() - 0.5) * 12, 256, y);
    x.stroke();
  }
  // 낙서
  x.fillStyle = 'rgba(30,30,40,0.35)';
  x.font = '18px sans-serif';
  x.fillText('살려줘', 40 + rng.next() * 120, 60 + rng.next() * 150);
  grain(x, 256, 256, 16);
  return c;
}

function door() {
  const [c, x] = canvas(256, 512);
  x.fillStyle = '#6d756a';
  x.fillRect(0, 0, 256, 512);
  x.strokeStyle = '#3e443c';
  x.lineWidth = 6;
  x.strokeRect(14, 14, 228, 484);
  // 작은 창
  x.fillStyle = '#151a18';
  x.fillRect(80, 70, 96, 120);
  x.strokeStyle = '#999';
  x.lineWidth = 3;
  x.beginPath();
  x.moveTo(80, 70);
  x.lineTo(176, 190);
  x.moveTo(176, 70);
  x.lineTo(80, 190);
  x.stroke();
  // 패닉바
  x.fillStyle = '#b5b9b0';
  x.fillRect(24, 270, 208, 22);
  x.fillStyle = '#3e443c';
  x.fillRect(24, 430, 208, 50);
  stains(x, 256, 512, 4, '90,60,30', 50, 0.25);
  grain(x, 256, 512, 20);
  return c;
}

function exitSign() {
  const [c, x] = canvas(256, 96);
  x.fillStyle = '#0f8f43';
  x.fillRect(0, 0, 256, 96);
  x.fillStyle = '#f2fff4';
  x.font = 'bold 44px "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText('비상구 EXIT', 128, 50);
  return c;
}

// 도자기 인형 얼굴. 구(sphere)의 등장방형 UV에 맞춰 그린다. 얼굴 중심은 u=0.25 (x=256).
function dollFace(scream) {
  const W = 1024;
  const H = 512;
  const [c, x] = canvas(W, H);
  const cx = 256;
  const r = new RNG(77); // 두 표정에서 금이 같은 자리에 오도록 고정
  x.fillStyle = '#ece2d4';
  x.fillRect(0, 0, W, H);
  const shade = x.createRadialGradient(cx, 280, 60, cx, 280, 300);
  shade.addColorStop(0, 'rgba(0,0,0,0)');
  shade.addColorStop(1, 'rgba(80,60,50,0.4)');
  x.fillStyle = shade;
  x.fillRect(0, 0, W, H);
  stains(x, W, H, 8, '110,90,70', 50, 0.07);

  // 머리카락: 정수리, 뒤통수, 앞머리
  const hairRects = [
    [0, 0, W, 118],
    [440, 0, W - 440, 420],
    [0, 0, 72, 420],
  ];
  x.fillStyle = '#5c2a16';
  for (const h of hairRects) x.fillRect(...h);
  for (let i = 0; i < 10; i++) {
    x.beginPath();
    x.ellipse(92 + i * 36, 122, 24, 34 + (i % 3) * 6, 0, 0, Math.PI * 2);
    x.fill();
  }
  for (const [hx, hy, hw, hh] of hairRects) {
    x.save();
    x.beginPath();
    x.rect(hx, hy, hw, hh);
    x.clip();
    for (let i = 0; i < (hw * hh) / 900; i++) {
      x.strokeStyle = r.next() > 0.5 ? 'rgba(140,70,35,0.45)' : 'rgba(25,10,5,0.45)';
      x.lineWidth = 1 + r.next() * 1.5;
      const sx = hx + r.next() * hw;
      const sy = hy + r.next() * hh;
      x.beginPath();
      x.moveTo(sx, sy);
      x.quadraticCurveTo(sx + (r.next() - 0.5) * 14, sy + 20, sx + (r.next() - 0.5) * 8, sy + 44);
      x.stroke();
    }
    x.restore();
  }

  for (const s of [-1, 1]) {
    const ex = cx + s * 64;
    const ey = 258;
    // 퀭한 눈두덩
    const sock = x.createRadialGradient(ex, ey, 24, ex, ey, 64);
    sock.addColorStop(0, 'rgba(45,25,35,0.85)');
    sock.addColorStop(1, 'rgba(60,40,50,0)');
    x.fillStyle = sock;
    x.fillRect(ex - 62, ey - 62, 124, 124);
    if (!scream) {
      x.fillStyle = '#f4f1ea';
      x.beginPath();
      x.ellipse(ex, ey, 31, 26, 0, 0, Math.PI * 2);
      x.fill();
      // 한쪽 유리눈이 살짝 어긋나 있다
      const ix = ex + (s === 1 ? 8 : -2);
      const iy = ey + 2;
      const ir = x.createRadialGradient(ix - 4, iy - 4, 2, ix, iy, 20);
      ir.addColorStop(0, '#8fb0c0');
      ir.addColorStop(0.7, '#3c5361');
      ir.addColorStop(1, '#1b252c');
      x.fillStyle = ir;
      x.beginPath();
      x.arc(ix, iy, 20, 0, Math.PI * 2);
      x.fill();
      x.fillStyle = '#050505';
      x.beginPath();
      x.arc(ix, iy, 9, 0, Math.PI * 2);
      x.fill();
      x.fillStyle = 'rgba(255,255,255,0.9)';
      x.beginPath();
      x.arc(ix - 7, iy - 8, 4.5, 0, Math.PI * 2);
      x.fill();
      // 눈꺼풀, 그려 넣은 속눈썹
      x.strokeStyle = '#1a0f0c';
      x.lineWidth = 7;
      x.beginPath();
      x.ellipse(ex, ey + 2, 33, 29, 0, Math.PI * 1.08, Math.PI * 1.92);
      x.stroke();
      x.lineWidth = 4;
      for (let k = 0; k < 8; k++) {
        const a = Math.PI * (1.12 + k * 0.1);
        const bx = ex + Math.cos(a) * 33;
        const by = ey + 2 + Math.sin(a) * 29;
        x.beginPath();
        x.moveTo(bx, by);
        x.lineTo(bx + Math.cos(a) * 14, by + Math.sin(a) * 16 - 4);
        x.stroke();
      }
      x.lineWidth = 2;
      for (let k = 0; k < 5; k++) {
        const a = Math.PI * (0.25 + k * 0.12);
        const bx = ex + Math.cos(a) * 30;
        const by = ey + Math.sin(a) * 26;
        x.beginPath();
        x.moveTo(bx, by);
        x.lineTo(bx + Math.cos(a) * 8, by + Math.sin(a) * 9);
        x.stroke();
      }
    } else {
      // 텅 빈 검은 눈과 바늘구멍 같은 눈동자
      x.fillStyle = '#030202';
      x.beginPath();
      for (let k = 0; k <= 24; k++) {
        const a = (k / 24) * Math.PI * 2;
        const j = 1 + (r.next() - 0.5) * 0.18;
        x.lineTo(ex + Math.cos(a) * 35 * j, ey + Math.sin(a) * 32 * j);
      }
      x.fill();
      x.fillStyle = '#ffffff';
      x.beginPath();
      x.arc(ex + s * 3, ey + 1, 3.5, 0, Math.PI * 2);
      x.fill();
      x.strokeStyle = 'rgba(20,10,10,0.75)';
      x.lineWidth = 4;
      x.beginPath();
      x.moveTo(ex - 6 * s, ey + 28);
      x.bezierCurveTo(ex - 9 * s, ey + 60, ex - 2 * s, ey + 82, ex - 7 * s, ey + 124);
      x.stroke();
    }
    // 높고 가는 눈썹
    x.strokeStyle = 'rgba(70,35,20,0.85)';
    x.lineWidth = 3;
    x.beginPath();
    x.arc(ex, ey + 12, 54, Math.PI * 1.32, Math.PI * 1.68);
    x.stroke();
    // 동그란 볼터치
    const ch = x.createRadialGradient(cx + s * 95, 322, 4, cx + s * 95, 322, 40);
    ch.addColorStop(0, 'rgba(215,70,80,0.45)');
    ch.addColorStop(1, 'rgba(215,70,80,0)');
    x.fillStyle = ch;
    x.fillRect(cx + s * 95 - 42, 280, 84, 84);
  }

  // 코
  x.fillStyle = 'rgba(120,80,70,0.3)';
  x.beginPath();
  x.ellipse(cx, 312, 10, 6, 0, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = 'rgba(70,40,35,0.6)';
  for (const s of [-1, 1]) {
    x.beginPath();
    x.arc(cx + s * 6, 315, 2.5, 0, Math.PI * 2);
    x.fill();
  }

  const crack = (pts, w) => {
    x.lineJoin = 'miter';
    x.strokeStyle = 'rgba(25,15,12,0.9)';
    x.lineWidth = w;
    x.beginPath();
    x.moveTo(...pts[0]);
    for (const p of pts.slice(1)) x.lineTo(...p);
    x.stroke();
    x.strokeStyle = 'rgba(255,250,240,0.35)';
    x.lineWidth = 1;
    x.beginPath();
    x.moveTo(pts[0][0] + 2, pts[0][1] + 1);
    for (const p of pts.slice(1)) x.lineTo(p[0] + 2, p[1] + 1);
    x.stroke();
  };

  if (!scream) {
    // 작고 빨간 입술. 입꼬리에서 볼 쪽으로 가는 선이 그어져 있다
    const my = 350;
    x.fillStyle = '#a3202c';
    x.beginPath();
    x.moveTo(cx - 24, my);
    x.quadraticCurveTo(cx - 12, my - 12, cx, my - 5);
    x.quadraticCurveTo(cx + 12, my - 12, cx + 24, my);
    x.quadraticCurveTo(cx, my + 4, cx - 24, my);
    x.fill();
    x.fillStyle = '#bf3540';
    x.beginPath();
    x.moveTo(cx - 22, my + 1);
    x.quadraticCurveTo(cx, my + 18, cx + 22, my + 1);
    x.quadraticCurveTo(cx, my + 5, cx - 22, my + 1);
    x.fill();
    x.strokeStyle = 'rgba(110,20,25,0.55)';
    x.lineWidth = 2;
    for (const s of [-1, 1]) {
      x.beginPath();
      x.moveTo(cx + s * 24, my);
      x.quadraticCurveTo(cx + s * 48, my - 6, cx + s * 66, my - 26);
      x.stroke();
    }
  } else {
    // 찢어지듯 벌어진 입
    const my = 372;
    x.fillStyle = '#9e222c';
    x.beginPath();
    x.ellipse(cx, my, 54, 74, 0, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = '#040202';
    x.beginPath();
    for (let k = 0; k <= 30; k++) {
      const a = (k / 30) * Math.PI * 2;
      const j = 1 + (r.next() - 0.5) * 0.12;
      x.lineTo(cx + Math.cos(a) * 45 * j, my + Math.sin(a) * 64 * j);
    }
    x.fill();
    x.fillStyle = '#e6dcc6';
    for (let k = -3; k <= 3; k++) {
      x.fillRect(cx + k * 11 - 4, my - 62 + Math.abs(k) * 4, 8, 13);
      x.fillRect(cx + k * 11 - 4, my + 50 - Math.abs(k) * 4, 8, 11);
    }
    crack([[cx - 52, my - 6], [cx - 74, my - 18], [cx - 86, my - 8], [cx - 110, my - 22]], 2.5);
    crack([[cx + 52, my - 4], [cx + 70, my + 10], [cx + 92, my + 2], [cx + 108, my + 20]], 2.5);
  }

  // 금 간 도자기, 떨어져 나간 조각
  crack([[214, 150], [205, 180], [218, 205], [200, 228], [196, 240]], 2.5);
  crack([[205, 180], [180, 190], [165, 186]], 1.5);
  crack([[196, 282], [186, 302], [192, 322], [178, 350], [184, 378]], 2);
  crack([[340, 172], [328, 196], [338, 214], [322, 232]], 2);
  x.fillStyle = '#2a201b';
  x.beginPath();
  x.moveTo(352, 166);
  x.lineTo(374, 176);
  x.lineTo(368, 198);
  x.lineTo(350, 204);
  x.lineTo(343, 186);
  x.closePath();
  x.fill();
  x.strokeStyle = '#bfb2a0';
  x.lineWidth = 1.5;
  x.stroke();
  grain(x, W, H, 10);
  return c;
}

function dress() {
  const [c, x] = canvas(256, 256);
  x.fillStyle = '#d9cfbd';
  x.fillRect(0, 0, 256, 256);
  // 주름
  for (let i = 0; i < 16; i++) {
    const px = i * 16 + rng.next() * 6;
    const g = x.createLinearGradient(px, 0, px + 16, 0);
    g.addColorStop(0, 'rgba(90,75,60,0)');
    g.addColorStop(0.5, 'rgba(90,75,60,0.2)');
    g.addColorStop(1, 'rgba(90,75,60,0)');
    x.fillStyle = g;
    x.fillRect(px, 0, 16, 256);
  }
  // 빛바랜 붉은 리본 띠와 레이스 밑단
  x.fillStyle = 'rgba(140,40,45,0.75)';
  x.fillRect(0, 194, 256, 10);
  x.fillStyle = '#ece6d8';
  x.fillRect(0, 214, 256, 42);
  x.fillStyle = 'rgba(80,70,60,0.45)';
  for (let i = 0; i < 16; i++) {
    x.beginPath();
    x.arc(i * 16 + 8, 226, 3, 0, Math.PI * 2);
    x.arc(i * 16 + 16, 240, 3, 0, Math.PI * 2);
    x.fill();
  }
  stains(x, 256, 256, 5, '110,85,55', 40, 0.18);
  stains(x, 256, 256, 2, '90,35,25', 26, 0.22);
  grain(x, 256, 256, 14);
  return c;
}

function hair() {
  const [c, x] = canvas(128, 128);
  x.fillStyle = '#5c2a16';
  x.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 220; i++) {
    x.strokeStyle = rng.next() > 0.5 ? 'rgba(140,70,35,0.5)' : 'rgba(25,10,5,0.5)';
    x.lineWidth = 1 + rng.next();
    const sx = rng.next() * 128;
    const sy = rng.next() * 128;
    x.beginPath();
    x.moveTo(sx, sy);
    x.quadraticCurveTo(sx + (rng.next() - 0.5) * 10, sy + 12, sx + (rng.next() - 0.5) * 6, sy + 26);
    x.stroke();
  }
  return c;
}

// 하운드 얼굴. 구의 등장방형 UV에 맞춰 그린다 (얼굴 중심 u=0.25).
// 눈이 있어야 할 자리는 움푹 꺼진 구멍이고, 입은 귀까지 찢어져 웃고 있다.
function houndFace(scream) {
  const W = 1024;
  const H = 512;
  const [c, x] = canvas(W, H);
  const cx = 256;
  const r = new RNG(55);
  x.fillStyle = '#c99c8c';
  x.fillRect(0, 0, W, H);
  const shade = x.createRadialGradient(cx, 280, 60, cx, 280, 300);
  shade.addColorStop(0, 'rgba(0,0,0,0)');
  shade.addColorStop(1, 'rgba(70,35,30,0.45)');
  x.fillStyle = shade;
  x.fillRect(0, 0, W, H);
  stains(x, W, H, 10, '140,80,80', 50, 0.12);
  // 머리카락에 덮이는 정수리와 뒤통수
  x.fillStyle = '#0d0a09';
  x.fillRect(0, 0, W, 110);
  x.fillRect(440, 0, W - 440, H);
  x.fillRect(0, 0, 76, H);

  // 이마 주름
  x.strokeStyle = 'rgba(90,50,45,0.45)';
  x.lineWidth = 2;
  for (let i = 0; i < 5; i++) {
    x.beginPath();
    for (let k = 0; k <= 10; k++) {
      const px = cx - 80 + k * 16;
      const py = 150 + i * 13 + Math.sin(k * 0.9 + i) * 3 + (r.next() - 0.5) * 2;
      if (k === 0) x.moveTo(px, py);
      else x.lineTo(px, py);
    }
    x.stroke();
  }

  for (const s of [-1, 1]) {
    // 눈이 없는, 움푹 꺼진 구멍
    const ex = cx + s * 58;
    const ey = 252;
    const g = x.createRadialGradient(ex, ey, 2, ex, ey, 62);
    g.addColorStop(0, 'rgba(8,3,3,1)');
    g.addColorStop(0.35, 'rgba(25,8,8,0.95)');
    g.addColorStop(0.65, 'rgba(70,30,30,0.55)');
    g.addColorStop(1, 'rgba(70,30,30,0)');
    x.fillStyle = g;
    x.fillRect(ex - 64, ey - 64, 128, 128);
    x.strokeStyle = 'rgba(80,40,38,0.6)';
    x.lineWidth = 2;
    for (let k = 0; k < 3; k++) {
      x.beginPath();
      x.arc(ex, ey + 6, 36 + k * 9, Math.PI * 0.15, Math.PI * 0.85);
      x.stroke();
    }
    // 홀쭉하게 꺼진 볼
    const ch = x.createLinearGradient(cx + s * 70, 0, cx + s * 120, 0);
    ch.addColorStop(0, 'rgba(60,25,25,0)');
    ch.addColorStop(1, 'rgba(60,25,25,0.35)');
    x.fillStyle = ch;
    x.fillRect(Math.min(cx + s * 70, cx + s * 120), 285, 50, 90);
  }
  // 콧구멍
  x.fillStyle = 'rgba(30,10,10,0.85)';
  for (const s of [-1, 1]) {
    x.beginPath();
    x.ellipse(cx + s * 8, 308, 3, 6, s * 0.3, 0, Math.PI * 2);
    x.fill();
  }

  const my = 350;
  if (!scream) {
    // 귀까지 찢어진 웃음
    x.fillStyle = '#2a0b0b';
    x.beginPath();
    x.moveTo(cx - 128, my - 22);
    x.quadraticCurveTo(cx, my + 44, cx + 128, my - 22);
    x.quadraticCurveTo(cx, my + 6, cx - 128, my - 22);
    x.fill();
    x.fillStyle = '#d6c79c';
    for (let k = -9; k <= 9; k++) {
      const t = k / 9;
      const px = cx + t * 112;
      const top = my - 18 * t * t + 6 + 10 * (1 - t * t);
      const h = 8 + 10 * (1 - t * t);
      x.fillRect(px - 4, top - h * 0.55, 8, h * 0.5);
      x.fillRect(px - 4, top + 2, 8, h * 0.45);
    }
    x.strokeStyle = '#5e2424';
    x.lineWidth = 3;
    x.beginPath();
    x.moveTo(cx - 128, my - 22);
    x.quadraticCurveTo(cx, my + 44, cx + 128, my - 22);
    x.stroke();
    x.beginPath();
    x.moveTo(cx - 128, my - 22);
    x.quadraticCurveTo(cx, my + 6, cx + 128, my - 22);
    x.stroke();
    x.lineWidth = 2;
    x.strokeStyle = 'rgba(90,40,38,0.6)';
    for (const s of [-1, 1]) {
      x.beginPath();
      x.moveTo(cx + s * 128, my - 22);
      x.quadraticCurveTo(cx + s * 146, my - 40, cx + s * 150, my - 66);
      x.stroke();
    }
  } else {
    // 턱이 빠질 듯 벌어진 입
    x.fillStyle = '#5e2424';
    x.beginPath();
    x.ellipse(cx, my + 24, 70, 104, 0, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = '#120404';
    x.beginPath();
    for (let k = 0; k <= 32; k++) {
      const a = (k / 32) * Math.PI * 2;
      const j = 1 + (r.next() - 0.5) * 0.1;
      x.lineTo(cx + Math.cos(a) * 60 * j, my + 24 + Math.sin(a) * 94 * j);
    }
    x.fill();
    x.fillStyle = '#d6c79c';
    for (let k = -4; k <= 4; k++) {
      x.fillRect(cx + k * 12 - 4, my - 70 + Math.abs(k) * 5, 8, 16);
      x.fillRect(cx + k * 12 - 4, my + 104 - Math.abs(k) * 5, 8, 14);
    }
    x.strokeStyle = 'rgba(70,30,28,0.7)';
    x.lineWidth = 2;
    for (const s of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        x.beginPath();
        x.moveTo(cx + s * 66, my + k * 30 - 10);
        x.lineTo(cx + s * (110 + k * 8), my + k * 34 - 30);
        x.stroke();
      }
    }
  }
  grain(x, W, H, 14);
  return c;
}

// 하운드 피부: 핏기 없는 살색, 멍, 비치는 핏줄과 갈비뼈
function houndSkin() {
  const S = 256;
  const [c, x] = canvas(S, S);
  x.fillStyle = '#c99a8a';
  x.fillRect(0, 0, S, S);
  stains(x, S, S, 8, '150,85,90', 50, 0.18);
  stains(x, S, S, 5, '110,70,60', 30, 0.2);
  for (let i = 0; i < 9; i++) {
    const y = 20 + i * 26;
    const g = x.createLinearGradient(0, y - 6, 0, y + 6);
    g.addColorStop(0, 'rgba(60,40,40,0)');
    g.addColorStop(0.5, 'rgba(60,40,40,0.25)');
    g.addColorStop(1, 'rgba(60,40,40,0)');
    x.fillStyle = g;
    x.fillRect(0, y - 6, S, 12);
  }
  x.lineWidth = 1.2;
  for (let i = 0; i < 26; i++) {
    x.strokeStyle = `rgba(${rng.next() > 0.5 ? '90,60,110' : '110,40,50'},0.45)`;
    let px = rng.next() * S;
    let py = rng.next() * S;
    x.beginPath();
    x.moveTo(px, py);
    for (let k = 0; k < 6; k++) {
      px += (rng.next() - 0.5) * 30;
      py += (rng.next() - 0.5) * 30;
      x.lineTo(px, py);
    }
    x.stroke();
  }
  grain(x, S, S, 22);
  return c;
}

// ---------- LEVEL 2 · 풀룸 ----------
// 작은 정사각 타일. size=타일 한 장(px), base=타일 색, grout=줄눈 색
function tiles(S, n, base, grout, jitter, dirt) {
  const [c, x] = canvas(S, S);
  x.fillStyle = grout;
  x.fillRect(0, 0, S, S);
  const ts = S / n;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const v = (rng.next() - 0.5) * jitter;
      x.fillStyle = `rgb(${base[0] + v},${base[1] + v},${base[2] + v})`;
      x.fillRect(i * ts + 1.5, j * ts + 1.5, ts - 3, ts - 3);
      // 유약 반사
      x.fillStyle = 'rgba(255,255,255,0.08)';
      x.fillRect(i * ts + 3, j * ts + 3, ts * 0.45, 2);
    }
  }
  stains(x, S, S, dirt, '90,110,100', 60, 0.08);
  grain(x, S, S, 8);
  return c;
}

function water() {
  const S = 256;
  const [c, x] = canvas(S, S);
  x.fillStyle = '#7fb7c2';
  x.fillRect(0, 0, S, S);
  // 물결 선 (위아래로 이어지도록 sin 주기를 맞춘다)
  for (let k = 0; k < 26; k++) {
    const y0 = rng.next() * S;
    const amp = 3 + rng.next() * 6;
    const ph = rng.next() * Math.PI * 2;
    x.strokeStyle = `rgba(235,255,255,${0.12 + rng.next() * 0.22})`;
    x.lineWidth = 1 + rng.next() * 2;
    for (const oy of [-S, 0, S]) {
      x.beginPath();
      for (let px = 0; px <= S; px += 4) {
        const py = y0 + oy + Math.sin((px / S) * Math.PI * 2 * 2 + ph) * amp;
        if (px === 0) x.moveTo(px, py);
        else x.lineTo(px, py);
      }
      x.stroke();
    }
  }
  return c;
}

function ripple() {
  const [c, x] = canvas(128, 128);
  const g = x.createRadialGradient(64, 64, 40, 64, 64, 63);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.75, 'rgba(255,255,255,0.25)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  return c;
}

// 익사체 피부: 물에 불어 쭈글쭈글하고 푸르스름한 살갗
function drownedSkin() {
  const S = 256;
  const [c, x] = canvas(S, S);
  x.fillStyle = '#97a39f';
  x.fillRect(0, 0, S, S);
  stains(x, S, S, 10, '80,100,110', 46, 0.2);
  stains(x, S, S, 6, '120,90,95', 30, 0.18);
  x.lineWidth = 1;
  for (let i = 0; i < 70; i++) {
    x.strokeStyle = `rgba(${rng.next() > 0.5 ? '70,80,90' : '200,210,205'},0.25)`;
    const y = rng.next() * S;
    x.beginPath();
    x.moveTo(0, y);
    for (let px = 0; px <= S; px += 16) x.lineTo(px, y + (rng.next() - 0.5) * 6);
    x.stroke();
  }
  for (let i = 0; i < 18; i++) {
    x.strokeStyle = 'rgba(60,70,120,0.4)';
    let px = rng.next() * S;
    let py = rng.next() * S;
    x.beginPath();
    x.moveTo(px, py);
    for (let k = 0; k < 6; k++) {
      px += (rng.next() - 0.5) * 30;
      py += (rng.next() - 0.5) * 30;
      x.lineTo(px, py);
    }
    x.stroke();
  }
  grain(x, S, S, 18);
  return c;
}

// 익사체 얼굴: 구의 등장방형 UV (얼굴 중심 u=0.25). 머리가 거꾸로 매달리므로 화면에서는 뒤집혀 보인다.
// 눈이 있어야 할 자리는 검게 꺼진 구멍, 입은 코 밑에서 턱까지 세로로 찢어져 있다
function drownedFace(scream) {
  const W = 1024;
  const H = 512;
  const [c, x] = canvas(W, H);
  const cx = 256;
  const r = new RNG(31);
  x.fillStyle = '#9aa6a3';
  x.fillRect(0, 0, W, H);
  const shade = x.createRadialGradient(cx, 260, 50, cx, 260, 300);
  shade.addColorStop(0, 'rgba(0,0,0,0)');
  shade.addColorStop(1, 'rgba(25,35,45,0.6)');
  x.fillStyle = shade;
  x.fillRect(0, 0, W, H);
  stains(x, W, H, 12, '60,80,100', 50, 0.2);
  stains(x, W, H, 6, '110,80,90', 30, 0.2);
  // 비치는 핏줄
  x.lineWidth = 1.5;
  for (let i = 0; i < 40; i++) {
    x.strokeStyle = `rgba(${r.next() > 0.5 ? '50,60,120' : '90,40,60'},0.45)`;
    let px = r.next() * 520;
    let py = r.next() * H;
    x.beginPath();
    x.moveTo(px, py);
    for (let k = 0; k < 7; k++) {
      px += (r.next() - 0.5) * 34;
      py += (r.next() - 0.5) * 34;
      x.lineTo(px, py);
    }
    x.stroke();
  }
  // 퀭하게 꺼진 눈구멍 (아주 작은 빛만 남아 있다)
  for (const s of [-1, 1]) {
    const ex = cx + s * 58;
    const ey = 230;
    const g = x.createRadialGradient(ex, ey, 2, ex, ey, 54);
    g.addColorStop(0, 'rgba(2,2,4,1)');
    g.addColorStop(0.45, 'rgba(10,8,12,0.95)');
    g.addColorStop(0.75, 'rgba(40,40,55,0.5)');
    g.addColorStop(1, 'rgba(40,40,55,0)');
    x.fillStyle = g;
    x.beginPath();
    x.ellipse(ex, ey, 54, 46, s * 0.25, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = scream ? 'rgba(255,255,255,0.95)' : 'rgba(220,230,220,0.6)';
    x.beginPath();
    x.arc(ex + s * 4, ey + 6, scream ? 4 : 2.5, 0, Math.PI * 2);
    x.fill();
  }
  // 콧구멍만 남은 코
  x.fillStyle = 'rgba(15,10,12,0.9)';
  for (const s of [-1, 1]) {
    x.beginPath();
    x.ellipse(cx + s * 9, 300, 4, 9, s * 0.3, 0, Math.PI * 2);
    x.fill();
  }
  // 세로로 찢어진 입: 가장자리에 이빨이 촘촘하다
  const top = 318;
  const bot = scream ? 500 : 440;
  const half = scream ? 46 : 14;
  x.fillStyle = '#4a1e24';
  x.beginPath();
  x.ellipse(cx, (top + bot) / 2, half + 10, (bot - top) / 2 + 6, 0, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = '#070304';
  x.beginPath();
  x.moveTo(cx, top);
  for (let k = 0; k <= 20; k++) {
    const t = k / 20;
    x.lineTo(cx + Math.sin(t * Math.PI) * half * (1 + (r.next() - 0.5) * 0.2), top + (bot - top) * t);
  }
  for (let k = 20; k >= 0; k--) {
    const t = k / 20;
    x.lineTo(cx - Math.sin(t * Math.PI) * half * (1 + (r.next() - 0.5) * 0.2), top + (bot - top) * t);
  }
  x.fill();
  x.fillStyle = '#cfc6a6';
  const n = scream ? 9 : 7;
  for (let k = 0; k < n; k++) {
    const t = (k + 0.5) / n;
    const w = Math.sin(t * Math.PI) * half;
    const y = top + (bot - top) * t;
    const tl = scream ? 22 : 9;
    x.beginPath();
    x.moveTo(cx - w - 2, y - 6);
    x.lineTo(cx - w + tl, y);
    x.lineTo(cx - w - 2, y + 6);
    x.fill();
    x.beginPath();
    x.moveTo(cx + w + 2, y - 6);
    x.lineTo(cx + w - tl, y);
    x.lineTo(cx + w + 2, y + 6);
    x.fill();
  }
  // 정수리 쪽 젖은 머리카락 몇 가닥
  x.strokeStyle = 'rgba(15,18,20,0.8)';
  for (let i = 0; i < 40; i++) {
    const sx = 60 + r.next() * 400;
    x.lineWidth = 1 + r.next() * 1.5;
    x.beginPath();
    x.moveTo(sx, 40 + r.next() * 30);
    x.bezierCurveTo(sx + (r.next() - 0.5) * 30, 90, sx + (r.next() - 0.5) * 40, 130, sx + (r.next() - 0.5) * 50, 120 + r.next() * 40);
    x.stroke();
  }
  grain(x, W, H, 14);
  return c;
}

// ---------- 소품 ----------
// 천장 환기구 그릴
function vent() {
  const [c, x] = canvas(128, 128);
  x.fillStyle = '#c9c4b4';
  x.fillRect(0, 0, 128, 128);
  x.fillStyle = '#2a2722';
  for (let i = 0; i < 9; i++) x.fillRect(14, 14 + i * 11.5, 100, 6);
  x.strokeStyle = '#8f8a7c';
  x.lineWidth = 6;
  x.strokeRect(3, 3, 122, 122);
  stains(x, 128, 128, 2, '60,55,40', 30, 0.3);
  grain(x, 128, 128, 14);
  return c;
}

// 복도 게시판: 코르크판에 압정으로 꽂힌 종이들
function corkboard() {
  const [c, x] = canvas(384, 256);
  x.fillStyle = '#9c7446';
  x.fillRect(0, 0, 384, 256);
  for (let i = 0; i < 2500; i++) {
    x.fillStyle = rng.next() > 0.5 ? 'rgba(70,45,20,0.35)' : 'rgba(200,160,110,0.3)';
    x.fillRect(rng.next() * 384, rng.next() * 256, 2, 2);
  }
  const papers = [
    ['가정통신문', '#ece6d2'],
    ['급식 안내', '#f3e7a8'],
    ['3-2 청소당번', '#dfe9f0'],
    ['분실물', '#f1d9d9'],
    ['', '#ece6d2'],
  ];
  papers.forEach(([title, col], i) => {
    const px = 22 + (i % 3) * 120 + rng.range(-8, 8);
    const py = 22 + Math.floor(i / 3) * 112 + rng.range(-6, 6);
    x.save();
    x.translate(px + 45, py + 45);
    x.rotate(rng.range(-0.08, 0.08));
    x.fillStyle = col;
    x.fillRect(-45, -45, 90, 96);
    x.fillStyle = 'rgba(30,30,40,0.8)';
    x.font = 'bold 13px "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
    x.fillText(title, -38, -26);
    x.fillStyle = 'rgba(30,30,40,0.35)';
    for (let k = 0; k < 6; k++) x.fillRect(-38, -14 + k * 9, 60 + rng.next() * 16, 2);
    x.fillStyle = '#c0392b';
    x.beginPath();
    x.arc(0, -40, 4, 0, Math.PI * 2);
    x.fill();
    x.restore();
  });
  x.strokeStyle = '#5b3f22';
  x.lineWidth = 12;
  x.strokeRect(0, 0, 384, 256);
  grain(x, 384, 256, 12);
  return c;
}

// 교실 시계: 3시 14분에 멈춰 있다
function clockFace() {
  const [c, x] = canvas(256, 256);
  x.fillStyle = '#f2efe6';
  x.beginPath();
  x.arc(128, 128, 124, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = '#1d1c1a';
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    const long = i % 5 === 0;
    x.save();
    x.translate(128 + Math.sin(a) * 108, 128 - Math.cos(a) * 108);
    x.rotate(a);
    x.fillRect(-(long ? 3 : 1), -(long ? 10 : 5), long ? 6 : 2, long ? 20 : 10);
    x.restore();
  }
  x.font = 'bold 26px sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  for (let h = 1; h <= 12; h++) {
    const a = (h / 12) * Math.PI * 2;
    x.fillText(String(h), 128 + Math.sin(a) * 82, 128 - Math.cos(a) * 82);
  }
  const hand = (a, len, w) => {
    x.save();
    x.translate(128, 128);
    x.rotate(a);
    x.fillRect(-w / 2, -len, w, len + 12);
    x.restore();
  };
  hand(((3 + 14 / 60) / 12) * Math.PI * 2, 56, 8);
  hand((14 / 60) * Math.PI * 2, 88, 5);
  x.fillStyle = '#b3261e';
  hand((0 / 60) * Math.PI * 2, 96, 2);
  x.beginPath();
  x.arc(128, 128, 7, 0, Math.PI * 2);
  x.fill();
  // 유리 반사
  const g = x.createLinearGradient(40, 20, 180, 200);
  g.addColorStop(0, 'rgba(255,255,255,0.35)');
  g.addColorStop(0.4, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.beginPath();
  x.arc(128, 128, 120, 0, Math.PI * 2);
  x.fill();
  return c;
}

// 교실 미닫이문: 나무 판에 위쪽 유리창
function classDoor() {
  const [c, x] = canvas(256, 512);
  x.fillStyle = '#a07c52';
  x.fillRect(0, 0, 256, 512);
  for (let i = 0; i < 40; i++) {
    x.strokeStyle = `rgba(${rng.next() > 0.5 ? '70,48,25' : '190,150,100'},0.2)`;
    x.lineWidth = 1 + rng.next() * 2;
    const px = rng.next() * 256;
    x.beginPath();
    x.moveTo(px, 0);
    x.bezierCurveTo(px + (rng.next() - 0.5) * 12, 170, px + (rng.next() - 0.5) * 12, 340, px, 512);
    x.stroke();
  }
  x.fillStyle = '#20262a';
  x.fillRect(40, 50, 176, 170);
  x.fillStyle = 'rgba(160,190,210,0.18)';
  x.fillRect(48, 58, 70, 154);
  x.strokeStyle = '#5c4228';
  x.lineWidth = 12;
  x.strokeRect(40, 50, 176, 170);
  x.beginPath();
  x.moveTo(128, 50);
  x.lineTo(128, 220);
  x.stroke();
  x.fillStyle = '#c9ccce';
  x.fillRect(206, 270, 14, 60);
  x.strokeStyle = '#5c4228';
  x.lineWidth = 8;
  x.strokeRect(4, 4, 248, 504);
  stains(x, 256, 512, 3, '60,40,20', 40, 0.2);
  grain(x, 256, 512, 14);
  return c;
}

// 학급 표지판. 전부 3-2다
function classPlate() {
  const [c, x] = canvas(256, 96);
  x.fillStyle = '#f2f0e8';
  x.fillRect(0, 0, 256, 96);
  x.strokeStyle = '#1f3d6b';
  x.lineWidth = 8;
  x.strokeRect(4, 4, 248, 88);
  x.fillStyle = '#1f3d6b';
  x.font = 'bold 54px "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText('3 - 2', 128, 52);
  stains(x, 256, 96, 2, '120,100,60', 30, 0.2);
  return c;
}

// 수영장 데크 배수구
function drain() {
  const [c, x] = canvas(128, 128);
  x.clearRect(0, 0, 128, 128);
  x.fillStyle = '#9aa3a2';
  x.beginPath();
  x.arc(64, 64, 62, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = '#111516';
  for (let i = -4; i <= 4; i++) {
    const w = Math.sqrt(Math.max(0, 50 * 50 - (i * 11) ** 2)) * 2;
    x.fillRect(64 - w / 2, 64 + i * 11 - 3, w, 6);
  }
  x.strokeStyle = '#6d7675';
  x.lineWidth = 6;
  x.beginPath();
  x.arc(64, 64, 58, 0, Math.PI * 2);
  x.stroke();
  return c;
}

// 수심 표시 페인트
function depthMark() {
  const [c, x] = canvas(256, 96);
  x.clearRect(0, 0, 256, 96);
  x.fillStyle = 'rgba(30,60,120,0.85)';
  x.font = 'bold 64px "Arial Narrow", sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText('1.0 M', 128, 52);
  return c;
}

// 접촉 그림자용 세로 그라디언트 (아래 v=0 이 진하고 위로 갈수록 사라진다). alphaMap으로 쓴다
function aoGradient() {
  const [c, x] = canvas(4, 128);
  const g = x.createLinearGradient(0, 128, 0, 0);
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    const v = Math.round(255 * Math.pow(1 - t, 1.8));
    g.addColorStop(t, `rgb(${v},${v},${v})`);
  }
  x.fillStyle = g;
  x.fillRect(0, 0, 4, 128);
  return c;
}

// 수영장 바닥에 일렁이는 물빛(코스틱). 정수 배 주파수만 써서 이어 붙여도 이음매가 없다
function caustics() {
  const S = 256;
  const [c, x] = canvas(S, S);
  const img = x.createImageData(S, S);
  const T = Math.PI * 2;
  for (let j = 0; j < S; j++) {
    for (let i = 0; i < S; i++) {
      const u = (i / S) * T;
      const w = (j / S) * T;
      const a = 1 - Math.abs(Math.sin(u * 3 + Math.sin(w * 2 + Math.sin(u * 1)) * 1.6));
      const b = 1 - Math.abs(Math.sin(w * 3 + Math.sin(u * 2 + Math.sin(w * 1)) * 1.6));
      const v = Math.min(1, Math.pow(a, 9) + Math.pow(b, 9));
      const k = (j * S + i) * 4;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = Math.round(v * 255);
      img.data[k + 3] = 255;
    }
  }
  x.putImageData(img, 0, 0);
  return c;
}

// 잔물결 노멀맵: 높이장 h(x,y) 를 정수 배 사인파로 만들고 기울기로 법선을 구한다
function waterNormal() {
  const S = 256;
  const [c, x] = canvas(S, S);
  const img = x.createImageData(S, S);
  const T = Math.PI * 2;
  const waves = [
    [3, 1, 0.0, 1.0],
    [-2, 4, 1.3, 0.7],
    [5, -3, 2.1, 0.45],
    [1, 6, 0.4, 0.35],
  ];
  for (let j = 0; j < S; j++) {
    for (let i = 0; i < S; i++) {
      let dx = 0;
      let dy = 0;
      for (const [fx, fy, ph, amp] of waves) {
        const p = (fx * i + fy * j) * (T / S) + ph;
        const d = Math.cos(p) * amp;
        dx += d * fx;
        dy += d * fy;
      }
      const nx = -dx * 0.06;
      const ny = -dy * 0.06;
      const l = Math.hypot(nx, ny, 1);
      const k = (j * S + i) * 4;
      img.data[k] = Math.round(((nx / l) * 0.5 + 0.5) * 255);
      img.data[k + 1] = Math.round(((ny / l) * 0.5 + 0.5) * 255);
      img.data[k + 2] = Math.round(((1 / l) * 0.5 + 0.5) * 255);
      img.data[k + 3] = 255;
    }
  }
  x.putImageData(img, 0, 0);
  return c;
}

function glow() {
  const [c, x] = canvas(128, 128);
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  return c;
}

function paper() {
  const [c, x] = canvas(128, 160);
  x.fillStyle = '#e8e2cc';
  x.fillRect(0, 0, 128, 160);
  x.strokeStyle = 'rgba(80,110,160,0.4)';
  for (let i = 1; i < 12; i++) {
    x.beginPath();
    x.moveTo(8, i * 13);
    x.lineTo(120, i * 13);
    x.stroke();
  }
  x.strokeStyle = 'rgba(30,30,40,0.75)';
  x.lineWidth = 1.5;
  for (let i = 1; i < 10; i++) {
    x.beginPath();
    let px = 12;
    x.moveTo(px, i * 13 - 3);
    while (px < 100 + rng.next() * 15) {
      px += 4;
      x.lineTo(px, i * 13 - 3 + (rng.next() - 0.5) * 4);
    }
    x.stroke();
  }
  stains(x, 128, 160, 2, '120,90,40', 30, 0.3);
  return c;
}

export function makeTextures(renderer) {
  const a = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return {
    wallpaper: toTex(wallpaper(), a),
    vinyl: toTex(vinyl(), a),
    ceiling: toTex(ceiling(), a),
    panel: toTex(panel(), a, { repeat: false }),
    cinder: toTex(cinder(), a),
    lino: toTex(lino(), a),
    chalkboard: toTex(chalkboard(), a, { repeat: false }),
    locker: toTex(locker(), a),
    wood: toTex(wood(), a),
    door: toTex(door(), a, { repeat: false }),
    exitSign: toTex(exitSign(), a, { repeat: false }),
    dollFace: toTex(dollFace(false), a, { repeat: false }),
    dollScream: toTex(dollFace(true), a, { repeat: false }),
    dress: toTex(dress(), a),
    hair: toTex(hair(), a),
    houndSkin: toTex(houndSkin(), a),
    houndFace: toTex(houndFace(false), a, { repeat: false }),
    houndScream: toTex(houndFace(true), a, { repeat: false }),
    poolTile: toTex(tiles(512, 10, [226, 232, 230], '#9fa9a6', 10, 3), a),
    poolDeck: toTex(tiles(512, 5, [214, 218, 210], '#8f9690', 14, 5), a),
    poolBasin: toTex(tiles(512, 10, [120, 186, 204], '#5f8e9a', 14, 4), a),
    water: toTex(water(), a),
    ripple: toTex(ripple(), a, { repeat: false }),
    drownedSkin: toTex(drownedSkin(), a),
    drownedFace: toTex(drownedFace(false), a, { repeat: false }),
    drownedScream: toTex(drownedFace(true), a, { repeat: false }),
    glow: toTex(glow(), a, { repeat: false }),
    ao: toTex(aoGradient(), a, { repeat: false, srgb: false }),
    vent: toTex(vent(), a, { repeat: false }),
    corkboard: toTex(corkboard(), a, { repeat: false }),
    clock: toTex(clockFace(), a, { repeat: false }),
    classDoor: toTex(classDoor(), a, { repeat: false }),
    classPlate: toTex(classPlate(), a, { repeat: false }),
    drain: toTex(drain(), a, { repeat: false }),
    depthMark: toTex(depthMark(), a, { repeat: false }),
    caustics: toTex(caustics(), a, { srgb: false }),
    waterNormal: toTex(waterNormal(), a, { srgb: false }),
    paper: toTex(paper(), a, { repeat: false }),
  };
}
