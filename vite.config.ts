import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  build: { copyPublicDir: false },
  server: {
    host: "127.0.0.1",
    fs: {
      // Retain Vite's built-in exclusions and protect local speech credentials.
      deny: [
        ".env",
        ".env.*",
        "*.{crt,pem,key,p12,pfx,cer,der}",
        ".npmrc",
        ".yarnrc.yml",
        "**/.git/**",
        "**/cartesia-credentials.json*",
      ],
    },
  },
});
