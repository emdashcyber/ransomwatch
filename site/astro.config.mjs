import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://emdashcyber.com",
  base: "/ransomwatch",
  trailingSlash: "always",
  build: { assets: "assets" },
});
