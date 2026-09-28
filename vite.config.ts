import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const localEnv = loadEnv(mode, process.cwd(), "METATABLES_");
  const apiTarget = localEnv.METATABLES_API_TARGET || "http://127.0.0.1:8001";
  const localToken = localEnv.METATABLES_LOCAL_TOKEN;

  return {
    plugins: [react()],
    server: {
      host: "127.0.0.1",
      port: 5175,
      strictPort: true,
      cors: false,
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
