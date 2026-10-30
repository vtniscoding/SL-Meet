import { brandColors, roomColors, statusColors } from '../theme/colors';

// Standard MediaPipe 21-keypoint hand skeleton connections
const HAND_BONE_CONNECTIONS = [
  // Thumb
  [0, 1], [1, 2], [2, 3], [3, 4],
  // Index finger
  [0, 5], [5, 6], [6, 7], [7, 8],
  // Middle finger
  [5, 9], [9, 10], [10, 11], [11, 12],
  // Ring finger
  [9, 13], [13, 14], [14, 15], [15, 16],
  // Pinky & Palm base
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
];

// Key joints for motion trajectory visualization: Wrist (0), Thumb Tip (4), Index Tip (8)
const TRAIL_JOINT_INDICES = [0, 4, 8];
const MAX_TRAIL_POINTS = 18;
const TRAIL_MAX_AGE_MS = 420;
const GRACE_HOLD_MS = 650;

function clamp(val, min, max) {
  return Math.min(max, Math.max(min, val));
}

function hexToRgba(hex, alpha) {
  const clean = (hex || '#5CA0F2').replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16) || 92;
  const g = parseInt(clean.substring(2, 4), 16) || 160;
  const b = parseInt(clean.substring(4, 6), 16) || 242;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * 2-Hand Auto-Follow Camera & Motion Trajectory Engine
 *
 * - Smoothly pans & zooms (1.0x - 2.6x) around 1 or 2 signing hands with deadband + adaptive EMA.
 * - Matches hands across frames via Nearest-Wrist Spatial Slot Assignment with immediate ghost clearing.
 * - Stabilizes Left (#10B981) vs Right (#5CA0F2) identity using velocity-weighted temporal hysteresis
 *   so fast motion blur never flips hand color or stacks duplicate skeletons.
 */
export class HandMotionCameraTracker {
  constructor() {
    this.autoFollowEnabled = true;

    // Smoothed camera viewport state in mirrored normalized coordinates [0..1]
    this.smoothCx = 0.5;
    this.smoothCy = 0.5;
    this.smoothScale = 1.0; // 1.0 = full vertical height, 0.38 = ~2.63x zoom

    // Last valid hand detection timestamp & target hold state
    this.lastDetectedAt = 0;
    this.heldTargetCx = 0.5;
    this.heldTargetCy = 0.5;
    this.heldTargetScale = 1.0;
    this.lastProcessedResultAt = 0;

    // Two persistent tracking slots (colors dynamically follow stabilized 'L' / 'R' identity)
    this.slots = [this._createEmptySlot(0), this._createEmptySlot(1)];
  }

  _createEmptySlot(id) {
    return {
      id,
      handSide: id === 0 ? 'L' : 'R',
      rightScore: 0, // < 0 => Left ('L'), > 0 => Right ('R')
      color: id === 0 ? statusColors.success : brandColors.primary,
      wrist: null,
      smoothedLandmarks: null,
      velocity: 0,
      lastSeenAt: 0,
      trails: {
        0: [],
        4: [],
        8: [],
      },
    };
  }

  setAutoFollow(enabled) {
    this.autoFollowEnabled = Boolean(enabled);
  }

  reset() {
    this.smoothCx = 0.5;
    this.smoothCy = 0.5;
    this.smoothScale = 1.0;
    this.lastDetectedAt = 0;
    this.lastProcessedResultAt = 0;
    this.slots = [this._createEmptySlot(0), this._createEmptySlot(1)];
  }

  _clearSlotImmediate(slot) {
    slot.smoothedLandmarks = null;
    slot.wrist = null;
    slot.velocity = 0;
    slot.rightScore = 0;
    TRAIL_JOINT_INDICES.forEach((jIdx) => {
      slot.trails[jIdx] = [];
    });
  }

  /**
   * Updates persistent hand slots & motion trails whenever a new MediaPipe frame arrives
   */
  _ingestResults(results, resultTimestamp, now) {
    if (!results || resultTimestamp === this.lastProcessedResultAt) {
      this._pruneExpiredTrails(now);
      return;
    }
    this.lastProcessedResultAt = resultTimestamp;

    const rawHands = results.multiHandLandmarks || [];
    const rawHandedness = results.multiHandedness || [];

    // Convert raw landmarks to mirrored normalized space (mx = 1 - x, my = y)
    const mirroredHands = rawHands
      .map((lm, idx) => {
        if (!lm || lm.length < 21) return null;
        const points = lm.map((p) => ({
          x: 1 - p.x,
          y: p.y,
          z: p.z || 0,
        }));
        const mpLabel = rawHandedness[idx]?.label || '';
        const mpConfidence = clamp(rawHandedness[idx]?.score ?? 0.7, 0.5, 1.0);
        // Raw video fed to MediaPipe is un-mirrored: MediaPipe 'Left' = physical Right ('R'), 'Right' = physical Left ('L')
        const rawSideVote = mpLabel === 'Left' ? 1 : mpLabel === 'Right' ? -1 : 0;
        return { points, wrist: points[0], rawSideVote, mpConfidence };
      })
      .filter(Boolean);

    if (mirroredHands.length === 0) {
      // Clear active skeletons promptly when no hand is present to avoid floating ghosts
      for (const slot of this.slots) {
        if (now - slot.lastSeenAt > 90) {
          slot.smoothedLandmarks = null;
          slot.velocity = 0;
        }
      }
      this._pruneExpiredTrails(now);
      return;
    }

    const assignments = [null, null];

    if (mirroredHands.length === 1) {
      const h = mirroredHands[0];
      const slot0Recent = this.slots[0].smoothedLandmarks && now - this.slots[0].lastSeenAt < 400;
      const slot1Recent = this.slots[1].smoothedLandmarks && now - this.slots[1].lastSeenAt < 400;
      const d0 = this._slotDistance(this.slots[0], h.wrist, now);
      const d1 = this._slotDistance(this.slots[1], h.wrist, now);

      let chosenSlot = 0;
      if (slot0Recent && !slot1Recent && d0 < 0.68) {
        chosenSlot = 0;
      } else if (slot1Recent && !slot0Recent && d1 < 0.68) {
        chosenSlot = 1;
      } else if (slot0Recent || slot1Recent) {
        chosenSlot = d0 <= d1 ? 0 : 1;
      } else {
        // Fresh single-hand entry: choose slot matching initial handedness vote
        chosenSlot = h.rawSideVote > 0 ? 1 : 0;
      }

      assignments[chosenSlot] = h;
      // Immediately clear the unused slot so a second ghost skeleton NEVER appears on a 1-hand sweep
      this._clearSlotImmediate(this.slots[1 - chosenSlot]);
    } else {
      const hA = mirroredHands[0];
      const hB = mirroredHands[1];
      const slot0Active = now - this.slots[0].lastSeenAt < 450 && this.slots[0].wrist;
      const slot1Active = now - this.slots[1].lastSeenAt < 450 && this.slots[1].wrist;

      if (slot0Active || slot1Active) {
        const costDirect =
          this._slotDistance(this.slots[0], hA.wrist, now) +
          this._slotDistance(this.slots[1], hB.wrist, now);
        const costSwapped =
          this._slotDistance(this.slots[0], hB.wrist, now) +
          this._slotDistance(this.slots[1], hA.wrist, now);

        if (costDirect <= costSwapped) {
          assignments[0] = hA;
          assignments[1] = hB;
        } else {
          assignments[0] = hB;
          assignments[1] = hA;
        }
      } else if (hA.wrist.x <= hB.wrist.x) {
        assignments[0] = hA;
        assignments[1] = hB;
      } else {
        assignments[0] = hB;
        assignments[1] = hA;
      }
    }

    // Update each assigned slot's smoothed landmarks, velocity, handedness hysteresis, and trails
    for (let s = 0; s < 2; s++) {
      const slot = this.slots[s];
      const assigned = assignments[s];
      if (!assigned) continue;

      const isContinuing = Boolean(slot.smoothedLandmarks && now - slot.lastSeenAt < 350);

      if (isContinuing) {
        let dispSum = 0;
        for (const k of [0, 4, 8, 12, 16, 20]) {
          dispSum += Math.hypot(
            assigned.points[k].x - slot.smoothedLandmarks[k].x,
            assigned.points[k].y - slot.smoothedLandmarks[k].y
          );
        }
        const rawVel = dispSum / 6;
        slot.velocity = 0.55 * slot.velocity + 0.45 * rawVel;
        const alpha = clamp(0.5 + slot.velocity * 4.5, 0.48, 0.9);

        slot.smoothedLandmarks = assigned.points.map((pt, idx) => ({
          x: slot.smoothedLandmarks[idx].x + alpha * (pt.x - slot.smoothedLandmarks[idx].x),
          y: slot.smoothedLandmarks[idx].y + alpha * (pt.y - slot.smoothedLandmarks[idx].y),
          z: pt.z,
        }));

        // Velocity-damped handedness update: freeze L/R flips during fast motion blur,
        // and converge rapidly when hand settles clearly with high classifier confidence
        const motionDamp = 1 - clamp(slot.velocity * 14, 0, 0.92);
        const confWeight =
          slot.velocity < 0.018 && assigned.mpConfidence >= 0.85
            ? 0.55
            : assigned.mpConfidence >= 0.78
            ? 0.32
            : 0.05;
        const voteAlpha = motionDamp * confWeight;
        const candidateScore = assigned.rawSideVote * assigned.mpConfidence;
        slot.rightScore = clamp(
          slot.rightScore * (1 - voteAlpha) + candidateScore * voteAlpha,
          -1,
          1
        );
      } else {
        slot.smoothedLandmarks = assigned.points;
        slot.velocity = 0;
        const spatialPrior = (assigned.wrist.x - 0.5) * 0.35;
        slot.rightScore = clamp(
          assigned.rawSideVote * assigned.mpConfidence +
            (assigned.mpConfidence < 0.72 ? spatialPrior : 0),
          -1,
          1
        );
        TRAIL_JOINT_INDICES.forEach((jIdx) => {
          slot.trails[jIdx] = [];
        });
      }

      slot.wrist = slot.smoothedLandmarks[0];
      slot.lastSeenAt = now;

      // Append trail points in normalized mirrored camera space
      for (const jIdx of TRAIL_JOINT_INDICES) {
        const joint = slot.smoothedLandmarks[jIdx];
        const trail = slot.trails[jIdx];
        trail.push({ x: joint.x, y: joint.y, t: now });
        if (trail.length > MAX_TRAIL_POINTS) {
          trail.shift();
        }
      }
    }

    // Resolve final 'L' / 'R' side & color:
    // - If 2 hands are visible simultaneously, guarantee mutual exclusion (1 Left + 1 Right)
    // - If 1 hand is visible, color strictly by its stabilized rightScore (never by screen X side)
    if (assignments[0] && assignments[1]) {
      const score0 =
        this.slots[0].rightScore + (this.slots[0].wrist.x - 0.5) * 0.25;
      const score1 =
        this.slots[1].rightScore + (this.slots[1].wrist.x - 0.5) * 0.25;

      if (score0 <= score1) {
        this._applySideStyle(this.slots[0], 'L');
        this._applySideStyle(this.slots[1], 'R');
      } else {
        this._applySideStyle(this.slots[0], 'R');
        this._applySideStyle(this.slots[1], 'L');
      }
    } else {
      const activeIdx = assignments[0] ? 0 : 1;
      const side = this.slots[activeIdx].rightScore >= 0 ? 'R' : 'L';
      this._applySideStyle(this.slots[activeIdx], side);
    }

    this._pruneExpiredTrails(now);
  }

  _applySideStyle(slot, side) {
    slot.handSide = side;
    slot.color = side === 'R' ? brandColors.primary : statusColors.success;
  }

  _slotDistance(slot, wrist, now) {
    if (!slot.wrist || now - slot.lastSeenAt > 450) {
      return 0.75;
    }
    return Math.hypot(wrist.x - slot.wrist.x, wrist.y - slot.wrist.y);
  }

  _pruneExpiredTrails(now) {
    for (const slot of this.slots) {
      for (const jIdx of TRAIL_JOINT_INDICES) {
        const trail = slot.trails[jIdx];
        while (trail.length > 0 && now - trail[0].t > TRAIL_MAX_AGE_MS) {
          trail.shift();
        }
      }
    }
  }

  /**
   * Renders one 60 FPS frame onto the target canvas
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {HTMLVideoElement} videoEl
   * @param {Object|null} trackingPayload - { results, updatedAt }
   * @returns {Object} Frame telemetry { handCount, zoomFactor, isMoving }
   */
  renderFrame(ctx, videoEl, trackingPayload) {
    if (!ctx || !ctx.canvas) {
      return { handCount: 0, zoomFactor: 1.0, isMoving: false };
    }

    const now = performance.now();
    const epochNow = Date.now();
    const canvas = ctx.canvas;
    const canvasW = canvas.width;
    const canvasH = canvas.height;

    if (canvasW === 0 || canvasH === 0) {
      return { handCount: 0, zoomFactor: 1.0, isMoving: false };
    }

    const hasFreshResults =
      trackingPayload &&
      trackingPayload.results &&
      epochNow - (trackingPayload.updatedAt || 0) < 350;

    if (hasFreshResults) {
      this._ingestResults(trackingPayload.results, trackingPayload.updatedAt, now);
    } else {
      for (const slot of this.slots) {
        if (now - slot.lastSeenAt > 120) {
          slot.smoothedLandmarks = null;
        }
      }
      this._pruneExpiredTrails(now);
    }

    const activeSlots = this.slots.filter(
      (s) => s.smoothedLandmarks && now - s.lastSeenAt < 120
    );
    const handCount = activeSlots.length;
    const maxVelocity = activeSlots.reduce((m, s) => Math.max(m, s.velocity), 0);

    const videoReady =
      videoEl && videoEl.readyState >= 2 && videoEl.videoWidth > 0 && videoEl.videoHeight > 0;
    const videoW = videoReady ? videoEl.videoWidth : 1280;
    const videoH = videoReady ? videoEl.videoHeight : 720;
    const videoAspect = videoW / videoH;
    const canvasAspect = canvasW / canvasH;

    // 1. Compute target camera viewport (cx, cy, vertical scale)
    let targetCx = 0.5;
    let targetCy = 0.5;
    let targetScale = 1.0;
    let activeBBox = null;

    if (handCount > 0) {
      let minX = 1;
      let maxX = 0;
      let minY = 1;
      let maxY = 0;

      for (const slot of activeSlots) {
        for (const p of slot.smoothedLandmarks) {
          if (p.x < minX) minX = p.x;
          if (p.x > maxX) maxX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.y > maxY) maxY = p.y;
        }
      }

      activeBBox = { minX, maxX, minY, maxY };
      this.lastDetectedAt = now;

      if (this.autoFollowEnabled) {
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        const spanX = maxX - minX;
        const spanY = maxY - minY;

        const motionMargin = clamp(maxVelocity * 1.8, 0, 0.12);
        const padX = 0.16 + motionMargin;
        const padY = 0.18 + motionMargin;

        const neededW = spanX + padX * 2;
        const neededH = spanY + padY * 2;
        const equivalentHFromW = neededW * (videoAspect / canvasAspect);

        targetScale = clamp(Math.max(neededH, equivalentHFromW), 0.38, 1.0);
        targetCx = cx;
        targetCy = cy;

        this.heldTargetCx = targetCx;
        this.heldTargetCy = targetCy;
        this.heldTargetScale = targetScale;
      }
    } else if (this.autoFollowEnabled && now - this.lastDetectedAt < GRACE_HOLD_MS) {
      targetCx = this.heldTargetCx;
      targetCy = this.heldTargetCy;
      targetScale = this.heldTargetScale;
    }

    // 2. Deadband + Adaptive Exponential Smoothing
    const distDelta = Math.hypot(targetCx - this.smoothCx, targetCy - this.smoothCy);
    const posAlpha = !this.autoFollowEnabled
      ? 0.16
      : distDelta < 0.011
      ? 0.025
      : clamp(0.12 + distDelta * 0.65, 0.12, 0.28);

    const zoomAlpha = !this.autoFollowEnabled ? 0.14 : 0.09;

    this.smoothCx += posAlpha * (targetCx - this.smoothCx);
    this.smoothCy += posAlpha * (targetCy - this.smoothCy);
    this.smoothScale += zoomAlpha * (targetScale - this.smoothScale);

    // 3. Aspect-correct normalized crop window in mirrored space [leftM, topM, cropW, cropH]
    let cropH = clamp(this.smoothScale, 0.38, 1.0);
    let cropW = cropH * (canvasAspect / videoAspect);
    if (cropW > 1.0) {
      cropW = 1.0;
      cropH = clamp(cropW * (videoAspect / canvasAspect), 0.25, 1.0);
    }

    const leftM = clamp(this.smoothCx - cropW / 2, 0, Math.max(0, 1 - cropW));
    const topM = clamp(this.smoothCy - cropH / 2, 0, Math.max(0, 1 - cropH));

    const projectPoint = (mx, my) => ({
      x: ((mx - leftM) / cropW) * canvasW,
      y: ((my - topM) / cropH) * canvasH,
    });

    // 4. Draw Mirrored & Auto-Cropped Camera Frame
    ctx.save();
    ctx.fillStyle = roomColors.surface;
    ctx.fillRect(0, 0, canvasW, canvasH);

    if (videoReady) {
      const sx = clamp((1 - (leftM + cropW)) * videoW, 0, videoW);
      const sy = clamp(topM * videoH, 0, videoH);
      const sw = clamp(cropW * videoW, 1, videoW - sx);
      const sh = clamp(cropH * videoH, 1, videoH - sy);

      ctx.save();
      ctx.translate(canvasW, 0);
      ctx.scale(-1, 1);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(videoEl, sx, sy, sw, sh, 0, 0, canvasW, canvasH);
      ctx.restore();

      ctx.fillStyle = 'rgba(0, 0, 0, 0.14)';
      ctx.fillRect(0, 0, canvasW, canvasH);
    }

    // 5. Draw Tapered Fading Motion Trails (Only for currently active slots!)
    for (const slot of activeSlots) {
      for (const jIdx of TRAIL_JOINT_INDICES) {
        const trail = slot.trails[jIdx];
        if (trail.length < 2) continue;

        const isWrist = jIdx === 0;
        const maxWidth = isWrist ? 4.5 : 3.2;

        for (let i = 1; i < trail.length; i++) {
          const prevPt = projectPoint(trail[i - 1].x, trail[i - 1].y);
          const curPt = projectPoint(trail[i].x, trail[i].y);
          const ageRatio = clamp(1 - (now - trail[i].t) / TRAIL_MAX_AGE_MS, 0, 1);
          const progress = i / trail.length;
          const alpha = ageRatio * progress * (isWrist ? 0.65 : 0.85);

          if (alpha <= 0.02) continue;

          ctx.beginPath();
          ctx.moveTo(prevPt.x, prevPt.y);
          ctx.lineTo(curPt.x, curPt.y);
          ctx.strokeStyle = hexToRgba(slot.color, alpha.toFixed(3));
          ctx.lineWidth = Math.max(1.2, maxWidth * progress);
          ctx.lineCap = 'round';
          ctx.stroke();
        }
      }
    }

    // 6. Draw Dual-Hand 21-Point Skeletons + Wrist L/R Tag
    for (const slot of activeSlots) {
      const pts = slot.smoothedLandmarks.map((p) => projectPoint(p.x, p.y));

      ctx.save();
      ctx.strokeStyle = slot.color;
      ctx.lineWidth = 2.6;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.shadowColor = hexToRgba(slot.color, 0.45);
      ctx.shadowBlur = 6;

      ctx.beginPath();
      for (const [a, b] of HAND_BONE_CONNECTIONS) {
        ctx.moveTo(pts[a].x, pts[a].y);
        ctx.lineTo(pts[b].x, pts[b].y);
      }
      ctx.stroke();
      ctx.restore();

      for (let i = 0; i < pts.length; i++) {
        const isFingertipOrWrist = i === 0 || i === 4 || i === 8 || i === 12 || i === 16 || i === 20;
        const radius = isFingertipOrWrist ? 4.2 : 2.8;

        ctx.beginPath();
        ctx.arc(pts[i].x, pts[i].y, radius, 0, Math.PI * 2);
        ctx.fillStyle = isFingertipOrWrist ? '#FFFFFF' : slot.color;
        ctx.fill();
        ctx.lineWidth = 1.4;
        ctx.strokeStyle = isFingertipOrWrist ? slot.color : '#FFFFFF';
        ctx.stroke();
      }
    }

    // 7. Draw Subtle Active Tracking Corner Brackets around signing zone
    if (activeBBox && handCount > 0) {
      const pad = 0.035;
      const tl = projectPoint(
        clamp(activeBBox.minX - pad, leftM, leftM + cropW),
        clamp(activeBBox.minY - pad, topM, topM + cropH)
      );
      const br = projectPoint(
        clamp(activeBBox.maxX + pad, leftM, leftM + cropW),
        clamp(activeBBox.maxY + pad, topM, topM + cropH)
      );
      const boxW = Math.max(24, br.x - tl.x);
      const boxH = Math.max(24, br.y - tl.y);
      const cornerLen = Math.min(14, boxW * 0.22, boxH * 0.22);

      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';

      ctx.beginPath();
      ctx.moveTo(tl.x, tl.y + cornerLen);
      ctx.lineTo(tl.x, tl.y);
      ctx.lineTo(tl.x + cornerLen, tl.y);

      ctx.moveTo(br.x - cornerLen, tl.y);
      ctx.lineTo(br.x, tl.y);
      ctx.lineTo(br.x, tl.y + cornerLen);

      ctx.moveTo(tl.x, br.y - cornerLen);
      ctx.lineTo(tl.x, br.y);
      ctx.lineTo(tl.x + cornerLen, br.y);

      ctx.moveTo(br.x - cornerLen, br.y);
      ctx.lineTo(br.x, br.y);
      ctx.lineTo(br.x, br.y - cornerLen);
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();

    const zoomFactor = parseFloat((1 / cropH).toFixed(1));
    return {
      handCount,
      zoomFactor,
      isMoving: maxVelocity > 0.018,
    };
  }
}
