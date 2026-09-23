import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";

// Deployment target. Defaults to a plain Node server; set NITRO_PRESET=vercel in
// Vercel's build environment (or locally) to emit a Vercel-compatible output.
const preset = process.env.NITRO_PRESET ?? "node-server";

export default defineConfig({
  plugins: [tanstackStart(), viteReact(), tailwindcss(), nitro({ preset })],
  resolve: {
    tsconfigPaths: true,
    dedupe: ["react", "react-dom", "@tanstack/react-router", "@tanstack/react-start"],
  },
});
