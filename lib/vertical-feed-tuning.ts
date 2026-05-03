/**
 * TikTok-style vertical feed — tuning knobs
 * ==========================================
 *
 * Adjust these on a real phone; values are tuned for ~390×844 CSS px feel.
 *
 * FLICK_VELOCITY_THRESHOLD (px/s)
 *   Lower → tiny flicks advance slides (more “TikTok”). Higher → need a harder flick.
 *
 * DISTANCE_THRESHOLD_RATIO (0–1, fraction of slide height)
 *   When the flick is slow, how far the finger must drag before changing slides.
 *   Lower → easier to change with distance; higher → must drag farther (snaps back more often).
 *
 * EDGE_RUBBERBAND (0–1)
 *   How much overscroll past first/last slide is allowed (multiplier on overflow).
 *   Lower → stiffer edge; higher → more rubber-band give.
 *
 * SPRING_STIFFNESS / SPRING_DAMPING / SPRING_MASS
 *   Modeled as: acceleration = (stiffness * (target - pos) - damping * vel) / mass
 *   Stiffness ↑ → snappier snap, faster settle.
 *   Damping ↑ → less bounce / oscillation (more “controlled”).
 *   Mass ↑ → heavier, slower response.
 *   For TikTok-like: relatively high stiffness, medium-high damping, mass ~1.
 *
 * SPRING_SNAP_EPSILON_PX / SPRING_SNAP_EPSILON_VEL
 *   When position and velocity are both below these, the spring loop stops (no jitter).
 *
 * VELOCITY_SAMPLE_MS
 *   Window for estimating flick speed from recent pointer moves (longer → smoother estimate, more lag).
 */

/** Fast flick: advance prev/next even with small drag. Lower = easier one-swipe advance on real devices. */
export const FLICK_VELOCITY_THRESHOLD_PX_PER_S = 380;

/** Slow drag: need at least this fraction of slide height past the start snap to change slide. */
export const DISTANCE_THRESHOLD_RATIO = 0.14;

/** Overscroll past first/last slide: raw overflow is multiplied by this (0.22 ≈ noticeable resistance). */
export const EDGE_RUBBERBAND_FACTOR = 0.28;

/** Spring toward snap target (not CSS ease). Higher = faster initial correction (less “draggy”). */
export const SPRING_STIFFNESS = 560;

/** Opposes velocity; reduces oscillation. Slightly lower than before so settle doesn’t feel heavy. */
export const SPRING_DAMPING = 30;

/** Inertia of the motion model (not screen DPI). 1 is a good default. */
export const SPRING_MASS = 1;

/** Stop spring when this close to target (px). */
export const SPRING_SNAP_EPSILON_PX = 0.65;

/** Stop spring when speed is below this (px/s). */
export const SPRING_SNAP_EPSILON_VEL_PX_PER_S = 8;

/** Max time window (ms) of pointer samples kept for velocity (end-weighted in code). */
export const VELOCITY_SAMPLE_MS = 100;

/** Last N ms of the gesture weighted more for flick detection (captures release speed, not whole drag). */
export const VELOCITY_END_WINDOW_MS = 48;

/**
 * Blends measured release velocity into the spring (0 = ignore finger inertia, 1 = full).
 * Slight blend makes the tail of the animation follow the flick.
 */
export const RELEASE_VELOCITY_SPRING_BLEND = 0.85;

/*
 * --- Quick tuning (try on a phone) ---
 *
 * “Flicks don’t advance” → lower FLICK_VELOCITY_THRESHOLD_PX_PER_S, or raise RELEASE_VELOCITY_SPRING_BLEND.
 *
 * “Too easy to change slides by accident” → raise FLICK_VELOCITY_THRESHOLD_PX_PER_S and/or DISTANCE_THRESHOLD_RATIO.
 *
 * “Snap feels mushy / slow” → raise SPRING_STIFFNESS a bit; if it overshoots, raise SPRING_DAMPING.
 *
 * “Snap feels stiff / robotic” → lower SPRING_STIFFNESS slightly, or lower SPRING_DAMPING for a softer settle.
 *
 * “Rubber band at first/last slide too loose” → lower EDGE_RUBBERBAND_FACTOR.
 *
 * “Velocity feels laggy or noisy” → tweak VELOCITY_END_WINDOW_MS / VELOCITY_SAMPLE_MS.
 *
 * Implementation: `components/VerticalSpringFeed.tsx` (pointer + spring loop), constants in this file only.
 */
