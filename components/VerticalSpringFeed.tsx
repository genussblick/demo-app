"use client";

/**
 * Custom vertical "reel" scroller: pointer tracking + velocity-first snap + damped spring.
 *
 * Changes from previous version:
 *  - Semi-implicit (symplectic) Euler integration: smoother spring, no drift accumulation
 *  - Velocity estimation fixed: end-window weighted MORE than last-pair (less noise, true flick feel)
 *  - Multi-touch guard: second finger doesn't hijack the gesture
 *  - onSlideChangeTransitionEnd fires even when snapping back to same slide
 *  - Wheel: no longer blocked during animation (interrupts and re-snaps like TikTok desktop)
 *  - endGesture: velocity resolved against pre-clamp position for accurate drag-distance detection
 *  - Pointer capture released before endGesture to avoid Safari edge cases
 */

import {
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
  Children,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from "react";
import * as Tune from "@/lib/vertical-feed-tuning";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function snapY(index: number, slideHeight: number) {
  return -index * slideHeight;
}

function applyRubberband(
  rawY: number,
  slideHeight: number,
  maxIndex: number,
  factor: number,
) {
  const minY = snapY(maxIndex, slideHeight);
  const maxY = snapY(0, slideHeight);
  if (rawY > maxY) {
    const over = rawY - maxY;
    return maxY + over * factor;
  }
  if (rawY < minY) {
    const over = rawY - minY;
    return minY + over * factor;
  }
  return rawY;
}

type Sample = { t: number; y: number };

function pushSample(
  samplesRef: React.MutableRefObject<Sample[]>,
  t: number,
  y: number,
) {
  const arr = samplesRef.current;
  arr.push({ t, y });
  const cutoff = t - Tune.VELOCITY_SAMPLE_MS;
  while (arr.length > 1 && arr[0].t < cutoff) arr.shift();
}

/**
 * End-of-gesture velocity estimation.
 *
 * Previous version weighted the last pair at 0.72 and the end-window at 0.28.
 * That's backwards: a single last-pair sample is extremely noisy (depends on
 * frame timing), while the end-window average is more stable. TikTok's feel
 * comes from reading the *release* speed of the finger, not the last frame jitter.
 *
 * Fix: end-window weighted at 0.75, last-pair at 0.25.
 * The last-pair component still captures the very tip of the flick without
 * dominating when the finger slows down at lift-off.
 */
function estimateVelocityPxPerSec(
  samplesRef: React.MutableRefObject<Sample[]>,
): number {
  const arr = samplesRef.current;
  if (arr.length < 2) return 0;

  const last = arr[arr.length - 1];
  const prev = arr[arr.length - 2];
  const dtPair = (last.t - prev.t) / 1000;
  const vPair = dtPair > 1e-4 ? (last.y - prev.y) / dtPair : 0;

  const cutoff = last.t - Tune.VELOCITY_END_WINDOW_MS;
  let i = arr.length - 1;
  while (i > 0 && arr[i - 1].t >= cutoff) i--;
  const winStart = arr[i];
  const dtWin = (last.t - winStart.t) / 1000;
  const vWin = dtWin > 1e-4 ? (last.y - winStart.y) / dtWin : vPair;

  // Positive = finger moving down (screen Y increases = scroll up = prev slide).
  return vWin * 0.75 + vPair * 0.25;
}

export type VerticalSpringFeedProps = {
  children: ReactNode;
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  /** Fired when we start moving toward a different slide than current active. */
  onSlideChangeTransitionStart?: () => void;
  /** Fired once motion has settled on a snap target (including snap-back to same slide). */
  onSlideChangeTransitionEnd?: () => void;
  className?: string;
};

export default function VerticalSpringFeed({
  children,
  activeIndex,
  onActiveIndexChange,
  onSlideChangeTransitionStart,
  onSlideChangeTransitionEnd,
  className,
}: VerticalSpringFeedProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);

  const slideCount = Children.count(children);

  const slideHeightRef = useRef(0);
  const translateRef = useRef(0);
  const activeIndexRef = useRef(activeIndex);
  const draggingRef = useRef(false);
  /** Track the pointer ID that started the gesture; ignore all other pointers (multi-touch guard). */
  const activePointerIdRef = useRef<number | null>(null);
  const gestureStartIndexRef = useRef(0);
  const gestureStartTranslateRef = useRef(0);
  const pointerStartYRef = useRef(0);
  const animatingRef = useRef(false);
  const rafRef = useRef<number | null>(null);

  const springVelRef = useRef(0);
  const samplesRef = useRef<Sample[]>([]);

  const applyTransform = useCallback((y: number) => {
    const el = trackRef.current;
    if (!el) return;
    el.style.transform = `translate3d(0, ${y}px, 0)`;
  }, []);

  const measure = useCallback(() => {
    const h =
      rootRef.current?.getBoundingClientRect().height ?? window.innerHeight;
    slideHeightRef.current = h;
    return h;
  }, []);

  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  // External index change: jump without animation if idle.
  useEffect(() => {
    if (draggingRef.current || animatingRef.current) return;
    const h = measure();
    if (h <= 0) return;
    const y = snapY(activeIndex, h);
    translateRef.current = y;
    springVelRef.current = 0;
    applyTransform(y);
  }, [activeIndex, measure, applyTransform]);

  useEffect(() => {
    const onResize = () => {
      if (draggingRef.current || animatingRef.current) return;
      const h = measure();
      if (h <= 0) return;
      const y = snapY(activeIndexRef.current, h);
      translateRef.current = y;
      applyTransform(y);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [measure, applyTransform]);

  const stopSpring = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    animatingRef.current = false;
  }, []);

  /**
   * Spring loop using semi-implicit (symplectic) Euler integration.
   *
   * Previous version used explicit Euler:
   *   v += a * dt
   *   y += v_old * dt   ← uses OLD velocity
   *
   * Symplectic Euler uses the NEW velocity for the position update:
   *   v += a * dt
   *   y += v_new * dt   ← uses NEW velocity
   *
   * This conserves energy better, meaning the spring doesn't slowly drift away
   * from the target or accumulate numerical error over many frames. The snap
   * feels consistently clean regardless of frame rate dips.
   *
   * commitIndex: when non-null, parent state updates only after settle.
   * When null (snap-back to same slide), we still fire onSlideChangeTransitionEnd.
   */
  const runSpring = useCallback(
    (targetY: number, initialVel: number, commitIndex: number | null) => {
      stopSpring();
      animatingRef.current = true;
      springVelRef.current = initialVel * Tune.RELEASE_VELOCITY_SPRING_BLEND;

      let last = performance.now();

      // const tick = (now: number) => {
      //   const dt = clamp((now - last) / 1000, 0, 0.064);
      //   // const dt = clamp((now - last) / 1000, 0, 0.016);
      //   last = now;

      //   let y = translateRef.current;
      //   let v = springVelRef.current;

      //   const displacement = targetY - y;
      //   const accel =
      //     (Tune.SPRING_STIFFNESS * displacement - Tune.SPRING_DAMPING * v) /
      //     Tune.SPRING_MASS;

      //   // Symplectic Euler: update velocity first, then position with new velocity.
      //   v += accel * dt;
      //   y += v * dt;

      //   translateRef.current = y;
      //   springVelRef.current = v;
      //   applyTransform(y);

      //   const settled =
      //     Math.abs(targetY - y) < Tune.SPRING_SNAP_EPSILON_PX &&
      //     Math.abs(v) < Tune.SPRING_SNAP_EPSILON_VEL_PX_PER_S;

      //   if (settled) {
      //     translateRef.current = targetY;
      //     springVelRef.current = 0;
      //     applyTransform(targetY);
      //     stopSpring();

      //     if (commitIndex !== null) {
      //       activeIndexRef.current = commitIndex;
      //       onActiveIndexChange(commitIndex);
      //     }
      //     // Always fire transition end — even on snap-back — so UI state (info button, etc.) stays correct.
      //     onSlideChangeTransitionEnd?.();
      //     return;
      //   }

      //   rafRef.current = requestAnimationFrame(tick);
      // };

      const tick = (now: number) => {
        const frameTime = clamp((now - last) / 1000, 0, 0.016);
        last = now;

        let y = translateRef.current;
        let v = springVelRef.current;

        // Substep: divide each frame into 8 small steps for numerical stability
        const steps = 8;
        const dt = frameTime / steps;

        for (let i = 0; i < steps; i++) {
          const displacement = targetY - y;
          const accel =
            (Tune.SPRING_STIFFNESS * displacement - Tune.SPRING_DAMPING * v) /
            Tune.SPRING_MASS;
          v += accel * dt;
          y += v * dt;
        }

        translateRef.current = y;
        springVelRef.current = v;
        applyTransform(y);

        const settled =
          Math.abs(targetY - y) < Tune.SPRING_SNAP_EPSILON_PX &&
          Math.abs(v) < Tune.SPRING_SNAP_EPSILON_VEL_PX_PER_S;

        if (settled) {
          translateRef.current = targetY;
          springVelRef.current = 0;
          applyTransform(targetY);
          stopSpring();

          if (commitIndex !== null) {
            activeIndexRef.current = commitIndex;
            onActiveIndexChange(commitIndex);
          }
          onSlideChangeTransitionEnd?.();
          return;
        }

        rafRef.current = requestAnimationFrame(tick);
      };

      rafRef.current = requestAnimationFrame(tick);
    },
    [
      applyTransform,
      onActiveIndexChange,
      onSlideChangeTransitionEnd,
      stopSpring,
    ],
  );

  const resolveTargetIndex = useCallback(
    (releaseY: number, gestureIndex: number, velocityPxPerSec: number) => {
      const h = slideHeightRef.current;
      const maxIndex = Math.max(0, slideCount - 1);
      if (h <= 0) return gestureIndex;

      let next = gestureIndex;

      // 1) Velocity wins: fast flick changes slide regardless of drag distance.
      if (velocityPxPerSec < -Tune.FLICK_VELOCITY_THRESHOLD_PX_PER_S) {
        next = Math.min(maxIndex, gestureIndex + 1);
      } else if (velocityPxPerSec > Tune.FLICK_VELOCITY_THRESHOLD_PX_PER_S) {
        next = Math.max(0, gestureIndex - 1);
      } else {
        // 2) Slow drag: compare against snap position of the gesture-start slide.
        const base = snapY(gestureIndex, h);
        const drag = releaseY - base;
        const need = h * Tune.DISTANCE_THRESHOLD_RATIO;
        if (drag < -need) next = Math.min(maxIndex, gestureIndex + 1);
        else if (drag > need) next = Math.max(0, gestureIndex - 1);
      }

      return next;
    },
    [slideCount],
  );

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      // Multi-touch guard: only track the first finger down.
      if (activePointerIdRef.current !== null) return;

      stopSpring();

      const h = measure();
      if (h <= 0) return;

      activePointerIdRef.current = e.pointerId;
      draggingRef.current = true;

      const maxIndex = Math.max(0, slideCount - 1);
      // Snap to nearest slide from current visual offset (handles interrupted springs correctly).
      const nearest = clamp(Math.round(-translateRef.current / h), 0, maxIndex);
      if (nearest !== activeIndexRef.current) {
        activeIndexRef.current = nearest;
        onActiveIndexChange(nearest);
      }

      gestureStartIndexRef.current = nearest;
      gestureStartTranslateRef.current = translateRef.current;
      pointerStartYRef.current = e.clientY;
      samplesRef.current = [{ t: performance.now(), y: e.clientY }];

      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    },
    [measure, onActiveIndexChange, slideCount, stopSpring],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      // Ignore any pointer that isn't the one that started the gesture.
      if (!draggingRef.current || e.pointerId !== activePointerIdRef.current)
        return;

      const h = slideHeightRef.current;
      const maxIndex = Math.max(0, slideCount - 1);
      const now = performance.now();
      pushSample(samplesRef, now, e.clientY);

      const delta = e.clientY - pointerStartYRef.current;
      const raw = gestureStartTranslateRef.current + delta;
      const y = applyRubberband(raw, h, maxIndex, Tune.EDGE_RUBBERBAND_FACTOR);

      translateRef.current = y;
      applyTransform(y);
    },
    [applyTransform, slideCount],
  );

  const endGesture = useCallback(
    (pointerId?: number) => {
      if (!draggingRef.current) return;
      // If a specific pointer ended, make sure it's the active one.
      if (pointerId !== undefined && pointerId !== activePointerIdRef.current)
        return;

      draggingRef.current = false;
      activePointerIdRef.current = null;

      const h = slideHeightRef.current;
      const maxIndex = Math.max(0, slideCount - 1);
      if (h <= 0) return;

      const gestureIndex = gestureStartIndexRef.current;

      /**
       * Resolve velocity and target BEFORE clamping the rubber-band position.
       * This preserves the drag distance information for resolveTargetIndex —
       * if the user dragged 15% past the edge, they clearly intended to change slides.
       * After resolving, we clamp so the spring starts from a valid position.
       */
      const rawY = translateRef.current;
      const v = estimateVelocityPxPerSec(samplesRef);
      samplesRef.current = [];

      const targetIndex = resolveTargetIndex(rawY, gestureIndex, v);
      const targetY = snapY(targetIndex, h);
      const willChangeSlide = targetIndex !== gestureIndex;

      // Now clamp rubber-band for the spring's starting point.
      const minY = snapY(maxIndex, h);
      const maxY = snapY(0, h);
      translateRef.current = clamp(rawY, minY, maxY);
      applyTransform(translateRef.current);

      if (willChangeSlide) {
        onSlideChangeTransitionStart?.();
      }

      // Pass commitIndex only when changing slides; snap-back still fires transitionEnd via runSpring.
      runSpring(targetY, v, willChangeSlide ? targetIndex : null);
    },
    [
      applyTransform,
      onSlideChangeTransitionStart,
      resolveTargetIndex,
      runSpring,
      slideCount,
    ],
  );

  const onPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.pointerId === activePointerIdRef.current) {
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      }
      endGesture(e.pointerId);
    },
    [endGesture],
  );

  const onPointerCancel = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.pointerId === activePointerIdRef.current) {
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      }
      endGesture(e.pointerId);
    },
    [endGesture],
  );

  // Keyboard navigation.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    const onKey = (e: KeyboardEvent) => {
      if (draggingRef.current || animatingRef.current) return;
      const maxIndex = Math.max(0, slideCount - 1);
      let delta = 0;
      if (e.key === "ArrowDown" || e.key === "PageDown") delta = 1;
      else if (e.key === "ArrowUp" || e.key === "PageUp") delta = -1;
      else return;

      e.preventDefault();
      const next = clamp(activeIndexRef.current + delta, 0, maxIndex);
      if (next === activeIndexRef.current) return;

      const h = measure();
      if (h <= 0) return;

      onSlideChangeTransitionStart?.();
      runSpring(snapY(next, h), 0, next);
    };

    el.tabIndex = 0;
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, [measure, onSlideChangeTransitionStart, runSpring, slideCount]);

  /**
   * Mouse wheel: interrupts in-flight animation and re-resolves, like TikTok desktop.
   * Previous version blocked wheel during animation (animatingRef check), causing
   * rapid wheel scrolling to feel sluggish / "locked". Now it interrupts cleanly.
   */
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    // const onWheel = (e: WheelEvent) => {
    //   if (draggingRef.current) return; // Don't fight a touch gesture.
    //   const dy = e.deltaY;
    //   if (Math.abs(dy) < 18) return;
    //   e.preventDefault();

    //   const maxIndex = Math.max(0, slideCount - 1);
    //   const delta = dy > 0 ? 1 : -1;

    //   // Resolve current position to nearest slide (handles mid-animation interrupts).
    //   const h = slideHeightRef.current;
    //   const currentNearest = clamp(
    //     Math.round(-translateRef.current / h),
    //     0,
    //     maxIndex
    //   );
    //   const next = clamp(currentNearest + delta, 0, maxIndex);
    //   if (next === currentNearest && animatingRef.current === false) return;

    //   if (h <= 0) return;

    //   // If we're changing slide (not same-slide re-snap), fire start callback.
    //   if (next !== activeIndexRef.current) {
    //     onSlideChangeTransitionStart?.();
    //   }

    //   // Update active index immediately for mid-animation interrupts.
    //   if (next !== activeIndexRef.current) {
    //     activeIndexRef.current = next;
    //     onActiveIndexChange(next);
    //   }

    //   runSpring(snapY(next, h), 0, null);
    // };

    const onWheel = (e: WheelEvent) => {
      if (draggingRef.current) return;
      const dy = e.deltaY;
      if (Math.abs(dy) < 18) return;
      e.preventDefault();

      const maxIndex = Math.max(0, slideCount - 1);
      const delta = dy > 0 ? 1 : -1;

      const h = slideHeightRef.current;
      const currentNearest = clamp(
        Math.round(-translateRef.current / h),
        0,
        maxIndex,
      );
      const next = clamp(currentNearest + delta, 0, maxIndex);
      if (next === currentNearest && animatingRef.current === false) return;
      if (h <= 0) return;

      if (next !== activeIndexRef.current) {
        onSlideChangeTransitionStart?.();
      }

      // ✅ Remove the manual onActiveIndexChange call
      // ✅ Pass next as commitIndex so runSpring handles the state update + transitionEnd
      runSpring(
        snapY(next, h),
        0,
        next !== activeIndexRef.current ? next : null,
      );
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [
    measure,
    onActiveIndexChange,
    onSlideChangeTransitionStart,
    runSpring,
    slideCount,
  ]);

  useLayoutEffect(() => {
    const h = measure();
    if (h <= 0) return;
    const y = snapY(activeIndex, h);
    translateRef.current = y;
    applyTransform(y);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={rootRef}
      className={className}
      style={{
        touchAction: "none",
        overscrollBehavior: "none",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onLostPointerCapture={(e) => {
        if (draggingRef.current && e.pointerId === activePointerIdRef.current) {
          endGesture(e.pointerId);
        }
      }}
    >
      <div
        ref={trackRef}
        className="flex w-full flex-col will-change-transform"
        style={{
          transform: "translate3d(0, 0, 0)",
        }}
      >
        {children}
      </div>
    </div>
  );
}
