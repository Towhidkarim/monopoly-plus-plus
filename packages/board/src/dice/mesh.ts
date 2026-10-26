import { Geometry, Mesh, Shader, UniformGroup } from 'pixi.js'
import { FACES } from './cube.ts'
import { qrot, v3, type Quat, type V3 } from './math.ts'

/**
 * A die as a real rounded cube (DECISIONS.md D38): a mesh in the die's body frame (half size 1)
 * whose edges and corners are quarter-cylinders and sphere octants of radius `round`. A small
 * shader places it with the board's affine projection (passed in as uniforms each frame), lights
 * it in world space, and draws the pips per pixel as soft recessed dots. The body is convex, so
 * fragments facing away from the viewer are discarded instead of needing a depth buffer.
 */

/** Grid lines across one face: dense in the two rounded bands, one span over the flat middle. */
function faceLines(round: number, rim: number): number[] {
  const side = Array.from({ length: rim + 1 }, (_, k) => -1 + (round * k) / rim)
  return [...side, ...side.map((s) => -s).toReversed()]
}

export function roundedCubeGeometry(round: number, rim = 6): Geometry {
  const lines = faceLines(round, rim)
  const n = lines.length
  const perFace = n * n
  const pos = new Float32Array(FACES.length * perFace * 3)
  const nor = new Float32Array(pos.length)
  const tan = new Float32Array(pos.length)
  const face = new Float32Array(pos.length)
  const idx = new Uint16Array(FACES.length * (n - 1) * (n - 1) * 6)
  const inner = 1 - round
  let vi = 0
  let ii = 0
  for (const [fi, f] of FACES.entries()) {
    const base = fi * perFace
    for (const s of lines)
      for (const t of lines) {
        // Point on the sharp cube, pulled onto the rounded body around the inner box.
        const px = f.n.x + f.u.x * s + f.v.x * t
        const py = f.n.y + f.u.y * s + f.v.y * t
        const pz = f.n.z + f.u.z * s + f.v.z * t
        const cx = Math.max(-inner, Math.min(inner, px))
        const cy = Math.max(-inner, Math.min(inner, py))
        const cz = Math.max(-inner, Math.min(inner, pz))
        let dx = px - cx
        let dy = py - cy
        let dz = pz - cz
        const len = Math.hypot(dx, dy, dz)
        if (len > 1e-6) {
          dx /= len
          dy /= len
          dz /= len
        } else {
          dx = f.n.x
          dy = f.n.y
          dz = f.n.z
        }
        const o = vi * 3
        pos[o] = cx + dx * round
        pos[o + 1] = cy + dy * round
        pos[o + 2] = cz + dz * round
        nor[o] = dx
        nor[o + 1] = dy
        nor[o + 2] = dz
        tan[o] = f.u.x
        tan[o + 1] = f.u.y
        tan[o + 2] = f.u.z
        face[o] = f.value
        face[o + 1] = s
        face[o + 2] = t
        vi++
      }
    for (let i = 0; i < n - 1; i++)
      for (let j = 0; j < n - 1; j++) {
        const a = base + i * n + j
        const b = a + n
        idx.set([a, b, a + 1, a + 1, b, b + 1], ii)
        ii += 6
      }
  }
  return new Geometry({
    attributes: {
      aPosition: { buffer: pos, format: 'float32x3' },
      aNormal: { buffer: nor, format: 'float32x3' },
      aTangent: { buffer: tan, format: 'float32x3' },
      aFace: { buffer: face, format: 'float32x3' },
    },
    indexBuffer: idx,
  })
}

const vertex = /* glsl */ `
in vec3 aPosition;
in vec3 aNormal;
in vec3 aTangent;
in vec3 aFace;

uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
uniform mat3 uAxes;
uniform vec2 uCenter;
uniform mat3 uRot;

out vec3 vNormal;
out vec3 vTangent;
out vec3 vFace;

void main(void) {
  vec2 p = uCenter + (uAxes * aPosition).xy;
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(p, 1.0)).xy, 0.0, 1.0);
  vNormal = uRot * aNormal;
  vTangent = uRot * aTangent;
  vFace = aFace;
}
`

const fragment = /* glsl */ `
in vec3 vNormal;
in vec3 vTangent;
in vec3 vFace;

uniform vec4 uColor;
uniform vec4 uWorldColorAlpha;
uniform vec3 uLight;
uniform vec3 uView;
uniform vec3 uBody;
uniform vec3 uPip;
uniform vec3 uLamp;
uniform float uGlow;
uniform float uAA;

out vec4 finalColor;

const float STEP = 0.52;
const float R = 0.21;

// Keeps the closer of two pip centers (GLSL ES 1.0 safe: no dynamic indexing).
vec2 closer(vec2 uv, vec2 best, vec2 c) {
  return length(uv - c * STEP) < length(uv - best) ? c * STEP : best;
}

// Nearest pip center (face units) for this face's value.
vec2 nearestPip(float value, vec2 uv) {
  vec2 best = vec2(9.0);
  if (value < 1.5 || abs(value - 3.0) < 0.5 || abs(value - 5.0) < 0.5) best = closer(uv, best, vec2(0.0));
  if (value > 1.5) {
    best = closer(uv, best, vec2(-1.0, -1.0));
    best = closer(uv, best, vec2(1.0, 1.0));
  }
  if (value > 3.5) {
    best = closer(uv, best, vec2(-1.0, 1.0));
    best = closer(uv, best, vec2(1.0, -1.0));
  }
  if (value > 5.5) {
    best = closer(uv, best, vec2(-1.0, 0.0));
    best = closer(uv, best, vec2(1.0, 0.0));
  }
  return best;
}

void main(void) {
  vec3 n = normalize(vNormal);
  float facing = dot(n, uView);
  // Convex body: whatever faces away is hidden behind the front.
  if (facing < -0.02) discard;

  vec3 u = normalize(vTangent);
  vec3 v = normalize(cross(n, u));
  vec2 uv = vFace.yz;
  vec2 c = nearestPip(vFace.x, uv);
  vec2 local = (uv - c) / R;
  float d = length(local);
  // About one screen pixel of edge softness (uAA is pixels per pip radius, inverted).
  float aa = uAA;
  float pip = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, d);

  // Pips are shallow spherical dimples: inside, the surface tilts toward the pip's center.
  vec3 sn = n;
  if (d < 1.0) {
    vec2 tilt = -local * 0.75;
    sn = normalize(n + (u * tilt.x + v * tilt.y) * pip);
  }

  vec3 L = uLight;
  vec3 H = normalize(L + uView);
  float diff = max(dot(sn, L), 0.0);
  float spec = pow(max(dot(sn, H), 0.0), 48.0);
  // Bright white plastic: lit faces saturate to white, the face away from the light stays a
  // soft grey, and the shading gathers in the rounded edges turning away from the viewer.
  float light = 0.72 + 0.24 * sn.z + 0.34 * diff;
  float rim = 1.0 - 0.22 * pow(1.0 - max(facing, 0.0), 2.5);

  vec3 base = mix(uBody, uPip, pip);
  vec3 col = base * light * rim;
  col += vec3(1.0) * spec * mix(0.3, 0.22, pip);
  // Lamp light catches the upper rounded edges at night.
  col += uLamp * uGlow * 0.5 * pow(1.0 - max(facing, 0.0), 2.0) * smoothstep(0.1, 0.8, n.z);

  float a = uColor.a * uWorldColorAlpha.a;
  finalColor = vec4(min(col, vec3(1.0)) * a, a);
}
`

/** 2D projection of board-unit vectors (the linear part of `project`) and the view direction. */
export interface DieBasis {
  ex: { x: number; y: number }
  ey: { x: number; y: number }
  ez: { x: number; y: number }
  view: V3
}

const hex = (c: number) =>
  new Float32Array([((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255])

/** One die: a mesh plus its per-frame uniforms. Two dice share one geometry. */
export class DieMesh {
  readonly mesh: Mesh<Geometry, Shader>
  private readonly uniforms: UniformGroup
  private readonly axes = new Float32Array(9)
  private readonly rot = new Float32Array(9)
  private readonly center = new Float32Array(2)
  private readonly view = new Float32Array([0, 0, 1])
  private readonly col = [v3(), v3(), v3()] as const

  constructor(geometry: Geometry, colors: { body: number; pip: number; lamp: number }, light: V3) {
    this.uniforms = new UniformGroup({
      uAxes: { value: this.axes, type: 'mat3x3<f32>' },
      uRot: { value: this.rot, type: 'mat3x3<f32>' },
      uCenter: { value: this.center, type: 'vec2<f32>' },
      uLight: { value: new Float32Array([light.x, light.y, light.z]), type: 'vec3<f32>' },
      uView: { value: this.view, type: 'vec3<f32>' },
      uBody: { value: hex(colors.body), type: 'vec3<f32>' },
      uPip: { value: hex(colors.pip), type: 'vec3<f32>' },
      uLamp: { value: hex(colors.lamp), type: 'vec3<f32>' },
      uGlow: { value: 0, type: 'f32' },
      uAA: { value: 0.1, type: 'f32' },
    })
    const shader = Shader.from({ gl: { vertex, fragment }, resources: { dieUniforms: this.uniforms } })
    this.mesh = new Mesh({ geometry, shader })
  }

  /**
   * Places the die: orientation `q`, half size `half` (board units) times screen scale `k`,
   * centered at (ax, ay) world px. `px` is device pixels per world px (zoom times resolution),
   * which sets how soft the pip edges are.
   */
  set(B: DieBasis, q: Quat, half: number, k: number, ax: number, ay: number, glow: number, px: number): void {
    const s = half * k
    const [c0, c1, c2] = this.col
    let spread = 0
    qrot(q, X, c0)
    qrot(q, Y, c1)
    qrot(q, Z, c2)
    for (const [j, c] of [c0, c1, c2].entries()) {
      // Body axis j in world (rotation column), then projected to px (the 2x3 board map).
      this.rot[j * 3] = c.x
      this.rot[j * 3 + 1] = c.y
      this.rot[j * 3 + 2] = c.z
      this.axes[j * 3] = (B.ex.x * c.x + B.ey.x * c.y + B.ez.x * c.z) * s
      this.axes[j * 3 + 1] = (B.ex.y * c.x + B.ey.y * c.y + B.ez.y * c.z) * s
      this.axes[j * 3 + 2] = 0
      spread += Math.hypot(this.axes[j * 3]!, this.axes[j * 3 + 1]!) / 3
    }
    this.center[0] = ax
    this.center[1] = ay
    this.view[0] = B.view.x
    this.view[1] = B.view.y
    this.view[2] = B.view.z
    const u = this.uniforms.uniforms
    u.uGlow = glow
    // One device pixel, in units of the pip radius.
    u.uAA = 1 / Math.max(1, PIP_R * spread * px)
    this.uniforms.update()
  }

  destroy(): void {
    this.mesh.destroy()
  }
}

/** Pip radius in face units (matches `R` in the shader). */
const PIP_R = 0.21
const X = { x: 1, y: 0, z: 0 }
const Y = { x: 0, y: 1, z: 0 }
const Z = { x: 0, y: 0, z: 1 }
