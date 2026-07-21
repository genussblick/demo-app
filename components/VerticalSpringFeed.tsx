"use client";

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
  onSlideChangeTransitionStart?: () => void;
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
  const activePointerIdRef = useRef<number | null>(null);
  const gestureStartIndexRef = useRef(0);
  const gestureStartTranslateRef = useRef(0);
  const pointerStartYRef = useRef(0);
  const animatingRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const frameCountRef = useRef(0);

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

  // jump without animation if idle.
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

  const runSpring = useCallback(
    (targetY: number, initialVel: number, commitIndex: number | null) => {
      frameCountRef.current = 0;
      stopSpring();
      animatingRef.current = true;
      springVelRef.current = initialVel * Tune.RELEASE_VELOCITY_SPRING_BLEND;

      let last = performance.now();

      const tick = (now: number) => {
        const frameTime = clamp((now - last) / 1000, 0, 0.016);
        last = now;

        let y = translateRef.current;
        let v = springVelRef.current;

        // divide each frame into 8 small steps for numerical stability
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

        frameCountRef.current += 1;

        if (settled) {
          console.log(`Spring settled in ${frameCountRef.current} frames`);
          frameCountRef.current = 0;
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
// const runSpring = useCallback(
//   (targetY: number, initialVel: number, commitIndex: number | null) => {
//     stopSpring();
//     animatingRef.current = true;

//     const startY = translateRef.current;
//     const startTime = performance.now();
//     const DURATION_MS = 167; // approximately 10 frames per scroll

//     const tick = (now: number) => {
//       const elapsed = now - startTime;
//       const progress = Math.min(elapsed / DURATION_MS, 1);

//       // constant speed
//       const y = startY + (targetY - startY) * progress;
//       translateRef.current = y;
//       applyTransform(y);

//       if (progress >= 1) {
//         translateRef.current = targetY;
//         applyTransform(targetY);
//         animatingRef.current = false;

//         if (commitIndex !== null) {
//           activeIndexRef.current = commitIndex;
//           onActiveIndexChange(commitIndex);
//         }
//         onSlideChangeTransitionEnd?.();
//         return;
//       }

//       rafRef.current = requestAnimationFrame(tick);
//     };

//     rafRef.current = requestAnimationFrame(tick);
//   },
//   [applyTransform, onActiveIndexChange, onSlideChangeTransitionEnd, stopSpring],
// );
  const resolveTargetIndex = useCallback(
    (releaseY: number, gestureIndex: number, velocityPxPerSec: number) => {
      const h = slideHeightRef.current;
      const maxIndex = Math.max(0, slideCount - 1);
      if (h <= 0) return gestureIndex;

      let next = gestureIndex;

      //fast flick slide regardless of drag distance.
      if (velocityPxPerSec < -Tune.FLICK_VELOCITY_THRESHOLD_PX_PER_S) {
        next = Math.min(maxIndex, gestureIndex + 1);
      } else if (velocityPxPerSec > Tune.FLICK_VELOCITY_THRESHOLD_PX_PER_S) {
        next = Math.max(0, gestureIndex - 1);
      } else {
        //slow flick slide
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
      // only track the first finger down.
      if (activePointerIdRef.current !== null) return;

      stopSpring();

      const h = measure();
      if (h <= 0) return;

      activePointerIdRef.current = e.pointerId;
      draggingRef.current = true;

      const maxIndex = Math.max(0, slideCount - 1);
      //snap to nearest slide in case we were mid-spring or mid-rubberband when the user put their finger down.
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
      // ignore non-active pointers
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
      // Ignore non active pointers
      if (pointerId !== undefined && pointerId !== activePointerIdRef.current)
        return;

      draggingRef.current = false;
      activePointerIdRef.current = null;

      const h = slideHeightRef.current;
      const maxIndex = Math.max(0, slideCount - 1);
      if (h <= 0) return;

      const gestureIndex = gestureStartIndexRef.current;

      const rawY = translateRef.current;
      const v = estimateVelocityPxPerSec(samplesRef);
      samplesRef.current = [];

      const targetIndex = resolveTargetIndex(rawY, gestureIndex, v);
      const targetY = snapY(targetIndex, h);
      const willChangeSlide = targetIndex !== gestureIndex;

      // rubber band the release position
      const minY = snapY(maxIndex, h);
      const maxY = snapY(0, h);
      translateRef.current = clamp(rawY, minY, maxY);
      applyTransform(translateRef.current);

      if (willChangeSlide) {
        onSlideChangeTransitionStart?.();
      }

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
        } catch {}
      }
      endGesture(e.pointerId);
    },
    [endGesture],
  );

  //keyboard navigation
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

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;

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
