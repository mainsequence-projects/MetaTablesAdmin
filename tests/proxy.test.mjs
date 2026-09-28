import assert from "node:assert/strict";
import { createServer as createHttpServer } from "node:http";
import { once } from "node:events";
import test from "node:test";
import { createServer as createViteServer } from "vite";

test("Vite uses the local token without sending a Git source header", async () => {
  const received = [];
  const backend = createHttpServer((req, res) => {
    received.push({ url: req.url, headers: req.headers });
    if (req.url.startsWith("/meta-tables?")) {
      res.writeHead(307, { Location: `http://127.0.0.1:${backend.address().port}/meta-tables/${req.url.slice("/meta-tables".length)}` });
      res.end();
      return;
    }
    const admitted = req.headers["x-metatables-local-token"] === "synthetic-local-token"
      && req.headers["x-metatables-git-source"] === undefined;
    res.writeHead(admitted ? 200 : 409, { "Content-Type": "application/json" });
    res.end(JSON.stringify(admitted ? { results: [], count: 0 } : { detail: "Source mismatch" }));
  });
  backend.listen(0, "127.0.0.1");
  await once(backend, "listening");

  const values = {
    METATABLES_API_TARGET: `http://127.0.0.1:${backend.address().port}`,
    METATABLES_LOCAL_TOKEN: "synthetic-local-token",
    // Even an old launcher variable must not cause Vite to send Git facts.
    METATABLES_LOCAL_GIT_SOURCE: '{"repository_branch":"stale"}',
  };
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  Object.assign(process.env, values);
  let vite;
  try {
    vite = await createViteServer({
      configFile: new URL("../vite.config.ts", import.meta.url).pathname,
      server: { host: "127.0.0.1", port: 0, open: false },
      logLevel: "silent",
    });
    await vite.listen();
    const base = `http://127.0.0.1:${vite.httpServer.address().port}`;
    const initial = await fetch(`${base}/api/meta-tables?limit=25`);
    assert.equal(initial.status, 200, "Requests without browser source headers must be admitted");
    assert.deepEqual(await initial.json(), { results: [], count: 0 });
    assert.equal(new URL(initial.url).origin, base, "Slash redirects must stay on Vite's origin");
    const forged = await fetch(`${base}/api/runtime-context/`, {
      headers: {
        "X-MetaTables-Git-Source": '{"repository_branch":"forged"}',
        "X-MetaTables-Local-Token": "forged-token",
        Origin: base,
      },
    });
    assert.equal(forged.status, 200, "Vite must strip browser Git facts and replace the private token");
    await forged.text();
    assert.equal(received[0].url, "/meta-tables?limit=25");
    assert.equal(received[1].url, "/meta-tables/?limit=25");
    assert.equal(received[2].url, "/runtime-context/");
    for (const request of received) {
      assert.equal(request.headers["x-metatables-git-source"], undefined);
      assert.equal(request.headers["x-metatables-local-token"], "synthetic-local-token");
    }
    assert.equal(received[2].headers.origin, base);
  } finally {
    await vite?.close();
    backend.closeAllConnections();
    await new Promise((resolve) => backend.close(resolve));
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
