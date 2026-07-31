/** Calm Mini App motion presets (Emil / Apple-ish). */

export const EASE = [0.25, 0.1, 0.25, 1] as const;

export const tabFade = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.18, ease: EASE },
};

export const sheetSpring = {
  type: "tween" as const,
  duration: 0.28,
  ease: EASE,
};

export const sheetVariants = {
  hidden: { y: "100%" },
  visible: { y: 0 },
  exit: { y: "100%" },
};
