"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEventHandler,
  type ReactNode,
  type Ref,
} from "react";
import Link from "next/link";
import { Color, Mesh, Program, Renderer, Triangle } from "ogl";
import type { Mesh as MeshT, OGLRenderingContext, Renderer as RendererT } from "ogl";
import "./SpecularButton.css";

/** Canvas bleed around the button, in CSS pixels (matches __fx inset). */
const PAD = 20;
/** How much sooner than `proximity` the WebGL layer spins up. */
const ACTIVATE_PAD = 80;
/** How long the layer survives after the cursor wanders off / a tap. */
const HOLD_MS = 1200;
/** Tap burst for touch devices, which never get a hover. */
const TAP_MS = 900;

const VERT = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const FRAG = `#version 300 es
precision highp float;

uniform vec2 uCenter;
uniform vec2 uHalfSize;
uniform float uRadius;
uniform float uAngle;
uniform float uPx;
uniform vec3 uLineColor;
uniform vec3 uBaseColor;
uniform float uIntensity;
uniform float uShineSize;
uniform float uShineFade;
uniform float uThickness;
uniform float uBaseWidth;

out vec4 fragColor;

float sdRoundedRect(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

float shapeSDF(vec2 p) { return sdRoundedRect(p, uHalfSize, uRadius); }

float gaussianLine(float d, float sigma) {
  float x = d / (sigma + 1e-6);
  float k = mix(1.0, 1.6, smoothstep(0.0, 1.5, x));
  return exp(-k * x * x);
}

void main() {
  vec2 p = gl_FragCoord.xy - uCenter;
  float d = shapeSDF(p);
  vec2 L = vec2(cos(uAngle), sin(uAngle));

  // Dark base stroke hugging the edge for a sense of thickness
  float base = (1.0 - smoothstep(0.0, uBaseWidth, abs(d))) * 0.45;

  // Symmetric specular: the edges facing toward/away from the light both
  // catch a streak. The angular window (size + fade) is measured with an
  // elliptical normal so it varies continuously along straight edges.
  vec2 nEll = normalize(p / (uHalfSize * uHalfSize) + 1e-6);
  float phi = acos(clamp(abs(dot(nEll, L)), 0.0, 1.0));
  float rim = 1.0 - smoothstep(uShineSize - uShineFade, uShineSize + uShineFade + 1e-4, phi);
  float line = gaussianLine(d, uThickness);
  float edgeClamp = 1.0 - smoothstep(0.5 * uPx, 3.0 * uPx, abs(d));
  float hi = line * rim * edgeClamp * uIntensity;

  vec3 col = uBaseColor * base + uLineColor * hi;
  float a = clamp(base + hi, 0.0, 1.0);
  fragColor = vec4(col, a);
}
`;

export type SpecularButtonSize = "sm" | "md" | "lg";

export interface SpecularButtonProps
  extends Omit<
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    "children" | "className" | "onClick" | "type" | "disabled"
  > {
  children?: ReactNode;
  /** Preset height/padding/font-size. `md` matches the app's `.btn`. */
  size?: SpecularButtonSize;
  /** Corner radius in pixels; clamps to a pill automatically. */
  radius?: number;
  /** Color of the glass background tint. */
  tint?: string;
  /** Strength of the glass tint (1 = solid tint color). */
  tintOpacity?: number;
  /** Backdrop blur in pixels behind the button. */
  blur?: number;
  /** Color of the button label. */
  textColor?: string;
  /** Color of the moving specular highlight. */
  lineColor?: string;
  /** Color of the static edge stroke under the highlight. */
  baseColor?: string;
  /** Brightness of the specular highlight. */
  intensity?: number;
  /** Angular size in degrees of each shine streak along the edge. */
  shineSize?: number;
  /** How gradually each streak fades out at its ends, in degrees. */
  shineFade?: number;
  /** Width of the highlight line in pixels. */
  thickness?: number;
  /** Rotation speed of the sweep when autoAnimate is on. */
  speed?: number;
  /** Point the light toward the cursor. */
  followMouse?: boolean;
  /** Distance in pixels within which the shine fades in. */
  proximity?: number;
  /** Keep the shine always on with a rotating sweep, regardless of cursor. */
  autoAnimate?: boolean;
  disabled?: boolean;
  onClick?: MouseEventHandler<HTMLElement>;
  className?: string;
  type?: "button" | "submit" | "reset";
  /** Marks the control as working; announced by screen readers while async. */
  "aria-busy"?: boolean;
  /** Associates a submit/reset button with a form elsewhere in the DOM. */
  form?: string;
  /** Renders a next/link anchor instead of a button (blue CTA links). */
  href?: string;
  style?: CSSProperties;
}

/* ---------------------------------------------------------------------------
   Shared pointer feed.

   Every blue button needs to know how close the cursor is. One `pointermove`
   listener per button — each reading layout on every event — does not scale to
   a page full of buttons, so a single module-level listener feeds them all,
   throttled to animation frames.
--------------------------------------------------------------------------- */
type PointerListener = (x: number, y: number) => void;

const pointerListeners = new Set<PointerListener>();
let pointerFrame = 0;
let lastX: number | null = null;
let lastY = 0;

function flushPointer() {
  pointerFrame = 0;
  if (lastX === null) return;
  for (const listener of pointerListeners) listener(lastX, lastY);
}

function schedulePointerFlush() {
  if (pointerFrame || typeof window === "undefined") return;
  pointerFrame = window.requestAnimationFrame(flushPointer);
}

function onPointerMove(e: PointerEvent) {
  lastX = e.clientX;
  lastY = e.clientY;
  schedulePointerFlush();
}

function subscribePointer(listener: PointerListener) {
  pointerListeners.add(listener);
  if (pointerListeners.size === 1) {
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("scroll", schedulePointerFlush, { passive: true, capture: true });
    window.addEventListener("resize", schedulePointerFlush, { passive: true });
  }
  // A button can appear under a resting cursor (modal opens, list filters) —
  // replay the last known position so it lights up without a mouse move.
  if (lastX !== null) listener(lastX, lastY);
  return () => {
    pointerListeners.delete(listener);
    if (pointerListeners.size === 0) {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("scroll", schedulePointerFlush, true);
      window.removeEventListener("resize", schedulePointerFlush);
      if (pointerFrame) {
        window.cancelAnimationFrame(pointerFrame);
        pointerFrame = 0;
      }
    }
  };
}

/** Set once if WebGL cannot be created; every button then stays static. */
let webglUnavailable = false;

interface EngineProps {
  radius: number;
  lineColor: string;
  baseColor: string;
  intensity: number;
  shineSize: number;
  shineFade: number;
  thickness: number;
  speed: number;
  followMouse: boolean;
  proximity: number;
  autoAnimate: boolean;
}

export default function SpecularButton({
  children = "Get Started",
  size = "md",
  radius = 10,
  tint = "#1b5db1",
  tintOpacity = 1,
  blur = 0,
  textColor = "#ffffff",
  lineColor = "#ffffff",
  baseColor = "#123f7b",
  intensity = 1.1,
  shineSize = 12,
  shineFade = 40,
  thickness = 1.2,
  speed = 0.35,
  followMouse = true,
  proximity = 250,
  autoAnimate = false,
  disabled = false,
  onClick,
  className = "",
  type = "button",
  form,
  href,
  style,
  "aria-busy": ariaBusy,
}: SpecularButtonProps) {
  const btnRef = useRef<HTMLElement | null>(null);
  const fxRef = useRef<HTMLSpanElement | null>(null);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const [fxOn, setFxOn] = useState(false);

  // Live props for the animation loop, so prop changes never restart WebGL.
  const propsRef = useRef<EngineProps>({
    radius,
    lineColor,
    baseColor,
    intensity,
    shineSize,
    shineFade,
    thickness,
    speed,
    followMouse,
    proximity,
    autoAnimate,
  });
  propsRef.current = {
    radius,
    lineColor,
    baseColor,
    intensity,
    shineSize,
    shineFade,
    thickness,
    speed,
    followMouse,
    proximity,
    autoAnimate,
  };

  /* ---- Layer 1: lazy activation ------------------------------------------
     A live WebGL context per blue button would blow the browser's ~16 context
     budget on list screens, and the highlight is invisible until the cursor is
     near anyway. So the context is created on approach and released again once
     the cursor leaves and the shine has faded out.
  ------------------------------------------------------------------------- */
  useEffect(() => {
    const btn = btnRef.current;
    if (!btn) return;
    if (disabled) {
      setFxOn(false);
      return;
    }
    if (webglUnavailable) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let hold: ReturnType<typeof setTimeout> | null = null;
    const clearHold = () => {
      if (hold) {
        clearTimeout(hold);
        hold = null;
      }
    };

    const update = (x: number, y: number) => {
      pointerRef.current = { x, y };
      const rect = btn.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const dx = Math.max(rect.left - x, 0, x - rect.right);
      const dy = Math.max(rect.top - y, 0, y - rect.bottom);
      if (Math.hypot(dx, dy) <= proximity + ACTIVATE_PAD) {
        clearHold();
        setFxOn(true);
        return;
      }
      if (!hold) {
        hold = setTimeout(() => {
          hold = null;
          setFxOn(false);
        }, HOLD_MS);
      }
    };

    const unsubscribe = subscribePointer(update);

    // Keyboard focus (and taps on touch devices) light the button up too.
    const onFocus = () => {
      const rect = btn.getBoundingClientRect();
      update(rect.left + rect.width / 2, rect.top + rect.height / 2);
    };
    const onDown = () => {
      clearHold();
      setFxOn(true);
      hold = setTimeout(() => {
        hold = null;
        setFxOn(false);
      }, TAP_MS);
    };

    btn.addEventListener("focus", onFocus);
    btn.addEventListener("pointerdown", onDown);

    return () => {
      clearHold();
      unsubscribe();
      btn.removeEventListener("focus", onFocus);
      btn.removeEventListener("pointerdown", onDown);
    };
  }, [disabled, proximity]);

  /* ---- Layer 2: the WebGL highlight (only while active) ------------------ */
  useEffect(() => {
    if (!fxOn) return;
    const btn = btnRef.current;
    const fx = fxRef.current;
    if (!btn || !fx) return;

    const dpr = Math.min(Math.max(window.devicePixelRatio || 1, 1), 2);
    let renderer: RendererT;
    let gl: OGLRenderingContext;
    try {
      renderer = new Renderer({ alpha: true, premultipliedAlpha: true, antialias: true, dpr });
      gl = renderer.gl;
    } catch {
      webglUnavailable = true;
      setFxOn(false);
      return;
    }

    gl.clearColor(0, 0, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    const geometry = new Triangle(gl);
    if (geometry.attributes.uv) delete geometry.attributes.uv;

    const program = new Program(gl, {
      vertex: VERT,
      fragment: FRAG,
      uniforms: {
        uCenter: { value: [0, 0] },
        uHalfSize: { value: [1, 1] },
        uRadius: { value: 0 },
        uAngle: { value: 2.4 },
        uPx: { value: dpr },
        uLineColor: { value: [1, 1, 1] },
        uBaseColor: { value: [0.32, 0.32, 0.32] },
        uIntensity: { value: 1 },
        uShineSize: { value: 0.17 },
        uShineFade: { value: 0.7 },
        uThickness: { value: 1 },
        uBaseWidth: { value: dpr },
      },
    });

    const mesh = new Mesh(gl, { geometry, program });
    const canvas = gl.canvas as HTMLCanvasElement;
    fx.appendChild(canvas);

    const sizeRef = { w: 1, h: 1 };
    const resize = () => {
      // Fractional size + explicit center keep the SDF pinned to the exact
      // CSS border instead of drifting a pixel from offsetWidth rounding.
      const rect = btn.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      if (!w || !h) return;
      sizeRef.w = w;
      sizeRef.h = h;
      renderer.setSize(w + PAD * 2, h + PAD * 2);
      program.uniforms.uCenter.value = [(PAD + w / 2) * dpr, (PAD + h / 2) * dpr];
      program.uniforms.uHalfSize.value = [(w / 2) * dpr, (h / 2) * dpr];
    };
    const ro = new ResizeObserver(resize);
    ro.observe(btn);
    resize();

    let angle = 2.4;
    let idleAngle = 2.4;
    let bright = 0;
    let cleared = false;
    let raf = 0;
    let last = performance.now();

    const lineC = new Color();
    const baseC = new Color();

    const draw = (now: number) => {
      const dt = Math.min(Math.max((now - last) / 1000, 0), 0.05);
      last = now;
      const p = propsRef.current;

      idleAngle += p.speed * dt;

      // Steer the light toward the last known pointer position.
      const ptr = pointerRef.current;
      let pointerAngle: number | null = null;
      let proximityT = 0;
      if (ptr) {
        const rect = btn.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = Math.max(rect.left - ptr.x, 0, ptr.x - rect.right);
        const dy = Math.max(rect.top - ptr.y, 0, ptr.y - rect.bottom);
        const dist = Math.hypot(dx, dy);
        if (dist === 0 && rect.width > 0 && rect.height > 0) {
          // Over the button the light settles on the diagonal (framing the
          // corners) and gently sways with the cursor inside the button.
          const nx = (ptr.x - cx) / (rect.width / 2);
          const ny = (cy - ptr.y) / (rect.height / 2);
          pointerAngle = Math.atan2(2 / rect.height, -2 / rect.width) + nx * 0.3 + ny * 0.15;
        } else {
          pointerAngle = Math.atan2(cy - ptr.y, ptr.x - cx);
        }
        const t = Math.max(0, 1 - dist / Math.max(p.proximity, 1));
        proximityT = t * t * (3 - 2 * t);
      }

      const steer = p.followMouse && pointerAngle !== null && (!p.autoAnimate || proximityT > 0);
      const target = steer ? (pointerAngle as number) : idleAngle;
      const diff = ((target - angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      angle += diff * (1 - Math.exp(-dt * 7));

      // Shine fades in with pointer proximity unless autoAnimate keeps it on
      const brightTarget = p.autoAnimate ? 1 : proximityT;
      bright += (brightTarget - bright) * (1 - Math.exp(-dt * 8));

      // Nothing visible: clear once and idle instead of redrawing the same void.
      if (bright < 0.002 && !p.autoAnimate) {
        if (!cleared) {
          gl.clear(gl.COLOR_BUFFER_BIT);
          cleared = true;
        }
        return;
      }
      cleared = false;

      lineC.set(p.lineColor);
      baseC.set(p.baseColor);
      program.uniforms.uAngle.value = angle;
      program.uniforms.uRadius.value = Math.min(p.radius, Math.min(sizeRef.w, sizeRef.h) / 2) * dpr;
      program.uniforms.uLineColor.value = [lineC.r, lineC.g, lineC.b];
      program.uniforms.uBaseColor.value = [baseC.r, baseC.g, baseC.b];
      program.uniforms.uIntensity.value = p.intensity * bright;
      program.uniforms.uShineSize.value = (p.shineSize * Math.PI) / 180;
      program.uniforms.uShineFade.value = (p.shineFade * Math.PI) / 180;
      program.uniforms.uThickness.value = p.thickness * dpr;
      renderer.render({ scene: mesh as MeshT });
    };

    const loop = (now: number) => {
      raf = window.requestAnimationFrame(loop);
      draw(now);
    };
    const start = () => {
      if (raf) return;
      last = performance.now();
      raf = window.requestAnimationFrame(loop);
    };
    const stop = () => {
      if (raf) window.cancelAnimationFrame(raf);
      raf = 0;
    };
    start();

    const onVisibility = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stop();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      try {
        (mesh as unknown as { remove?: () => void })?.remove?.();
        program.remove();
        geometry.remove();
        canvas.remove();
        gl.getExtension("WEBGL_lose_context")?.loseContext();
      } catch {
        /* best-effort cleanup */
      }
    };
  }, [fxOn]);

  const classes = `specular-button specular-button--${size}${className ? ` ${className}` : ""}`;
  const vars = {
    "--sb-radius": `${radius}px`,
    "--sb-tint": tint,
    "--sb-tint-opacity": tintOpacity,
    "--sb-blur": `${blur}px`,
    "--sb-text-color": textColor,
    ...style,
  } as CSSProperties;

  const inner = (
    <>
      <span ref={fxRef} className="specular-button__fx" aria-hidden="true" />
      <span className="specular-button__label">{children}</span>
    </>
  );

  if (href && !disabled) {
    return (
      <Link
        ref={btnRef as Ref<HTMLAnchorElement>}
        href={href}
        className={classes}
        style={vars}
        onClick={onClick}
      >
        {inner}
      </Link>
    );
  }

  return (
    <button
      ref={btnRef as Ref<HTMLButtonElement>}
      type={type}
      disabled={disabled}
      aria-disabled={disabled || undefined}
      aria-busy={ariaBusy || undefined}
      onClick={onClick}
      form={form}
      className={classes}
      style={vars}
    >
      {inner}
    </button>
  );
}
