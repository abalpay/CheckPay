import '@testing-library/jest-dom/vitest'

// Ensure the test environment resembles the browser a bit more closely.
if (!window.matchMedia) {
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
