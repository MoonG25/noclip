// 1996년 캠코더 테이프 느낌. 저해상도로 렌더한 뒤 셰이더로 망가뜨린다.
import * as THREE from 'three';

const frag = /* glsl */ `
precision highp float;
uniform sampler2D tDiffuse;
uniform vec2 resolution;
uniform float time;
uniform float glitch;
uniform float fade;
uniform float exposure;
uniform float stress;
uniform float white;
varying vec2 vUv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

vec3 tone(vec3 c) {
  c *= exposure;
  c = c / (1.0 + c * 0.55);
  return pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2));
}

void main() {
  vec2 cc = vUv - 0.5;
  float r2 = dot(cc, cc);
  vec2 uv = 0.5 + cc * (1.0 + 0.07 * r2 + 0.05 * r2 * r2) * 0.975;

  float line = floor(uv.y * resolution.y);
  float frame = floor(time * 30.0);
  float jit = (hash(vec2(line, frame)) - 0.5) * 0.0012 * (1.0 + glitch * 14.0 + stress * 3.0);

  // 화면을 타고 내려오는 트래킹 띠
  float bandPos = 1.0 - fract(time * 0.06);
  float band = smoothstep(0.035, 0.0, abs(uv.y - bandPos));
  jit += band * (hash(vec2(line, time)) - 0.5) * 0.018;

  // 큰 글리치 블록
  float by = floor(uv.y * 22.0);
  float gf = floor(time * 14.0);
  float blk = step(1.0 - glitch * 0.4 - stress * 0.04, hash(vec2(by, gf)));
  jit += blk * (hash(vec2(by, gf + 7.0)) - 0.5) * 0.12;
  uv.x += jit;

  float ca = 0.0016 + glitch * 0.012 + stress * 0.004;
  vec3 col;
  col.r = texture2D(tDiffuse, uv + vec2(ca, 0.0)).r;
  col.g = texture2D(tDiffuse, uv).g;
  col.b = texture2D(tDiffuse, uv - vec2(ca * 1.4, 0.0)).b;
  vec2 px = vec2(1.5 / resolution.x, 0.0);
  vec3 bleed = texture2D(tDiffuse, uv + px).rgb + texture2D(tDiffuse, uv - px).rgb;
  col = mix(col, bleed * 0.5, 0.3);

  col = tone(col);
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(l), col, 0.8 - stress * 0.25);
  col = col * vec3(1.03, 1.0, 0.92) + vec3(0.03, 0.026, 0.035);

  col *= 0.92 + 0.08 * sin(vUv.y * resolution.y * 3.14159);
  float n = hash(vUv * resolution + fract(time * 7.13) * 91.0);
  col += (n - 0.5) * (0.07 + glitch * 0.5 + stress * 0.08);
  float sl = step(0.996 - glitch * 0.06, hash(vec2(floor(vUv.y * resolution.y * 0.5), frame)));
  col = mix(col, vec3(hash(vUv + time)), sl * 0.55);
  col += band * 0.035;

  float vig = smoothstep(0.82, 0.22, length(cc * vec2(1.0, 1.2)));
  col *= mix(0.5, 1.0, vig);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) col = vec3(0.0);
  col = mix(col, vec3(1.0, 0.98, 0.94), white);
  gl_FragColor = vec4(col * fade, 1.0);
}
`;

const vert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

export class VHS {
  constructor(renderer) {
    this.renderer = renderer;
    this.rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
    this.uniforms = {
      tDiffuse: { value: this.rt.texture },
      resolution: { value: new THREE.Vector2(4, 4) },
      time: { value: 0 },
      glitch: { value: 0 },
      fade: { value: 1 },
      exposure: { value: 1 },
      stress: { value: 0 },
      white: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: vert, fragmentShader: frag, depthTest: false });
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  setSize(w, h) {
    const rh = Math.min(h, 432);
    const rw = Math.round((rh * w) / h);
    this.rt.setSize(rw, rh);
    this.uniforms.resolution.value.set(rw, rh);
  }

  render(scene, camera) {
    const r = this.renderer;
    r.setRenderTarget(this.rt);
    r.render(scene, camera);
    r.setRenderTarget(null);
    r.render(this.scene, this.cam);
  }
}
