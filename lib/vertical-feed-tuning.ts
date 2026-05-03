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

/** Fast flick: advance prev/next even with small drag. Typical TikTok: ~400–900 px/s. */
export const FLICK_VELOCITY_THRESHOLD_PX_PER_S = 520;

/** Slow drag: need at least this fraction of slide height past the start snap to change slide. */
export const DISTANCE_THRESHOLD_RATIO = 0.22;

/** Overscroll past first/last slide: raw overflow is multiplied by this (0.22 ≈ noticeable resistance). */
export const EDGE_RUBBERBAND_FACTOR = 0.28;

/** Spring toward snap target (not CSS ease). Higher = faster initial correction. */
export const SPRING_STIFFNESS = 420;

/** Opposes velocity; reduces oscillation. Raise if the feed “bounces” past the slide. */
export const SPRING_DAMPING = 38;

/** Inertia of the motion model (not screen DPI). 1 is a good default. */
export const SPRING_MASS = 1;

/** Stop spring when this close to target (px). */
export const SPRING_SNAP_EPSILON_PX = 0.65;

/** Stop spring when speed is below this (px/s). */
export const SPRING_SNAP_EPSILON_VEL_PX_PER_S = 8;

/** Max time window (ms) of pointer samples used for flick velocity. */
export const VELOCITY_SAMPLE_MS = 110;

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
 * “Velocity feels laggy or noisy” → tweak VELOCITY_SAMPLE_MS (shorter = faster reaction, noisier).
 *
 * Implementation: `components/VerticalSpringFeed.tsx` (pointer + spring loop), constants in this file only.
 */
