// CR F-C2 fix: use vitest-specific entry point so type augmentation extends Vitest's
// `expect` Assertion (plain '@testing-library/jest-dom' only patches runtime, not types).
import '@testing-library/jest-dom/vitest';
