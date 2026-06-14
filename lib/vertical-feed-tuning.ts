// controls how fast the spring snaps to position.
export const SPRING_STIFFNESS = 18000;

//controls whether the snap overshoots (bounces) or settles cleanly.
// damping = 2 * sqrt(STIFFNESS * MASS)
export const SPRING_DAMPING = 280;

export const SPRING_MASS = 1;

//how close to the target (in px) before the animation is considered done.
export const SPRING_SNAP_EPSILON_PX = 0.5;
export const SPRING_SNAP_EPSILON_VEL_PX_PER_S = 80;

//minimum swipe speed (px/s) to trigger a page change regardless of drag distance.
export const FLICK_VELOCITY_THRESHOLD_PX_PER_S = 200;

// how far the user must drag to commit to a page change.
export const DISTANCE_THRESHOLD_RATIO = 0.2;

export const EDGE_RUBBERBAND_FACTOR = 0.08;

export const VELOCITY_SAMPLE_MS = 80;
export const VELOCITY_END_WINDOW_MS = 40;

export const RELEASE_VELOCITY_SPRING_BLEND = 0.8;
