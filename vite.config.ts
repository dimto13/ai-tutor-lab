import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

/**
 * Native TanStack Start/Vite setup.
 *
 * src/server.ts is discovered by TanStack Start as the custom server entry.
 * Nitro keeps the production build runtime-agnostic so the AWS Amplify deployment
 * can be configured independently from the application build.
 */
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [tailwindcss(), tanstackStart(), viteReact(), nitro()],
});
