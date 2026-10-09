import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import sirv from "sirv";
import { localAgentProxy, platformRequestProxy } from "@dev-mainsequence/command-center-sdk/vite";

export default defineConfig(({ mode }) => {
  const localEnv = loadEnv(mode, process.cwd(), "METATABLES_");
  const apiTarget = localEnv.METATABLES_API_TARGET || "http://127.0.0.1:18473";
  const localToken = localEnv.METATABLES_LOCAL_TOKEN;

  return {
    plugins: [react(),
      // The assistant on a local top-level page: platform requests as the developer, and the chat's
      // routes to an `ms-tau` Agent on this machine (MAINSEQUENCE_TAU_LOCAL_ORIGIN, default :8787).
      platformRequestProxy(),
      localAgentProxy({ path: "/tau" }), {
      name: "user-guide",
      configureServer(server) {
        const serveGuide = sirv(fileURLToPath(new URL("./dist/docs", import.meta.url)), { dev: true, extensions: ["html"] });
        server.middlewares.use((req, res, next) => {
          const path = req.url?.split("?", 1)[0];
          if (path === "/docs") {
            res.writeHead(302, { Location: "/docs/" });
            res.end();
            return;
          }
          next();
        });
        server.middlewares.use("/docs", (req, res) => {
          serveGuide(req, res, () => {
            res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
            res.end("User guide page not found. Build the guide with npm run build:docs.");
          });
        });
      },
    }],
    server: {
      host: "127.0.0.1",
      port: 19473,
      strictPort: true,
      cors: false,
      fs: { deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**", "**/.local/development-client.json"] },
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true,
          rewrite: (path: string) => path.replace(/^\/api(?=\/|$)/, ""),
          configure: (proxy) => {
            // FastAPI's slash redirects must stay behind the proxy so that
            // the next request receives the server-owned local token too.
            proxy.on("proxyRes", (response) => {
              const location = response.headers.location;
              if (!location) return;
              const redirect = new URL(location, apiTarget);
              if (redirect.origin === new URL(apiTarget).origin) {
                response.headers.location = `/api${redirect.pathname}${redirect.search}${redirect.hash}`;
              }
            });
            proxy.on("proxyReq", (proxyReq, req) => {
              proxyReq.removeHeader("X-MetaTables-Local-Token");
              proxyReq.removeHeader("X-MetaTables-Git-Source");
              if (localToken) proxyReq.setHeader("X-MetaTables-Local-Token", localToken);
              if (req.headers.origin) proxyReq.setHeader("Origin", req.headers.origin);
            });
          },
        },
      },
    },
  };
});
