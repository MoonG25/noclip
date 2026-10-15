// 소품: 아이템, 비상구, 책상. 레벨 지오메트리 헬퍼도 여기 둔다.
import * as THREE from 'three';

// 월드 좌표 기준 UV. 길이가 다른 벽끼리도 무늬가 이어진다.
export function worldUV(g, su, sv, ou = 0, ov = 0) {
  const p = g.attributes.position;
  const n = g.attributes.normal;
  const uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const nx = Math.abs(n.getX(i));
    const ny = Math.abs(n.getY(i));
    const nz = Math.abs(n.getZ(i));
    let u, v;
    if (ny > nx && ny > nz) {
      u = p.getX(i);
      v = p.getZ(i);
    } else if (nx > nz) {
      u = p.getZ(i);
      v = p.getY(i);
    } else {
      u = p.getX(i);
      v = p.getY(i);
    }
    uv.setXY(i, (u - ou) * su, (v - ov) * sv);
  }
  return g;
}

export function box(w, h, d, x, y, z, su = 0.5, sv = 0.5) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return worldUV(g, su, sv);
}

function glowSprite(tex, color, size, opacity = 0.7) {
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: tex.glow,
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    }),
  );
  s.scale.setScalar(size);
  return s;
}

const metalMat = new THREE.MeshLambertMaterial({ color: 0x8a8d90 });

export function makeItem(type, tex) {
  const g = new THREE.Group();
  let glowColor = 0xffc070;
  if (type === 'fuse') {
    const core = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.045, 0.2, 10),
      new THREE.MeshBasicMaterial({ color: 0xffa64d }),
    );
    core.rotation.z = Math.PI / 2;
    const capGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.05, 10);
    for (const sx of [-0.12, 0.12]) {
      const cap = new THREE.Mesh(capGeo, metalMat);
      cap.rotation.z = Math.PI / 2;
      cap.position.x = sx;
      g.add(cap);
    }
    g.add(core);
    glowColor = 0xff9a3a;
  } else if (type === 'key') {
    const gold = new THREE.MeshBasicMaterial({ color: 0xc9a253 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.015, 6, 14), gold);
    ring.position.x = -0.1;
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.022, 0.022), gold);
    shaft.position.x = 0.03;
    const bit = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.022), gold);
    bit.position.set(0.09, -0.03, 0);
    g.add(ring, shaft, bit);
    glowColor = 0xffd27a;
  } else if (type === 'battery') {
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 0.13, 10),
      new THREE.MeshBasicMaterial({ color: 0x3fae5a }),
    );
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.02, 8), metalMat);
    tip.position.y = 0.075;
    g.add(body, tip);
    glowColor = 0x7dff9a;
  } else if (type === 'water') {
    const bottle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 0.2, 12),
      new THREE.MeshBasicMaterial({ color: 0xdfe9f0, transparent: true, opacity: 0.75 }),
    );
    const label = new THREE.Mesh(
      new THREE.CylinderGeometry(0.052, 0.052, 0.07, 12),
      new THREE.MeshBasicMaterial({ color: 0xd9c27a }),
    );
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 0.03, 8),
      new THREE.MeshBasicMaterial({ color: 0x2d6fd0 }),
    );
    cap.position.y = 0.12;
    g.add(bottle, label, cap);
    glowColor = 0x9fd0ff;
  } else if (type === 'note') {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(0.22, 0.28),
      new THREE.MeshLambertMaterial({ map: tex.paper, emissive: 0x2a2820 }),
    );
    g.add(m);
    const s = glowSprite(tex, 0xfff2c0, 0.5, 0.25);
    s.position.z = 0.05;
    g.add(s);
    g.userData.static = true;
    return g;
  }
  const s = glowSprite(tex, glowColor, 0.7, 0.55);
  g.add(s);
  g.userData.glow = s;
  return g;
}

// 비상구: 로컬 +z 방향을 바라본다. 원점은 벽면 바닥 중앙.
export function makeExit(tex) {
  const g = new THREE.Group();
  const frameMat = new THREE.MeshLambertMaterial({ color: 0x3a3d38 });
  const frame = [
    new THREE.Mesh(new THREE.BoxGeometry(0.09, 2.3, 0.1), frameMat),
    new THREE.Mesh(new THREE.BoxGeometry(0.09, 2.3, 0.1), frameMat),
    new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.09, 0.1), frameMat),
  ];
  frame[0].position.set(-0.66, 1.15, 0.03);
  frame[1].position.set(0.66, 1.15, 0.03);
  frame[2].position.set(0, 2.26, 0.03);
  g.add(...frame);

  const door = new THREE.Mesh(new THREE.PlaneGeometry(1.22, 2.2), new THREE.MeshLambertMaterial({ map: tex.door }));
  door.position.set(0, 1.1, 0.02);
  g.add(door);

  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.23), new THREE.MeshBasicMaterial({ map: tex.exitSign }));
  sign.position.set(0, 2.55, 0.04);
  g.add(sign);
  const signGlow = glowSprite(tex, 0x2dff7a, 1.4, 0.35);
  signGlow.position.set(0, 2.55, 0.15);
  g.add(signGlow);

  const fuseBox = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.52, 0.12), new THREE.MeshLambertMaterial({ color: 0x8e9187 }));
  fuseBox.position.set(1.05, 1.3, 0.06);
  g.add(fuseBox);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xff2a1a });
  const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.035, 12), lampMat);
  lamp.position.set(1.05, 1.47, 0.125);
  g.add(lamp);
  const lampGlow = glowSprite(tex, 0xff3020, 0.5, 0.8);
  lampGlow.position.set(1.05, 1.47, 0.16);
  g.add(lampGlow);

  return {
    group: g,
    setUnlocked(on) {
      const c = on ? 0x2aff6a : 0xff2a1a;
      lampMat.color.setHex(c);
      lampGlow.material.color.setHex(c);
    },
  };
}

// 책상 + 의자. 로컬 -z 방향(칠판 쪽)을 바라본다.
export function deskGeoms(x, z, rot) {
  const wood = [];
  const metal = [];
  const add = (arr, w, h, d, px, py, pz) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(px, py, pz);
    arr.push(g);
  };
  add(wood, 0.66, 0.04, 0.48, 0, 0.72, 0);
  for (const sx of [-0.29, 0.29]) {
    for (const sz of [-0.2, 0.2]) add(metal, 0.03, 0.7, 0.03, sx, 0.35, sz);
  }
  add(metal, 0.6, 0.12, 0.02, 0, 0.6, -0.22);
  // 의자
  add(wood, 0.42, 0.035, 0.4, 0, 0.44, 0.52);
  add(wood, 0.42, 0.3, 0.03, 0, 0.72, 0.73);
  for (const sx of [-0.18, 0.18]) {
    for (const sz of [0.35, 0.7]) add(metal, 0.025, 0.44, 0.025, sx, 0.22, sz);
  }
  const m = new THREE.Matrix4().makeRotationY(rot).setPosition(x, 0, z);
  for (const g of [...wood, ...metal]) {
    g.applyMatrix4(m);
    worldUV(g, 1.5, 1.5);
  }
  return { wood, metal };
}
