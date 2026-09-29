"use client";

import { useEffect, useRef } from "react";
import { Renderer, Triangle, Mesh, Program } from "ogl";
import type { Renderer as RendererT, Mesh as MeshT, Program as ProgramT, OGLRenderingContext } from "ogl";

export interface GhostFibersProps {
  lineColor?: string;
  glowColor?: string;
  speed?: number;
  scale?: number;
  rotation?: number;
  rotationSpeed?: number;
  layers?: number;
  waveAmplitude?: number;
  waveFrequency?: number;
  waveSpeed?: number;
  layerSpeed?: number;
  twist?: number;
  twistFrequency?: number;
  twistSpeed?: number;
  lineFrequency?: number;
  lineSpacing?: number;
  lineSharpness?: number;
  glowFalloff?: number;
  glowIntensity?: number;
  brightness?: number;
  blueBoost?: number;
  vignette?: number;
  grain?: number;
  lightMode?: boolean;
  dpr?: number;
  fps?: number;
  paused?: boolean;
  className?: string;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const v = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(v, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

const VERT = /* glsl */ `
  attribute vec2 uv;
  attribute vec2 position;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

/**
 * GhostFibers — layered recursive domain-warp fiber field.
 * Each layer re-displaces the previous layer's coordinates (fbm-style),
 * then draws wide luminous bands with a sharp thin core.
 */
const FRAG = /* glsl */ `
  precision highp float;

  varying vec2 vUv;

  uniform vec2  uResolution;
  uniform float uTime;
  uniform vec3  uLineColor;
  uniform vec3  uGlowColor;
  uniform float uSpeed;
  uniform float uScale;
  uniform float uRotation;
  uniform float uRotationSpeed;
  uniform float uLayers;
  uniform float uWaveAmplitude;
  uniform float uWaveFrequency;
  uniform float uWaveSpeed;
  uniform float uLayerSpeed;
  uniform float uTwist;
  uniform float uTwistFrequency;
  uniform float uTwistSpeed;
  uniform float uLineFrequency;
  uniform float uLineSpacing;
  uniform float uLineSharpness;
  uniform float uGlowFalloff;
  uniform float uGlowIntensity;
  uniform float uBrightness;
  uniform float uBlueBoost;
  uniform float uVignette;
  uniform float uGrain;
  uniform float uLightMode;

  mat2 rot(float a) {
    float c = cos(a);
    float s = sin(a);
    return mat2(c, -s, s, c);
  }

  float hash(vec2 p) {
    p = fract(p * vec2(233.34, 851.73));
    p += dot(p, p + 23.45);
    return fract(p.x * p.y);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  void main() {
    vec2 uv = (vUv - 0.5) * 2.0;
    float aspect = uResolution.x / max(uResolution.y, 1.0);
    vec2 p = vec2(uv.x * aspect, uv.y) * uScale;

    float t = uTime * uSpeed;

    // Continuous slow rotation of the whole field
    p = rot(uRotation * 0.01745329 + uTime * uRotationSpeed * 0.05) * p;

    // ----- Recursive domain warp: each layer displaces the last -----
    // Low warp frequency → long, smooth S-curves like real silk/fiber.
    vec2 q = p;
    float lineSum = 0.0;
    float glowSum = 0.0;

    for (int i = 0; i < 10; i++) {
      if (float(i) >= uLayers) break;
      float fi = float(i);

      // Layer phase drives both wave motion and per-layer offset
      float phase = fi * 1.3 + uTime * uLayerSpeed * 0.1;

      // Recursive displacement: VERY low frequency + low amplitude = long,
      // coherent S-curves (the silk look). Deeper layers warp less.
      float warpScale = 0.55 + fi * 0.12;
      float n1 = noise(q * warpScale + vec2(t * 0.4, -t * 0.24) + phase * 2.7);
      float n2 = noise(q * warpScale + vec2(5.2, 1.3) - vec2(t * 0.28, t * 0.36));
      q += vec2(n1 - 0.5, n2 - 0.5) * uWaveAmplitude * 9.0 / (1.0 + fi * 0.5);

      // Gentle angular twist, slightly stronger on deeper layers
      float r = length(q);
      float a = atan(q.y, q.x);
      a += uTwist * (1.0 + fi * 0.3) * sin(r * uTwistFrequency * 0.35 - t * uTwistSpeed * 0.25 + phase);
      q = vec2(cos(a), sin(a)) * r;

      // Band pattern: frequency grows linearly per layer. |sin| lights up
      // twice per period, so this coefficient yields ~3–4 visible lines for
      // the base layer; deeper layers are heavily faded for sparseness.
      float f = (uLineFrequency + fi * uLineSpacing) * 0.24;
      float band = sin(q.x * f * 1.2 + q.y * f * 1.0 + phase * 2.4 + t * 0.28);

      float d = 1.0 - abs(band); // 1 at band core, 0 in the gaps
      // Silky shaping: a broad soft ribbon with a bright thin spine.
      // Gates start high (d > 0.66) so ribbons cover only ~20% of each
      // period — sparse luminous bands on a dark field, silky edges.
      float ribbon = smoothstep(0.66, 0.96, d);
      float spine = smoothstep(0.88, 0.995, d);

      // Deeper layers contribute progressively less (sparse, not dense)
      float w = 1.0 / (1.0 + fi * 1.3);
      lineSum += (ribbon * 0.55 + spine) * w;
      glowSum += ribbon * w;
    }

    lineSum /= max(uLayers * 0.55, 1.0);
    glowSum /= max(uLayers * 0.55, 1.0);

    // Compositing: near-black base; light lives ONLY at the band cores.
    // Base matches the CSS fallback (#0E0A24) so canvas and fallback agree.
    vec3 col = vec3(0.055, 0.039, 0.141);
    col += uGlowColor * glowSum * uGlowIntensity * 0.45;
    col += mix(uGlowColor, vec3(1.0), 0.35) * lineSum * uGlowIntensity * 0.7;

    // Exposure tone mapping
    col = vec3(1.0) - exp(-col * uBrightness);

    // Blue boost on the final color
    col.b *= uBlueBoost;
    col *= vec3(0.985, 0.99, 1.0);

    if (uLightMode > 0.5) {
      // Ink-on-light compositing: a very light paper with soft light-blue
      // strands — the same fiber field, but airy instead of luminous.
      float lum = clamp((col.r + col.g + col.b) / 3.0, 0.0, 1.0);
      vec3 paper = vec3(0.965, 0.971, 0.988);
      vec3 ink = mix(paper, uLineColor, 0.8);
      col = mix(paper, ink, lum * 0.9);
    }

    // Edge vignette
    float vig = smoothstep(1.55, 0.45, length(uv * vec2(aspect * 0.8, 1.0)));
    col *= mix(1.0, vig, uVignette);

    // Film grain (two screens, subtle)
    float g1 = hash(gl_FragCoord.xy + fract(uTime) * 371.0) - 0.5;
    float g2 = hash(gl_FragCoord.yx * 1.37 + fract(uTime * 1.7) * 511.0) - 0.5;
    col += (g1 * 0.7 + g2 * 0.3) * uGrain;

    gl_FragColor = vec4(col, 1.0);
  }
`;

export default function GhostFibers({
  lineColor = "#140E35",
  glowColor = "#3437A0",
  speed = 0.2,
  scale = 2,
  rotation = 0,
  rotationSpeed = 0.25,
  layers = 4,
  waveAmplitude = 0.015,
  waveFrequency = 3,
  waveSpeed = 0.15,
  layerSpeed = 0.08,
  twist = 0.1,
  twistFrequency = 5,
  twistSpeed = 1.2,
  lineFrequency = 5,
  lineSpacing = 2,
  lineSharpness = 16,
  glowFalloff = 10,
  glowIntensity = 1.6,
  brightness = 2,
  blueBoost = 1.25,
  vignette = 0.8,
  grain = 0.05,
  lightMode = false,
  dpr = 1,
  fps = 60,
  paused = false,
  className = "",
}: GhostFibersProps) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let renderer: RendererT | null = null;
    let gl: OGLRenderingContext | null = null;
    let program: ProgramT | null = null;
    let mesh: MeshT | null = null;
    let geometry: Triangle | null = null;
    let raf = 0;
    let running = false;
    let disposed = false;
    let simTime = 0;
    let frameAcc = 0;
    let lastFrame = performance.now();

    try {
      renderer = new Renderer({
        dpr: Math.min(Math.max(dpr, 0.5), 2),
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: "low-power",
      });
      gl = renderer.gl;
      gl.clearColor(0.078, 0.055, 0.208, 1); // #140E35
    } catch {
      return; // WebGL unavailable — CSS fallback background stays
    }

    const canvas = gl.canvas as HTMLCanvasElement;
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";
    host.appendChild(canvas);

    geometry = new Triangle(gl);
    program = new Program(gl, {
      vertex: VERT,
      fragment: FRAG,
      uniforms: {
        uResolution: { value: new Float32Array([1, 1]) },
        uTime: { value: 0 },
        uLineColor: { value: hexToRgb(lineColor) },
        uGlowColor: { value: hexToRgb(glowColor) },
        uSpeed: { value: speed },
        uScale: { value: scale },
        uRotation: { value: rotation },
        uRotationSpeed: { value: rotationSpeed },
        uLayers: { value: Math.min(Math.max(layers, 1), 10) },
        uWaveAmplitude: { value: waveAmplitude },
        uWaveFrequency: { value: waveFrequency },
        uWaveSpeed: { value: waveSpeed },
        uLayerSpeed: { value: layerSpeed },
        uTwist: { value: twist },
        uTwistFrequency: { value: twistFrequency },
        uTwistSpeed: { value: twistSpeed },
        uLineFrequency: { value: lineFrequency },
        uLineSpacing: { value: lineSpacing },
        uLineSharpness: { value: lineSharpness },
        uGlowFalloff: { value: glowFalloff },
        uGlowIntensity: { value: glowIntensity },
        uBrightness: { value: brightness },
        uBlueBoost: { value: blueBoost },
        uVignette: { value: vignette },
        uGrain: { value: grain },
        uLightMode: { value: lightMode ? 1 : 0 },
      },
    });
    mesh = new Mesh(gl, { geometry, program });

    function resize() {
      if (!renderer || !program || !host) return;
      const w = host.clientWidth || window.innerWidth;
      const h = host.clientHeight || window.innerHeight;
      renderer.setSize(w, h);
      (program!.uniforms.uResolution.value as Float32Array)[0] = w;
      (program!.uniforms.uResolution.value as Float32Array)[1] = h;
    }
    resize();
    window.addEventListener("resize", resize);

    function frame() {
      if (!running || !renderer || !program) return;
      raf = requestAnimationFrame(frame);

      const now = performance.now();
      const dt = Math.min((now - lastFrame) / 1000, 0.1);
      lastFrame = now;

      // fps cap: accumulate elapsed time, draw one frame per interval.
      // (A naive `dt < interval` check never fires on 60Hz displays when
      // fps=30, since each rAF tick is only ~16.7ms.)
      frameAcc += dt;
      const interval = 1 / (fps || 60);
      if (frameAcc < interval) return;
      frameAcc %= interval;
      simTime += dt;
      program.uniforms.uTime.value = simTime;
      renderer.render({ scene: mesh as MeshT });
    }

    function start() {
      if (running || disposed) return;
      running = true;
      lastFrame = performance.now();
      raf = requestAnimationFrame(frame);
    }
    function stop() {
      running = false;
      cancelAnimationFrame(raf);
    }

    if (paused || reduced) {
      // Draw a single still frame, no loop
      simTime = 12;
      program.uniforms.uTime.value = simTime;
      renderer.render({ scene: mesh as MeshT });
    } else {
      start();
    }

    const onVisibility = () => (document.hidden ? stop() : !paused && !reduced && start());
    document.addEventListener("visibilitychange", onVisibility);

    // ---- Theme retuning: light mode = much lighter field + light blue lines ----
    const LIGHT_LINE = "#a5c8f0"; // soft light blue strands
    const LIGHT_BG = "#f3f5fb";
    function retuneTheme() {
      if (!program || !host) return;
      const light = document.documentElement.classList.contains("light");
      program.uniforms.uLightMode.value = light ? 1 : 0;
      program.uniforms.uLineColor.value = hexToRgb(light ? LIGHT_LINE : lineColor);
      program.uniforms.uVignette.value = light ? Math.min(vignette, 0.3) : vignette;
      host.style.background = light ? LIGHT_BG : "#0E0A24";
    }
    retuneTheme();
    window.addEventListener("alu-theme-change", retuneTheme);

    return () => {
      disposed = true;
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("alu-theme-change", retuneTheme);
      window.removeEventListener("resize", resize);
      try {
        (mesh as unknown as { remove?: () => void })?.remove?.();
        program?.remove?.();
        geometry?.remove?.();
        canvas.remove();
        gl?.getExtension("WEBGL_lose_context")?.loseContext();
      } catch {
        /* best-effort cleanup */
      }
    };
    // Config is fixed at mount in this app; runtime prop changes are not re-bound.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={hostRef} className={`ghost-background ${className}`} aria-hidden="true" style={{ background: "#0E0A24" }} />;
}
