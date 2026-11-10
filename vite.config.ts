import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const serverPort = Number(process.env.PORT ?? 3000);

// The browser interface lives in src/web/client. In development, Vite serves it
// and forwards /api calls to the local server. `npm start` builds it into dist/client.
export default defineConfig({
  root: "src/web/client",
  plugins: [react()],
  build: {
    outDir: "../../../dist/client",
    emptyOutDir: true,
  },
  server: {
    proxy: {
      "/api": `http://localhost:${serverPort}`,
    },
  },
});
