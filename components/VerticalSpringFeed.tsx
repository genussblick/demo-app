"use client";

/**
 * Custom vertical “reel” scroller: pointer tracking + velocity-first snap + damped spring.
 * Replaces Swiper touch physics here so the feed follows the finger and flicks feel like TikTok.
 * All gesture + animation state lives in refs; only active index updates React after settle.
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
  factor: number
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

function pushSample(samplesRef: React.MutableRefObject<Sample[]>, t: number, y: number) {
  const arr = samplesRef.current;
  arr.push({ t, y });
  const cutoff = t - Tune.VELOCITY_SAMPLE_MS;
  while (arr.length > 1 && arr[0].t < cutoff) arr.shift();
}

/**
 * End-of-gesture velocity: averaging the whole finger path dilutes quick flicks (feels like you must swipe twice).
 * Blend last movement (pair) with a short end window so release speed wins.
 */
function estimateVelocityPxPerSec(samplesRef: React.MutableRefObject<Sample[]>): number {
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

  // Positive = finger moving down (screen Y increases).
  return vPair * 0.72 + vWin * 0.28;
}

export type VerticalSpringFeedProps = {
  children: ReactNode;
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  /** Fired when we start moving toward a different slide than `activeIndex` at gesture start. */
  onSlideChangeTransitionStart?: () => void;
  /** Fired once motion has settled on a snap target. */
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
    const h = rootRef.current?.getBoundingClientRect().height ?? window.innerHeight;
    slideHeightRef.current = h;
    return h;
  }, []);

  // Keep ref in sync when parent drives index (e.g. future deep links).
  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  // External index change: jump without animation if user isn’t dragging.
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
    /** `commitIndex`: when non-null, parent state updates only after settle (no “half” active slide mid-flight). */
    (targetY: number, initialVel: number, commitIndex: number | null) => {
      stopSpring();
      animatingRef.current = true;
      springVelRef.current = initialVel * Tune.RELEASE_VELOCITY_SPRING_BLEND;

      let last = performance.now();

      const tick = (now: number) => {
        const dt = clamp((now - last) / 1000, 0, 0.064);
        last = now;

        let y = translateRef.current;
        let v = springVelRef.current;

        const displacement = targetY - y;
        const accel =
          (Tune.SPRING_STIFFNESS * displacement - Tune.SPRING_DAMPING * v) / Tune.SPRING_MASS;

        v += accel * dt;
        y += v * dt;

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
            onSlideChangeTransitionEnd?.();
          }
          return;
        }

        rafRef.current = requestAnimationFrame(tick);
      };

      rafRef.current = requestAnimationFrame(tick);
    },
    [applyTransform, onActiveIndexChange, onSlideChangeTransitionEnd, stopSpring]
  );

  const resolveTargetIndex = useCallback(
    (releaseY: number, gestureIndex: number, velocityPxPerSec: number) => {
      const h = slideHeightRef.current;
      const maxIndex = Math.max(0, slideCount - 1);
      if (h <= 0) return gestureIndex;

      let next = gestureIndex;

      // 1) Velocity wins (TikTok): fast flick changes slide even with small travel.
      if (velocityPxPerSec < -Tune.FLICK_VELOCITY_THRESHOLD_PX_PER_S) {
        next = Math.min(maxIndex, gestureIndex + 1);
      } else if (velocityPxPerSec > Tune.FLICK_VELOCITY_THRESHOLD_PX_PER_S) {
        next = Math.max(0, gestureIndex - 1);
      } else {
        // 2) Slow drag: distance vs start snap (not vs current visual if we had drift).
        const base = snapY(gestureIndex, h);
        const drag = releaseY - base;
        const need = h * Tune.DISTANCE_THRESHOLD_RATIO;
        if (drag < -need) next = Math.min(maxIndex, gestureIndex + 1);
        else if (drag > need) next = Math.max(0, gestureIndex - 1);
      }

      return next;
    },
    [slideCount]
  );

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      stopSpring();

      const h = measure();
      if (h <= 0) return;

      draggingRef.current = true;

      const maxIndex = Math.max(0, slideCount - 1);
      // Nearest slide from actual pixel offset (fixes “two swipes” after interrupting a spring or tiny drift).
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
    [measure, onActiveIndexChange, slideCount, stopSpring]
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return;

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
    [applyTransform, slideCount]
  );

  const endGesture = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;

    const h = slideHeightRef.current;
    const maxIndex = Math.max(0, slideCount - 1);
    if (h <= 0) return;

    const gestureIndex = gestureStartIndexRef.current;
    let y = translateRef.current;

    // Clamp out of rubber-band into valid range for index resolution.
    const minY = snapY(maxIndex, h);
    const maxY = snapY(0, h);
    y = clamp(y, minY, maxY);
    translateRef.current = y;
    applyTransform(y);

    const v = estimateVelocityPxPerSec(samplesRef);
    samplesRef.current = [];

    const targetIndex = resolveTargetIndex(y, gestureIndex, v);
    const targetY = snapY(targetIndex, h);
    const willChangeSlide = targetIndex !== gestureIndex;

    if (willChangeSlide) {
      onSlideChangeTransitionStart?.();
    }

    runSpring(targetY, v, willChangeSlide ? targetIndex : null);
  }, [applyTransform, onSlideChangeTransitionStart, resolveTargetIndex, runSpring, slideCount]);

  const onPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (draggingRef.current) {
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      }
      endGesture();
    },
    [endGesture]
  );

  const onPointerCancel = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (draggingRef.current) {
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      }
      endGesture();
    },
    [endGesture]
  );

  // Keyboard: preserve Swiper-like nudge without fighting touch physics.
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

  // Mouse wheel: coarse step between slides (replaces Swiper Mousewheel module).
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      if (draggingRef.current || animatingRef.current) return;
      const dy = e.deltaY;
      if (Math.abs(dy) < 18) return;
      e.preventDefault();

      const maxIndex = Math.max(0, slideCount - 1);
      const delta = dy > 0 ? 1 : -1;
      const next = clamp(activeIndexRef.current + delta, 0, maxIndex);
      if (next === activeIndexRef.current) return;

      const h = measure();
      if (h <= 0) return;

      onSlideChangeTransitionStart?.();
      runSpring(snapY(next, h), 0, next);
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [measure, onSlideChangeTransitionStart, runSpring, slideCount]);

  // Before first paint only: avoid a one-frame flash at translate 0 (subsequent index sync uses the effect below).
  useLayoutEffect(() => {
    const h = measure();
    if (h <= 0) return;
    const y = snapY(activeIndex, h);
    translateRef.current = y;
    applyTransform(y);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: mount-only; prop-driven updates use `useEffect`
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
      onLostPointerCapture={() => {
        if (draggingRef.current) endGesture();
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
