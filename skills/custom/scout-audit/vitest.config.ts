import { defineConfig } from "vitest/config"

// Tests live in lib/__tests__/ and exercise the pure library modules in lib/.
// Run with: npm test   (or: npx vitest run)
export default defineConfig({
  test: {
    include: ["lib/__tests__/**/*.test.ts"],
  },
})
