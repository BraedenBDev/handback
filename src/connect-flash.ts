import {
  AdditiveBlending,
  Color,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  WebGLRenderer,
} from "three";

const VERTEX_SHADER = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT_SHADER = `
  uniform float uProgress;
  uniform vec3 uColor;
  varying vec2 vUv;

  void main() {
    vec2 uv = vUv - 0.5;
    float dist = length(uv);
    float ring = 1.0 - smoothstep(0.0, 0.05, abs(dist - uProgress * 0.5));
    float glow = smoothstep(0.5, 0.0, dist) * (1.0 - uProgress);
    float alpha = clamp(ring + glow, 0.0, 1.0) * (1.0 - uProgress);
    gl_FragColor = vec4(uColor, alpha);
  }
`;

const BURST_MS = 300;

/** True when a connect sequence should skip the shader flash entirely. */
export function shouldSkipFlash(): boolean {
  if (typeof window === "undefined") return true;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return true;
  try {
    const canvas = document.createElement("canvas");
    return !(canvas.getContext("webgl") || canvas.getContext("experimental-webgl"));
  } catch {
    return true;
  }
}

/**
 * Plays a one-shot connection flash inside `el`. `el` must already be
 * positioned and sized (the masthead's `.mark-slot`). Resolves once the
 * burst finishes and the renderer has been torn down — nothing keeps
 * rendering after that.
 */
export function playConnectFlash(el: HTMLElement, colorHex: string): Promise<void> {
  return new Promise((resolve) => {
    const size = Math.max(el.clientWidth, el.clientHeight, 72);
    const renderer = new WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(size, size, false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.domElement.style.cssText =
      "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;";
    el.style.position = el.style.position || "relative";
    el.appendChild(renderer.domElement);

    const scene = new Scene();
    const camera = new OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0, 1);

    const material = new ShaderMaterial({
      uniforms: {
        uProgress: { value: 0 },
        uColor: { value: new Color(colorHex) },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    scene.add(new Mesh(new PlaneGeometry(1, 1), material));

    let start: number | null = null;
    let frame: number;

    function tick(now: number) {
      if (start === null) start = now;
      const progress = Math.min((now - start) / BURST_MS, 1);
      material.uniforms.uProgress!.value = progress;
      renderer.render(scene, camera);
      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        cleanup();
      }
    }

    function cleanup() {
      cancelAnimationFrame(frame);
      material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      resolve();
    }

    frame = requestAnimationFrame(tick);
  });
}
