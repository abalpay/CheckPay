import '@testing-library/jest-dom/vitest'

// Ensure the test environment resembles the browser a bit more closely.
// Guarded because some test files opt into the `node` environment
// (e.g. `// @vitest-environment node`), where `window` doesn't exist.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (
    query: string
  ): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })
}
