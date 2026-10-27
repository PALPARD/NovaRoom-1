# Project Instructions

## Screen animations
Every new full-screen page/view must use the shared screen animation so all screens behave consistently.

- Import `screenVariants` from `front-end/src/utils/screenMotion.ts`.
- Wrap the page root with `framer-motion`:
  - `motion.div` with `variants={screenVariants}`, `initial="hidden"`, `animate="visible"`, `exit="exit"`.
- The animation is a soft fade plus a small upward drift from below. Do not replace it with scale/pop animations or add a second CSS animation on the same element.
- When two views are rendered by the same component (for example Profile view vs Profile edit, or Settings menu vs Settings subpages), give the component a `key` tied to the current view so the animation replays on navigation.

## Code comments
- Do not add comments between code lines. Keep code self-explanatory through clear naming and structure.

## Visual effects
- Never add glow effects to any UI element (buttons, tabs, inputs, cards, focus states, active states, shadows with accent color, etc.) unless the user explicitly asks for glow in that specific request. Use plain, neutral shadows or no shadow at all.

