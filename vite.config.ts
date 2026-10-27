import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";

// Deployment target. Defaults to a plain Node server; set NITRO_PRESET=vercel in
// Vercel's build environment (or locally) to emit a Vercel-compatible output.
const preset = process.env.NITRO_PRESET ?? "node-server";

export default defineConfig({
  plugins: [
    tanstackStart(),
    viteReact(),
    tailwindcss(),
    nitro({
      preset,
      // pdfkit (used by @react-pdf/renderer) resolves its built-in fonts through
      // package.json "imports" ("#standard-fonts/*"). Bundled into a chunk, that alias
      // map is lost and PDF rendering fails at runtime. Ship the whole package ("pkg*" =
      // full trace) because it loads the .cjs font files via require().
      traceDeps: ["pdfkit*"],
    }),
  ],
  resolve: {
    tsconfigPaths: true,
    dedupe: ["react", "react-dom", "@tanstack/react-router", "@tanstack/react-start"],
  },
});
