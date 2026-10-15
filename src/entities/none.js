// 엔티티가 없는 레벨 (풀룸: 원작 설정대로 안전지대). 다른 엔티티와 같은 모양의 빈 껍데기
import * as THREE from 'three';

export class Nothing {
  constructor() {
    this.mesh = new THREE.Group();
    this.head = new THREE.Object3D();
    this.mesh.add(this.head);
    this.pos = new THREE.Vector3();
    this.active = false;
    this.chasing = false;
    this.dist = 99;
    this.los = false;
    this.cfg = { kind: 'none' };
  }

  get audioAnchor() {
    return this.head;
  }

  get awakeMessage() {
    return '';
  }

  reset(level, theme) {
    this.cfg = theme.entity;
    this.mesh.visible = false;
  }

  hide() {
    this.mesh.visible = false;
  }

  syncMesh() {}

  proximity() {
    return 0;
  }

  hear() {
    return false;
  }

  update() {
    return [];
  }
}
