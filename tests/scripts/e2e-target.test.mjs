import assert from "node:assert/strict";
import { once } from "node:events";
import http from "node:http";
import test from "node:test";

import { baseUrl, guardPage, launchBrowser } from "../../scripts/e2e-helpers.mjs";

const ENV_KEYS = ["BASE_URL", "E2E_ALLOW_REMOTE_BASE_URL", "E2E_ALLOW_FWETA_HOSTS"];

let envChain = Promise.resolve();

function withEnv(vars, fn) {
  const run = envChain.then(async () => {
    const previous = new Map(ENV_KEYS.map((key) => [key, process.env[key]]));
    for (const key of ENV_KEYS) delete process.env[key];
    for (const [key, value] of Object.entries(vars)) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
    try {
      return await fn();
    } finally {
      for (const [key, value] of previous) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
  envChain = run.then(
    () => {},
    () => {},
  );
  return run;
}

function refuses(raw, pattern) {
  return withEnv({ BASE_URL: raw }, () => {
    assert.throws(() => baseUrl(), pattern);
  });
}

function createHarnessPage() {
  let current = "about:blank";
  let routeHandler = null;
  let closed = false;
  const listeners = new Map();
  const mainFrame = {
    url() {
      return current;
    },
    parentFrame() {
      return null;
    },
  };
  const childFrame = {
    url() {
      return "about:blank";
    },
    parentFrame() {
      return mainFrame;
    },
  };
  const fetched = [];

  function emit(event, payload) {
    for (const fn of listeners.get(event) ?? []) fn(payload);
  }

  const context = {
    async close() {
      closed = true;
    },
    async newPage() {
      return page;
    },
  };

  async function settleRoute(url, { resourceType = "document", navigation = true, frame = mainFrame } = {}) {
    if (!routeHandler) return { aborted: false, continued: false };
    let aborted = false;
    let continued = false;
    await routeHandler({
      request() {
        return {
          url: () => url,
          resourceType: () => resourceType,
          isNavigationRequest: () => navigation,
          frame: () => frame,
        };
      },
      async abort() {
        aborted = true;
      },
      async continue() {
        continued = true;
      },
    });
    return { aborted, continued };
  }

  async function follow(startUrl) {
    let url = startUrl;
    for (let hop = 0; hop < 5; hop += 1) {
      const routeResult = await settleRoute(url);
      if (routeResult.aborted) throw new Error("net::ERR_BLOCKED_BY_CLIENT");
      const parsed = new URL(url);
      if (parsed.hostname !== "127.0.0.1") {
        current = url;
        emit("framenavigated", mainFrame);
        emit("load");
        return null;
      }
      fetched.push(url);
      const response = await fetch(url, { redirect: "manual" });
      const location = response.headers.get("location");
      const status = response.status;
      const requestUrl = url;
      emit("response", {
        url: () => requestUrl,
        status: () => status,
        headers: () => (location ? { location } : {}),
        request: () => ({
          url: () => requestUrl,
          resourceType: () => "document",
          isNavigationRequest: () => true,
          frame: () => mainFrame,
        }),
      });
      if (status >= 300 && status < 400 && location) {
        url = new URL(location, requestUrl).href;
        current = url;
        emit("framenavigated", mainFrame);
        continue;
      }
      current = requestUrl;
      emit("framenavigated", mainFrame);
      emit("load");
      return { status: () => status };
    }
    throw new Error("Too many redirects.");
  }

  const page = {
    context() {
      return context;
    },
    mainFrame() {
      return mainFrame;
    },
    url() {
      return current;
    },
    on(event, fn) {
      const list = listeners.get(event) ?? [];
      list.push(fn);
      listeners.set(event, list);
    },
    async route(_pattern, handler) {
      routeHandler = handler;
    },
    async goto(url) {
      return follow(url);
    },
    async reload() {
      return follow(current);
    },
    async goBack() {
      return follow(current);
    },
    async goForward() {
      return follow(current);
    },
    async waitForURL() {
      return null;
    },
    async dispatch(url, options) {
      return settleRoute(url, options);
    },
    childFrame() {
      return childFrame;
    },
    wasClosed() {
      return closed;
    },
    fetched() {
      return fetched;
    },
  };

  return page;
}

function listen(server) {
  server.listen(0, "127.0.0.1");
  return once(server, "listening");
}

test.describe("e2e target guard", { concurrency: 1 }, () => {
  test("allows localhost, 127.0.0.1, and ::1, including uppercase localhost", async () => {
    await withEnv({}, () => {
      assert.equal(baseUrl(), "http://localhost:3000");
    });
    await withEnv({ BASE_URL: "HTTP://LOCALHOST:3000/dashboard" }, () => {
      assert.equal(baseUrl(), "http://localhost:3000");
    });
    await withEnv({ BASE_URL: "http://127.0.0.1:3000" }, () => {
      assert.equal(baseUrl(), "http://127.0.0.1:3000");
    });
    await withEnv({ BASE_URL: "http://[::1]:3000" }, () => {
      assert.equal(baseUrl(), "http://[::1]:3000");
    });
    await withEnv({ BASE_URL: "http://[0:0:0:0:0:0:0:1]:3000" }, () => {
      assert.equal(baseUrl(), "http://[::1]:3000");
    });
  });

  test("refuses an uppercase production host", async () => {
    await refuses("HTTP://APP.FWETA.COM/dashboard", /BASE_URL host app\.fweta\.com/);
    await refuses("https://WWW.FWETA.COM/login", /BASE_URL host www\.fweta\.com/);
  });

  test("strips a trailing dot before comparing the host", async () => {
    await refuses("https://app.fweta.com./login", /BASE_URL host app\.fweta\.com/);
    await refuses("https://app.fweta.com..", /BASE_URL host app\.fweta\.com/);
    await refuses("https://app.fweta.com%2e", /BASE_URL host app\.fweta\.com/);
    await withEnv({ BASE_URL: "http://localhost.:3000/path" }, () => {
      assert.equal(baseUrl(), "http://localhost.:3000");
    });
    await withEnv({ BASE_URL: "HTTP://LOCALHOST.:3000" }, () => {
      assert.equal(baseUrl(), "http://localhost.:3000");
    });
    await withEnv(
      { BASE_URL: "https://app.fweta.com.", E2E_ALLOW_REMOTE_BASE_URL: "1" },
      () => {
        assert.throws(() => baseUrl(), /E2E_ALLOW_FWETA_HOSTS=1/);
      },
    );
  });

  test("refuses a userinfo trick such as localhost@app.fweta.com", async () => {
    await refuses("http://localhost@app.fweta.com/dashboard", /BASE_URL host app\.fweta\.com/);
    await refuses("http://127.0.0.1:password@www.fweta.com/admin", /BASE_URL host www\.fweta\.com/);
    await withEnv({ BASE_URL: "http://user:password@localhost:3000" }, () => {
      assert.equal(baseUrl(), "http://localhost:3000");
    });
  });

  test("refuses fweta.com", async () => {
    await refuses("https://fweta.com", /BASE_URL host fweta\.com/);
    await refuses("https://fweta.com.", /BASE_URL host fweta\.com/);
  });

  test("refuses www.fweta.com", async () => {
    await refuses("https://www.fweta.com/campaigns", /BASE_URL host www\.fweta\.com/);
    await refuses("https://WWW.FWETA.COM./campaigns", /BASE_URL host www\.fweta\.com/);
  });

  test("refuses a vercel.app host unless the remote override is set", async () => {
    await refuses("https://fweta-webapp.vercel.app", /navigation host|BASE_URL host fweta-webapp\.vercel\.app/);
    await refuses("https://vercel.app", /BASE_URL host vercel\.app/);
    await withEnv(
      { BASE_URL: "https://fweta-webapp.vercel.app", E2E_ALLOW_REMOTE_BASE_URL: "1" },
      () => {
        assert.equal(baseUrl(), "https://fweta-webapp.vercel.app");
      },
    );
    await withEnv(
      { BASE_URL: "https://www.fweta.com", E2E_ALLOW_REMOTE_BASE_URL: "1" },
      () => {
        assert.throws(() => baseUrl(), /E2E_ALLOW_FWETA_HOSTS=1/);
      },
    );
    await withEnv({ BASE_URL: "https://fweta.com", E2E_ALLOW_FWETA_HOSTS: "1" }, () => {
      assert.throws(() => baseUrl(), /E2E_ALLOW_REMOTE_BASE_URL=1/);
    });
    await withEnv(
      {
        BASE_URL: "https://app.fweta.com",
        E2E_ALLOW_REMOTE_BASE_URL: "1",
        E2E_ALLOW_FWETA_HOSTS: "1",
      },
      () => {
        assert.equal(baseUrl(), "https://app.fweta.com");
      },
    );
    await withEnv({ BASE_URL: "https://notfweta.com", E2E_ALLOW_REMOTE_BASE_URL: "1" }, () => {
      assert.equal(baseUrl(), "https://notfweta.com");
    });
    await withEnv({ BASE_URL: "https://preview.example.com", E2E_ALLOW_REMOTE_BASE_URL: "true" }, () => {
      assert.throws(() => baseUrl(), /E2E_ALLOW_REMOTE_BASE_URL=1/);
    });
  });

  test("aborts when an allowed host redirects to a blocked host", async () => {
    const cases = [
      { path: "/fweta", location: "https://app.fweta.com/dashboard", pattern: /navigation host app\.fweta\.com/ },
      { path: "/userinfo", location: "https://localhost@app.fweta.com/dashboard", pattern: /navigation host app\.fweta\.com/ },
      { path: "/dotted", location: "https://WWW.FWETA.COM./login", pattern: /navigation host www\.fweta\.com/ },
      { path: "/apex", location: "https://fweta.com/", pattern: /navigation host fweta\.com/ },
      { path: "/preview", location: "https://fweta-webapp.vercel.app/login", pattern: /navigation host fweta-webapp\.vercel\.app/ },
    ];
    const server = http.createServer((req, res) => {
      const match = cases.find((entry) => entry.path === req.url);
      if (match) {
        res.writeHead(302, { Location: match.location });
        res.end();
        return;
      }
      if (req.url === "/done") {
        res.writeHead(200, { "content-type": "text/plain" });
        res.end("ok");
        return;
      }
      if (req.url === "/start") {
        res.writeHead(302, { Location: "/done" });
        res.end();
        return;
      }
      res.writeHead(404);
      res.end();
    });
    await listen(server);
    const { port } = server.address();
    const origin = `http://127.0.0.1:${port}`;
    try {
      await withEnv({}, async () => {
        const page = createHarnessPage();
        await guardPage(page);
        await page.goto(`${origin}/start`);
        assert.equal(page.url(), `${origin}/done`);
        assert.equal(page.wasClosed(), false);

        for (const entry of cases) {
          const next = createHarnessPage();
          await guardPage(next);
          await assert.rejects(() => next.goto(`${origin}${entry.path}`), entry.pattern);
          assert.equal(next.wasClosed(), true);
          assert.equal(
            next.fetched().some((url) => !url.startsWith(origin)),
            false,
          );
        }
      });
    } finally {
      server.closeAllConnections?.();
      await new Promise((resolve) => server.close(resolve));
    }
  });

  test("aborts a main-frame load on a vercel.app host and leaves embeds alone", async () => {
    await withEnv({}, async () => {
      const page = createHarnessPage();
      await guardPage(page);
      await assert.rejects(() => page.goto("https://fweta-webapp.vercel.app/dashboard"), /fweta-webapp\.vercel\.app/);
      assert.equal(page.wasClosed(), true);
      assert.deepEqual(page.fetched(), []);

      const embed = createHarnessPage();
      await guardPage(embed);
      const iframe = await embed.dispatch("https://www.youtube-nocookie.com/embed/abc", {
        resourceType: "document",
        navigation: true,
        frame: embed.childFrame(),
      });
      assert.equal(iframe.aborted, false);
      assert.equal(iframe.continued, true);
      assert.equal(embed.wasClosed(), false);

      const style = await embed.dispatch("https://fonts.googleapis.com/css?family=Inter", {
        resourceType: "stylesheet",
        navigation: false,
      });
      assert.equal(style.aborted, false);
      assert.equal(style.continued, true);
    });
  });

  test("launchBrowser guards pages opened from the browser or a context", async () => {
    await withEnv({}, async () => {
      const browser = {
        async newPage() {
          return createHarnessPage();
        },
        async newContext() {
          return {
            async newPage() {
              return createHarnessPage();
            },
          };
        },
      };
      const launched = await launchBrowser({
        chromium: {
          async launch() {
            return browser;
          },
        },
      });
      const page = await launched.newPage();
      await assert.rejects(() => page.goto("https://app.fweta.com/dashboard"), /navigation host app\.fweta\.com/);
      const context = await launched.newContext();
      const other = await context.newPage();
      await assert.rejects(() => other.goto("http://localhost@www.fweta.com/"), /navigation host www\.fweta\.com/);
    });
  });
});
