/*
 * Animations that finish after a test's last act() update Animated views outside act(); React warns about each one.
 * The warning says nothing about the component, so only that message is dropped; every other error still shows.
 */
const original = console.error;
console.error = (...args: unknown[]) => {
  const text = args.map(String).join(' ');
  if (text.includes('not wrapped in act') && text.includes('Animated(')) { return; }
  original(...args);
};
