const React = require("react");

function motionValue(initial) {
  return {
    get: () => initial,
    set: () => {},
    jump: () => {},
    on: () => () => {},
  };
}

const motion = new Proxy(
  {},
  {
    get: () =>
      React.forwardRef(function MotionProxy(props, ref) {
        return React.createElement("span", { ...props, ref }, props.children);
      }),
  },
);

module.exports = {
  AnimatePresence: ({ children }) => children,
  LazyMotion: ({ children }) => children,
  animate: () => ({ stop() {} }),
  domAnimation: {},
  m: motion,
  motion,
  useMotionValue: (value) => motionValue(value),
  useReducedMotion: () => true,
  useSpring: (value) => value,
  useTransform: () => motionValue(0),
  useVelocity: () => motionValue(0),
};
