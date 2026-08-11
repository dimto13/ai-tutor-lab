import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

/**
 * Native TanStack Start/Vite setup without tooling from the original POC environment.
 * src/server.ts remains the custom server entry used by TanStack Start.
 * Production builds target Amplify Hosting Compute through Nitro's deployment preset.
 */
export default defineConfig(({ command }) => ({
  server: {
    fs: { allow: ["../.."] },
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
  plugins: [
    tailwindcss(),
    tanstackStart(),
    viteReact(),
    ...(command === "build"
      ? [
          nitro({
            preset: "aws_amplify",
            awsAmplify: { runtime: "nodejs22.x" },
            // #225: Keep the server graph in one chunk while the generated
            // split helper binding is invalid at runtime. The production
            // artifact smoke test guards this workaround directly.
            inlineDynamicImports: true,
          }),
        ]
      : []),
  ],
}));
