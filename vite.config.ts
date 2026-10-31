import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";

// Deployment target: Vercel when building on Vercel (it sets VERCEL=1), otherwise a plain Node
// server. NITRO_PRESET overrides either, e.g. NITRO_PRESET=vercel to inspect Vercel output locally.
const preset = process.env.NITRO_PRESET ?? (process.env.VERCEL ? "vercel" : "node-server");

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
      // Run server functions in Singapore, next to the Supabase database (ap-southeast-1).
      // Vercel's default region is Washington DC, which would add a Pacific round trip per query.
      vercel: { functions: { regions: ["sin1"] } },
    }),
  ],
  resolve: {
    tsconfigPaths: true,
    dedupe: ["react", "react-dom", "@tanstack/react-router", "@tanstack/react-start"],
  },
});
