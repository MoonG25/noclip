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

function carpet() {
  const S = 512;
  const [c, x] = canvas(S, S);
  x.fillStyle = '#9a8748';
  x.fillRect(0, 0, S, S);
  // 카펫 섬유 느낌의 짧은 선
  for (let i = 0; i < 16000; i++) {
    const v = rng.next();
    x.fillStyle = v > 0.5 ? 'rgba(190,170,100,0.25)' : 'rgba(70,58,25,0.25)';
    x.fillRect(rng.next() * S, rng.next() * S, 1 + rng.next() * 2, 1);
  }
  stains(x, S, S, 6, '60,50,20', 120, 0.1);
  stains(x, S, S, 4, '40,36,18', 60, 0.12);
  grain(x, S, S, 30);
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
    carpet: toTex(carpet(), a),
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
    glow: toTex(glow(), a, { repeat: false }),
    paper: toTex(paper(), a, { repeat: false }),
  };
}
