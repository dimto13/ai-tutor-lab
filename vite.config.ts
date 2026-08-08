import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

/**
 * Native TanStack Start/Vite setup without tooling from the original POC environment.
 * src/server.ts remains the custom server entry used by TanStack Start.
 */
export default defineConfig({
  server: {
    port: 3001,
    host: "0.0.0.0",
    allowedHosts: true,
    cors: true,
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [tailwindcss(), tanstackStart(), viteReact(), nitro()],
});
