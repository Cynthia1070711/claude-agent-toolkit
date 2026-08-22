// CR F-C2 fix: pull jest-dom matcher types into TS compile so
// tsconfig.json's include: ["src"] sees the type augmentation.
// Runtime side already imports '@testing-library/jest-dom/vitest' from
// vitest.setup.ts (referenced by vitest.config.ts), but tsc doesn't read
// the root-level setup file, hence this in-tree reference.
/// <reference types="@testing-library/jest-dom" />
