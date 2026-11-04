import React, { useRef, useEffect, useState } from 'react';

const VERTEX_SHADER_SOURCE = `
  attribute vec2 a_position;
  attribute vec2 a_texCoord;
  varying vec2 v_uv;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_uv = a_texCoord;
  }
`;

const FRAGMENT_SHADER_SOURCE = `
  #ifdef GL_FRAGMENT_PRECISION_HIGH
  precision highp float;
  #else
  precision mediump float;
  #endif

  uniform sampler2D u_video;
  uniform vec3 u_keyColor;
  uniform float u_threshold;
  uniform float u_feather;
  uniform float u_unpremultiply;
  uniform float u_preserveInterior;
  uniform float u_shadowRange;
  uniform vec2 u_texelStep;
  varying vec2 v_uv;

  float colorDist(vec3 c) {
    return length(c - u_keyColor) * 0.57735027;
  }

  bool isKeySample(vec2 uv) {
    vec2 clamped = clamp(uv, vec2(0.001), vec2(0.999));
    return colorDist(texture2D(u_video, clamped).rgb) < u_threshold;
  }

  void main() {
    vec4 tex = texture2D(u_video, v_uv);
    vec3 rgb = tex.rgb;
    float d0 = colorDist(rgb);

    float maxRange = max(u_threshold + u_feather, u_shadowRange);
    if (d0 >= maxRange) {
      gl_FragColor = vec4(rgb, 1.0);
      return;
    }

    bool nearExterior = (d0 < u_threshold);
    if (!nearExterior && u_preserveInterior > 0.5) {
      vec2 r = u_texelStep;
      vec2 diag = r * 0.70710678;
      if (
        isKeySample(v_uv + vec2(r.x, 0.0)) ||
        isKeySample(v_uv - vec2(r.x, 0.0)) ||
        isKeySample(v_uv + vec2(0.0, r.y)) ||
        isKeySample(v_uv - vec2(0.0, r.y)) ||
        isKeySample(v_uv + diag) ||
        isKeySample(v_uv - diag) ||
        isKeySample(v_uv + vec2(diag.x, -diag.y)) ||
        isKeySample(v_uv + vec2(-diag.x, diag.y))
      ) {
        nearExterior = true;
      }
    } else if (u_preserveInterior <= 0.5) {
      nearExterior = true;
    }

    if (!nearExterior) {
      gl_FragColor = vec4(rgb, 1.0);
      return;
    }

    float alpha = smoothstep(u_threshold, u_threshold + max(u_feather, 0.0001), d0);

    if (u_shadowRange > u_threshold + u_feather) {
      float maxC = max(rgb.r, max(rgb.g, rgb.b));
      float minC = min(rgb.r, min(rgb.g, rgb.b));
      float sat = maxC - minC;
      if (sat < 0.06) {
        float shadowAlpha = smoothstep(u_threshold, u_shadowRange, d0) * 0.65;
        float satWeight = smoothstep(0.025, 0.06, sat);
        alpha = mix(min(alpha, shadowAlpha), alpha, satWeight);
      }
    }

    if (alpha <= 0.001) {
      gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
      return;
    }

    vec3 cleanRgb = rgb;
    if (u_unpremultiply > 0.5 && alpha < 0.999) {
      cleanRgb = clamp((rgb - (1.0 - alpha) * u_keyColor) / max(alpha, 0.001), 0.0, 1.0);
    }

    gl_FragColor = vec4(cleanRgb * alpha, alpha);
  }
`;

function parseKeyColorNormalized(colorInput) {
  if (Array.isArray(colorInput) && colorInput.length >= 3) {
    const scale = colorInput[0] > 1 || colorInput[1] > 1 || colorInput[2] > 1 ? 255 : 1;
    return [colorInput[0] / scale, colorInput[1] / scale, colorInput[2] / scale];
  }
  if (typeof colorInput === 'string') {
    const hex = colorInput.trim().replace('#', '');
    if (hex.length === 3) {
      return [
        parseInt(hex[0] + hex[0], 16) / 255,
        parseInt(hex[1] + hex[1], 16) / 255,
        parseInt(hex[2] + hex[2], 16) / 255,
      ];
    }
    if (hex.length === 6) {
      return [
        parseInt(hex.slice(0, 2), 16) / 255,
        parseInt(hex.slice(2, 4), 16) / 255,
        parseInt(hex.slice(4, 6), 16) / 255,
      ];
    }
  }
  return [1.0, 1.0, 1.0];
}

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn('[TransparentVideo] Shader compile warning:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

/**
 * TransparentVideo Component
 *
 * Reusable video/animation player with GPU-accelerated background removal.
 *
 * Supported Transparency Modes:
 * 1. Multi-source Alpha Video (WebM VP9 alpha + HEVC alpha) via src={{ webm, mov, mp4 }}.
 * 2. WebGL Shader Chroma / White Keying (via chromaKey prop) with Canvas 2D fallback:
 *    - Removes solid background (white, green, blue, custom hex) at 60fps on GPU.
 *    - Supports threshold, feather, edge color decontamination, soft drop-shadow preservation,
 *      and interior highlight protection.
 *    - Automatically pauses rendering when tab is hidden or video is paused.
 * 3. CSS Mix Blend Mode (via blendMode prop: 'multiply', 'screen', 'normal').
 */
export default function TransparentVideo({
  src,
  poster,
  autoPlay = true,
  loop = true,
  muted = true,
  playsInline = true,
  blendMode = 'normal',
  chromaKey = null,
  className = '',
  style = {},
  filter = '',
  alt = 'SLMeet demonstration video',
  ...restProps
}) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [hasError, setHasError] = useState(false);
  const [useCssFallback, setUseCssFallback] = useState(false);

  const isImageSource =
    typeof src === 'string' && /\.(gif|png|webp|apng|jpe?g)(\?.*)?$/i.test(src);

  const isKeyingActive = Boolean(chromaKey) && !isImageSource && !hasError && !useCssFallback;

  // Imperatively enforce muted state before autoplay to satisfy Chromium/Safari policies
  useEffect(() => {
    const video = videoRef.current;
    if (!video || isImageSource) return;

    video.defaultMuted = Boolean(muted);
    video.muted = Boolean(muted);

    if (autoPlay) {
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.warn('[TransparentVideo] Autoplay prevented:', err.message);
        });
      }
    }
  }, [src, autoPlay, muted, isImageSource]);

  const keyColorRaw = chromaKey?.color ?? '#ffffff';
  const keyColorSerialized = Array.isArray(keyColorRaw)
    ? keyColorRaw.join(',')
    : String(keyColorRaw);
  const keyThresholdProp = chromaKey?.threshold;
  const keyFeatherProp = chromaKey?.feather;
  const keySpillProp = chromaKey?.spillSuppression;
  const keyPreserveInteriorProp = chromaKey?.preserveInterior;
  const keyShadowSoftnessProp = chromaKey?.shadowSoftness;
  const keyExteriorRadiusProp = chromaKey?.exteriorRadius;
  const keyMaxDimensionProp = chromaKey?.maxDimension;

  // WebGL Shader (primary) + Canvas 2D (fallback) Chroma/White Keying Pipeline
  useEffect(() => {
    if (!isKeyingActive) return undefined;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return undefined;

    const [keyR, keyG, keyB] = parseKeyColorNormalized(keyColorRaw);
    const isLightKey = Math.min(keyR, keyG, keyB) > 0.85;
    const threshold = keyThresholdProp ?? (isLightKey ? 0.025 : 0.14);
    const feather = keyFeatherProp ?? (isLightKey ? 0.065 : 0.06);
    const unpremultiply = keySpillProp ?? true;
    const preserveInterior = keyPreserveInteriorProp ?? isLightKey;
    const shadowRange = keyShadowSoftnessProp ?? (isLightKey ? 0.36 : 0.0);
    const exteriorRadius = keyExteriorRadiusProp ?? 0.028;
    const maxDimension = keyMaxDimensionProp ?? 1280;

    let gl = null;
    let program = null;
    let vertShader = null;
    let fragShader = null;
    let buffer = null;
    let texture = null;
    let uniforms = null;
    let ctx2d = null;

    // 1. Try initializing WebGL 1.0 hardware shader pipeline
    try {
      gl =
        canvas.getContext('webgl', {
          alpha: true,
          premultipliedAlpha: true,
          antialias: false,
          depth: false,
          stencil: false,
          preserveDrawingBuffer: false,
        }) ||
        canvas.getContext('experimental-webgl', {
          alpha: true,
          premultipliedAlpha: true,
          antialias: false,
        });

      if (gl) {
        vertShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE);
        fragShader = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SOURCE);
        if (vertShader && fragShader) {
          program = gl.createProgram();
          gl.attachShader(program, vertShader);
          gl.attachShader(program, fragShader);
          gl.linkProgram(program);

          if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            gl.deleteProgram(program);
            program = null;
          }
        }

        if (program) {
          gl.useProgram(program);

          // Fullscreen triangle strip: [x, y, u, v] with top-left UV = (0, 0)
          const quadData = new Float32Array([
            -1, -1, 0, 1,
             1, -1, 1, 1,
            -1,  1, 0, 0,
             1,  1, 1, 0,
          ]);
          buffer = gl.createBuffer();
          gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
          gl.bufferData(gl.ARRAY_BUFFER, quadData, gl.STATIC_DRAW);

          const posLoc = gl.getAttribLocation(program, 'a_position');
          const uvLoc = gl.getAttribLocation(program, 'a_texCoord');
          gl.enableVertexAttribArray(posLoc);
          gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 16, 0);
          gl.enableVertexAttribArray(uvLoc);
          gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 16, 8);

          texture = gl.createTexture();
          gl.bindTexture(gl.TEXTURE_2D, texture);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

          uniforms = {
            video: gl.getUniformLocation(program, 'u_video'),
            keyColor: gl.getUniformLocation(program, 'u_keyColor'),
            threshold: gl.getUniformLocation(program, 'u_threshold'),
            feather: gl.getUniformLocation(program, 'u_feather'),
            unpremultiply: gl.getUniformLocation(program, 'u_unpremultiply'),
            preserveInterior: gl.getUniformLocation(program, 'u_preserveInterior'),
            shadowRange: gl.getUniformLocation(program, 'u_shadowRange'),
            texelStep: gl.getUniformLocation(program, 'u_texelStep'),
          };

          gl.uniform1i(uniforms.video, 0);
          gl.uniform3f(uniforms.keyColor, keyR, keyG, keyB);
          gl.uniform1f(uniforms.threshold, threshold);
          gl.uniform1f(uniforms.feather, feather);
          gl.uniform1f(uniforms.unpremultiply, unpremultiply ? 1.0 : 0.0);
          gl.uniform1f(uniforms.preserveInterior, preserveInterior ? 1.0 : 0.0);
          gl.uniform1f(uniforms.shadowRange, shadowRange);
        } else {
          gl = null;
        }
      }
    } catch {
      gl = null;
    }

    // 2. Fallback to 2D Canvas if WebGL is unavailable
    if (!gl) {
      try {
        ctx2d = canvas.getContext('2d', { willReadFrequently: true });
      } catch {
        ctx2d = null;
      }
      if (!ctx2d) {
        setUseCssFallback(true);
        return undefined;
      }
    }

    let isDisposed = false;
    let rafId = null;
    let vfcId = null;
    let lastRenderedTime = -1;
    const supportsVFC = typeof video.requestVideoFrameCallback === 'function';

    const syncCanvasDimensions = () => {
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!vw || !vh) return false;

      const scale = Math.min(1, maxDimension / Math.max(vw, vh));
      const targetW = Math.max(1, Math.round(vw * scale));
      const targetH = Math.max(1, Math.round(vh * scale));

      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
        if (gl && uniforms) {
          gl.viewport(0, 0, targetW, targetH);
          const aspect = vw / vh;
          gl.uniform2f(
            uniforms.texelStep,
            exteriorRadius,
            exteriorRadius * aspect
          );
        }
      }
      return true;
    };

    const drawCurrentFrame = () => {
      if (isDisposed || video.readyState < 2) return;
      if (!syncCanvasDimensions()) return;

      if (gl && program && texture) {
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      } else if (ctx2d) {
        const w = canvas.width;
        const h = canvas.height;
        ctx2d.drawImage(video, 0, 0, w, h);
        const frame = ctx2d.getImageData(0, 0, w, h);
        const data = frame.data;
        const tDist = threshold * 441.6729;
        const fDist = Math.max(feather * 441.6729, 0.01);
        const kr = keyR * 255;
        const kg = keyG * 255;
        const kb = keyB * 255;

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const dist = Math.hypot(r - kr, g - kg, b - kb);
          if (dist <= tDist) {
            data[i + 3] = 0;
          } else if (dist < tDist + fDist) {
            const t = (dist - tDist) / fDist;
            const alpha = t * t * (3 - 2 * t);
            if (unpremultiply && alpha > 0.001) {
              data[i] = Math.min(255, Math.max(0, (r - (1 - alpha) * kr) / alpha));
              data[i + 1] = Math.min(255, Math.max(0, (g - (1 - alpha) * kg) / alpha));
              data[i + 2] = Math.min(255, Math.max(0, (b - (1 - alpha) * kb) / alpha));
            }
            data[i + 3] = Math.round(alpha * 255);
          }
        }
        ctx2d.putImageData(frame, 0, 0);
      }
    };

    const cancelScheduledTick = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      if (vfcId !== null && supportsVFC) {
        video.cancelVideoFrameCallback(vfcId);
        vfcId = null;
      }
    };

    const scheduleNextTick = () => {
      if (isDisposed || document.hidden || video.paused || video.ended) return;

      if (supportsVFC) {
        vfcId = video.requestVideoFrameCallback(() => {
          vfcId = null;
          drawCurrentFrame();
          scheduleNextTick();
        });
      } else {
        rafId = requestAnimationFrame(() => {
          rafId = null;
          if (video.currentTime !== lastRenderedTime) {
            lastRenderedTime = video.currentTime;
            drawCurrentFrame();
          }
          scheduleNextTick();
        });
      }
    };

    const handlePlayOrReady = () => {
      drawCurrentFrame();
      cancelScheduledTick();
      scheduleNextTick();
    };

    const handlePause = () => {
      cancelScheduledTick();
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        cancelScheduledTick();
      } else {
        if (video.paused && autoPlay) {
          video.play().catch(() => {});
        }
        handlePlayOrReady();
      }
    };

    const handleContextLost = (e) => {
      e.preventDefault();
      cancelScheduledTick();
      setUseCssFallback(true);
    };

    video.addEventListener('loadeddata', handlePlayOrReady);
    video.addEventListener('play', handlePlayOrReady);
    video.addEventListener('playing', handlePlayOrReady);
    video.addEventListener('seeked', drawCurrentFrame);
    video.addEventListener('pause', handlePause);
    video.addEventListener('ended', handlePause);
    canvas.addEventListener('webglcontextlost', handleContextLost);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    if (video.readyState >= 2) {
      handlePlayOrReady();
    }

    return () => {
      isDisposed = true;
      cancelScheduledTick();
      video.removeEventListener('loadeddata', handlePlayOrReady);
      video.removeEventListener('play', handlePlayOrReady);
      video.removeEventListener('playing', handlePlayOrReady);
      video.removeEventListener('seeked', drawCurrentFrame);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('ended', handlePause);
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      document.removeEventListener('visibilitychange', handleVisibilityChange);

      if (gl) {
        if (texture) gl.deleteTexture(texture);
        if (buffer) gl.deleteBuffer(buffer);
        if (vertShader) gl.deleteShader(vertShader);
        if (fragShader) gl.deleteShader(fragShader);
        if (program) gl.deleteProgram(program);
      }
    };
  }, [
    isKeyingActive,
    keyColorSerialized,
    keyThresholdProp,
    keyFeatherProp,
    keySpillProp,
    keyPreserveInteriorProp,
    keyShadowSoftnessProp,
    keyExteriorRadiusProp,
    keyMaxDimensionProp,
    autoPlay,
  ]);

  const effectiveBlendMode =
    !isKeyingActive && blendMode === 'normal' && chromaKey
      ? 'multiply'
      : blendMode;

  const mediaStyle = {
    mixBlendMode: effectiveBlendMode !== 'normal' ? effectiveBlendMode : undefined,
    filter: filter || undefined,
    ...style,
  };

  if (isImageSource) {
    return (
      <img
        src={src}
        alt={alt}
        className={className}
        style={mediaStyle}
        onError={() => setHasError(true)}
        {...restProps}
      />
    );
  }

  if (hasError && poster) {
    return <img src={poster} alt={alt} className={className} style={mediaStyle} {...restProps} />;
  }

  return (
    <>
      {/* Keep <video> 1x1 opacity-0 instead of display:none so Chromium never throttles hardware video decode */}
      <video
        ref={videoRef}
        poster={!isKeyingActive ? poster : undefined}
        autoPlay={autoPlay}
        loop={loop}
        muted={muted}
        playsInline={playsInline}
        aria-label={alt}
        className={
          isKeyingActive
            ? 'absolute w-px h-px opacity-0 pointer-events-none -z-10'
            : className
        }
        style={isKeyingActive ? undefined : mediaStyle}
        onError={() => setHasError(true)}
        {...(!isKeyingActive ? restProps : {})}
      >
        {typeof src === 'string' ? (
          <source src={src} />
        ) : typeof src === 'object' && src !== null ? (
          <>
            {src.webm && <source src={src.webm} type='video/webm; codecs="vp9"' />}
            {src.mov && <source src={src.mov} type='video/mp4; codecs="hvc1"' />}
            {src.mp4 && <source src={src.mp4} type="video/mp4" />}
          </>
        ) : null}
      </video>

      {isKeyingActive && (
        <canvas
          ref={canvasRef}
          aria-label={alt}
          className={className}
          style={mediaStyle}
          {...restProps}
        />
      )}
    </>
  );
}
