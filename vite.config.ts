import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

/**
 * Native TanStack Start/Vite setup without tooling from the original POC environment.
 * src/server.ts remains the custom server entry used by TanStack Start.
 */
export default defineConfig(({ command }) => ({
  server: {
    port: 3001,
    host: "0.0.0.0",
    allowedHosts: true,
    cors: true,
    hmr: {
      clientPort: 3001,
    },
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [tailwindcss(), tanstackStart(), viteReact(), ...(command === "build" ? [nitro()] : [])],
}));
