import { defineConfig } from "vite";

// Relative base so the built game can be opened from a file path or any sub-path host.
export default defineConfig({
  base: "./",
  server: { host: true },
});
