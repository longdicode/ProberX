import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // config/env.ts exits the process when these are missing, so any test that
    // imports a service needs them present.
    env: {
      DATABASE_URL: "postgresql://proberx:proberx@localhost:5432/proberx",
      JWT_SECRET: "vitest-only-jwt-secret",
    },
  },
});
