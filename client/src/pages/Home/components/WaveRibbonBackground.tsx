import React, { useEffect, useRef } from 'react';

export type RGB = [number, number, number] | readonly [number, number, number];

export interface WaveRibbonBackgroundProps {
  /**
   * Number of wave lines in the ribbon (default: 28)
   */
  lineCount?: number;
  /**
   * Time multiplier speed factor (default: 1.0)
   */
  speed?: number;
  /**
   * Wave vertical amplitude factor (default: 1.1)
   */
  amplitude?: number;
  /**
   * Ribbon twist intensity factor (default: 1.3)
   */
  twist?: number;
  /**
   * Vertical center offset factor relative to height (-0.06 shifts effect upward slightly, default: -0.06)
   */
  offsetY?: number;
  /**
   * Start and end RGB colors for the ribbon gradient [startRGB, endRGB]
   * Default: [[176, 96, 245], [70, 205, 235]] (Purple -> Cyan)
   */
  palette?: [RGB, RGB];
  /**
   * Line stroke thickness in pixels (default: 0.9)
   */
  lineWidth?: number;
  /**
   * Line opacity alpha between 0 and 1 (default: 0.85)
   */
  alpha?: number;
  /**
   * Canvas background fill color, or 'transparent' (default: '#05050a')
   */
  background?: string;
  /**
   * Optional custom CSS class name for canvas
   */
  className?: string;
  /**
   * Optional custom zIndex (default: 0 so it stays above parent backgrounds)
   */
  zIndex?: number;
  /**
   * Optional inline styles for canvas
   */
  style?: React.CSSProperties;
}

/**
 * Linearly interpolates between two RGB colors and formats into rgba string.
 */
function lerpColor(c0: RGB, c1: RGB, k: number, alpha: number): string {
  const r = Math.round(c0[0] + (c1[0] - c0[0]) * k);
  const g = Math.round(c0[1] + (c1[1] - c0[1]) * k);
  const b = Math.round(c0[2] + (c1[2] - c0[2]) * k);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * WaveRibbonBackground Component
 * Renders an animated ribbon of flowing, intertwining mathematical wave lines on HTML5 Canvas.
 * - Hardware-accelerated with devicePixelRatio scaling via ResizeObserver.
 * - Automatically pauses rendering when tab is hidden to conserve CPU/GPU.
 * - Respects prefers-reduced-motion media query (reduces speed to 15%).
 * - Absolute overlay with pointer-events: none, z-index: -1.
 */
export default function WaveRibbonBackground({
  lineCount = 28,
  speed = 1.0,
  amplitude = 1.1,
  twist = 1.3,
  offsetY = -0.06,
  palette = [
    [176, 96, 245],
    [70, 205, 235],
  ],
  lineWidth = 0.9,
  alpha = 0.85,
  background = '#05050a',
  zIndex = 0,
  className = '',
  style = {},
}: WaveRibbonBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Keep animated params accessible to rAF render loop without recreating listeners
  const paramsRef = useRef({
    lineCount,
    speed,
    amplitude,
    twist,
    offsetY,
    palette,
    lineWidth,
    alpha,
    background,
  });

  useEffect(() => {
    paramsRef.current = {
      lineCount,
      speed,
      amplitude,
      twist,
      offsetY,
      palette,
      lineWidth,
      alpha,
      background,
    };
  }, [lineCount, speed, amplitude, twist, palette, lineWidth, alpha, background]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let accumulatedTime = 0;
    let lastTimestamp = performance.now();
    let isTabVisible = !document.hidden;

    // Detect user accessibility preferences for reduced motion
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let prefersReducedMotion = motionQuery.matches;

    const handleMotionChange = (e: MediaQueryListEvent) => {
      prefersReducedMotion = e.matches;
    };
    motionQuery.addEventListener?.('change', handleMotionChange);

    // Track width and height in logical CSS pixels
    let cssWidth = 0;
    let cssHeight = 0;

    const updateCanvasDimensions = (width: number, height: number) => {
      if (width <= 0 || height <= 0) return;
      cssWidth = width;
      cssHeight = height;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    // ResizeObserver dynamically syncs canvas size with parent container
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        updateCanvasDimensions(width, height);
      }
    });

    const parentNode = canvas.parentElement || canvas;
    resizeObserver.observe(parentNode);

    // Initial sizing fallback
    const initialRect = parentNode.getBoundingClientRect();
    updateCanvasDimensions(initialRect.width, initialRect.height);

    // Core Frame Drawing Routine
    const drawFrame = (t: number) => {
      let w = cssWidth;
      let h = cssHeight;
      if (w <= 0 || h <= 0) {
        const rect = canvas.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          updateCanvasDimensions(rect.width, rect.height);
          w = rect.width;
          h = rect.height;
        } else {
          return;
        }
      }

      const {
        lineCount: n,
        amplitude: A,
        twist: tw,
        offsetY: offY,
        palette: pal,
        lineWidth: lw,
        alpha: al,
        background: bg,
      } = paramsRef.current;

      // 1. Draw canvas background
      if (bg && bg !== 'transparent') {
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, w, h);
      } else {
        ctx.clearRect(0, 0, w, h);
      }

      const totalLines = Math.max(n, 1);
      const [c0, c1] = pal;

      // 2. Render interwoven mathematical ribbon lines
      for (let i = 0; i < totalLines; i++) {
        const k = totalLines > 1 ? i / (totalLines - 1) : 0;
        const u = k * 2 - 1;

        ctx.beginPath();
        let isFirstPoint = true;

        for (let x = -4; x <= w + 4; x += 5) {
          const xn = x / w;
          const center =
            h * (0.5 + offY) +
            Math.sin(xn * 3.1 + t * 0.55) * h * 0.13 * A +
            Math.sin(xn * 5.6 - t * 0.4) * h * 0.04 * A;
          const fan = Math.sin(xn * 3.4 + t * 0.5 + u * 1.25 * tw) * h * 0.17 * A;
          const cross = u * Math.sin(xn * 2.2 - t * 0.35 + 1.3) * h * 0.1 * A;
          const y = center + fan + cross;

          if (isFirstPoint) {
            ctx.moveTo(x, y);
            isFirstPoint = false;
          } else {
            ctx.lineTo(x, y);
          }
        }

        ctx.strokeStyle = lerpColor(c0, c1, k, al);
        ctx.lineWidth = lw;
        ctx.stroke();
      }
    };

    // Smooth requestAnimationFrame animation loop
    const animate = (currentTimestamp: number) => {
      const deltaSec = Math.min((currentTimestamp - lastTimestamp) / 1000, 0.1);
      lastTimestamp = currentTimestamp;

      if (isTabVisible) {
        const motionScale = prefersReducedMotion ? 0.15 : 1.0;
        accumulatedTime += deltaSec * paramsRef.current.speed * motionScale;
        drawFrame(accumulatedTime);
      }

      animationFrameId = requestAnimationFrame(animate);
    };

    animationFrameId = requestAnimationFrame(animate);

    // Pause rendering loop when tab is hidden to minimize CPU/GPU usage
    const handleVisibilityChange = () => {
      isTabVisible = !document.hidden;
      if (isTabVisible) {
        lastTimestamp = performance.now();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      motionQuery.removeEventListener?.('change', handleMotionChange);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`absolute inset-0 w-full h-full pointer-events-none select-none ${className}`}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: zIndex ?? (style.zIndex !== undefined ? style.zIndex : 0),
        ...style,
      }}
    />
  );
}

