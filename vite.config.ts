import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { loadEnv } from "vite";

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
      nitro({
        preset: "netlify",
        serverDir: "src/server",
      }),
    ],
    tanstackStart: {
      server: { entry: "server" },
    },
    // 🚨 FORCE VITE À BUNDLER FEDAPAY ET AXIOS 🚨
    // Cela empêche Vite de séparer axios de son adaptateur Node.js
    ssr: {
      noExternal: ["fedapay", "axios"],
    },
  };
});
