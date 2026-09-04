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
export default defineConfig(({ command, mode }) => ({
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
  ...(mode === "e2e"
    ? {
        optimizeDeps: {
          // #369: The full Playwright suite traverses many lazily loaded routes.
          // Scan every app source entry before serving the first page so Vite
          // does not discover a new dependency mid-suite and invalidate already
          // served optimized chunks with `504 Outdated Optimize Dep` responses.
          entries: ["src/**/*.{ts,tsx}"],
          // #421 reproduced the historical race specifically for js-yaml even
          // with the source scan enabled. Force this transitive dependency into
          // the initial E2E prebundle rather than letting Vite discover it lazily.
          //
          // #444: The TanStack Start client runtime is pulled in through the
          // framework's generated client entry, which the source scan above cannot
          // see. Vite therefore discovered these on the first client navigation,
          // re-optimized and reloaded, which invalidated every already served chunk
          // - the `504 Outdated Optimize Dep` that js-yaml then reported. Pin them
          // into the initial prebundle so the optimized set never changes mid-suite.
          // Recheck on every Vite or TanStack Start upgrade: if the entries scan
          // starts covering the generated client entry, drop these again.
          include: [
            "js-yaml",
            "@tanstack/router-core",
            "@tanstack/router-core/isServer",
            "@tanstack/router-core/ssr/client",
            "seroval",
          ],
        },
      }
    : {}),
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
