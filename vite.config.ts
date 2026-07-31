import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig(async ({ mode }) => {
  const { nitro } = await import("nitro/vite");
  const env = loadEnv(mode, process.cwd(), "");

  for (const [key, value] of Object.entries(env)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }

  return {
    cloudflare: false,
    plugins: [
      react(),
      tsconfigPaths(),
      nitro({
        preset: "netlify",
        serverDir: "src/server",
      }),
    ],
    // 🚨 FORCE VITE À BUNDLER FEDAPAY ET AXIOS 🚨
    // Cela empêche Vite de séparer axios de son adaptateur Node.js
    ssr: {
      noExternal: ["fedapay", "axios"],
    },
  };
});
