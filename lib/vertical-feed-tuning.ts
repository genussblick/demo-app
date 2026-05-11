/**
 * TikTok-style vertical feed — tuning knobs
 * ==========================================
 * Re-tuned to match TikTok's actual scroll feel:
 *  - Very responsive to light flicks (~200 px/s threshold)
 *  - Overdamped spring: snaps cleanly with zero oscillation
 *  - Finger momentum carries strongly into the snap animation
 *  - Stiff rubber-band at edges (barely gives)
 *  - Velocity sampled from the very end of the gesture (last ~40ms)
 */

/** Fast flick: TikTok responds to very light swipes. ~200–250 is the sweet spot. */
export const FLICK_VELOCITY_THRESHOLD_PX_PER_S = 220;

/**
 * Slow drag: TikTok requires ~20% of slide height to commit without a flick.
 * Slightly higher than before to prevent accidental swipes from natural scrolling.
 */
export const DISTANCE_THRESHOLD_RATIO = 0.4;

/**
 * Overscroll at edges: TikTok is very stiff — barely gives at the first/last slide.
 * Lower = stiffer. 0.10 gives just a hint of give without feeling broken.
 */
export const EDGE_RUBBERBAND_FACTOR = 0.10;

/**
 * Spring stiffness: Higher = snappier. TikTok's snap is very fast (~120–150ms settle).
 * 900 achieves that without needing extreme damping.
 */
export const SPRING_STIFFNESS = 900;

/**
 * Damping: Critical damping = 2*sqrt(M*K) = 2*sqrt(1*900) = 60.
 * We go slightly overdamped (65) so the snap never bounces — clean stop like TikTok.
 */
export const SPRING_DAMPING = 65;

/** Inertia of the motion model. Keep at 1. */
export const SPRING_MASS = 1;

/** Stop spring when this close to target (px). */
export const SPRING_SNAP_EPSILON_PX = 0.5;

/** Stop spring when this close to target (px). */

/** Stop spring when speed is below this (px/s). */
export const SPRING_SNAP_EPSILON_VEL_PX_PER_S = 8;

/** Max time window (ms) of pointer samples kept for velocity estimation. */
export const VELOCITY_SAMPLE_MS = 80;

/** Only the last N ms matter for flick detection — captures true release speed. */
export const VELOCITY_END_WINDOW_MS = 40;

/** How much finger speed carries into the settle animation. */
export const RELEASE_VELOCITY_SPRING_BLEND = 0.85;