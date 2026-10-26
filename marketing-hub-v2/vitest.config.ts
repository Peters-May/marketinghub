import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
  test: {
    globals: true,
    environment: "node",
    include: ["**/__tests__/**/*.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "https://test-placeholder.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY:
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlc3QiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTYwMDAwMDAwMH0.test-placeholder-for-vitest-only",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
