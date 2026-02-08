const http = require("node:http");
const path = require("node:path");

const HOST = "127.0.0.1";
const PORT = 3777;

function request(method, pathname, headers = {}, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: HOST,
        port: PORT,
        path: pathname,
        method,
        headers: { "Content-Type": "application/json", ...headers }
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += String(chunk);
        });
        res.on("end", () => {
          const contentType = res.headers["content-type"] || "";
          let parsed = data;
          if (contentType.includes("application/json") && data) {
            try {
              parsed = JSON.parse(data);
            } catch {
              parsed = data;
            }
          }
          resolve({
            statusCode: res.statusCode || 0,
            headers: res.headers,
            body: parsed
          });
        });
      }
    );
    req.on("error", reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function run() {
  const ownerToken = process.env.SAFA_OWNER_TOKEN;
  if (!ownerToken) {
    throw new Error("SAFA_OWNER_TOKEN is required to run verification.");
  }
  const configPath =
    process.env.SAFA_CONFIG_PATH || path.resolve(__dirname, "..", "safa.config.json");
  const correctPin = process.env.SAFA_PIN || "1234";
  const { createDashboardServer } = require("../dist/dashboard/server");
  const server = createDashboardServer({
    configPath,
    ownerToken,
    actorDefault: "verify"
  });

  await new Promise((resolve) => server.listen(PORT, HOST, resolve));
  try {
    const root = await request("GET", "/");
    if (root.statusCode !== 200 || !String(root.body).includes("PIN Lock")) {
      throw new Error("PIN lock screen check failed.");
    }
    console.log("OK: GET / returns PIN lock screen.");

    const wrongUnlock = await request("POST", "/auth/unlock", {}, { pin: "0000" });
    if (wrongUnlock.statusCode !== 401) {
      throw new Error("Wrong PIN should return 401.");
    }
    console.log("OK: wrong PIN returns 401.");

    const unlock = await request("POST", "/auth/unlock", {}, { pin: correctPin });
    const cookie = Array.isArray(unlock.headers["set-cookie"])
      ? unlock.headers["set-cookie"][0]
      : unlock.headers["set-cookie"];
    if (unlock.statusCode !== 200 || !cookie) {
      throw new Error("Unlock should return 200 with Set-Cookie.");
    }
    if (!cookie.includes("HttpOnly")) {
      throw new Error("Session cookie must be HttpOnly.");
    }
    console.log("OK: correct PIN returns Set-Cookie.");

    const chatNoCookie = await request("POST", "/chat", {}, { message: "Hello" });
    if (chatNoCookie.statusCode !== 401) {
      throw new Error("/chat without cookie should return 401.");
    }
    console.log("OK: /chat without cookie returns 401.");

    const savedKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const chatMissingKey = await request(
      "POST",
      "/chat",
      { Cookie: cookie },
      { message: "Hello" }
    );
    if (chatMissingKey.statusCode !== 500 || chatMissingKey.body.error !== "OPENAI_API_KEY missing") {
      throw new Error("Missing OPENAI_API_KEY should return 500 with message.");
    }
    console.log("OK: missing OPENAI_API_KEY returns 500.");
    if (savedKey) {
      process.env.OPENAI_API_KEY = savedKey;
      const chatOk = await request(
        "POST",
        "/chat",
        { Cookie: cookie },
        { message: "Hello" }
      );
      if (chatOk.statusCode !== 200 || !chatOk.body.message) {
        throw new Error("Chat with OPENAI_API_KEY should return model output.");
      }
      console.log("OK: /chat returns model output with OPENAI_API_KEY.");
      const outputs = [];
      for (let i = 0; i < 25; i += 1) {
      const res = await request(
          "POST",
          "/chat",
          { Cookie: cookie },
          { message: "Summarize the status of local-only governance." }
        );
        if (res.statusCode !== 200) {
          throw new Error(`Chat stress test failed at ${i + 1}.`);
        }
        outputs.push(res.body.message || "");
      }
      const unique = new Set(outputs.filter(Boolean));
      if (unique.size < 2) {
        throw new Error("Chat stress test responses did not vary.");
      }
      console.log(`OK: chat stress test (25 calls), unique responses: ${unique.size}.`);
    }

    for (let i = 0; i < 25; i += 1) {
      const attempt = await request("POST", "/auth/unlock", {}, { pin: "0000" });
      if (attempt.statusCode !== 401) {
        throw new Error(`Wrong PIN attempt ${i + 1} did not return 401.`);
      }
    }
    console.log("OK: wrong PIN stress test (25 attempts).");
  } finally {
    await new Promise((resolve) => server.close(() => resolve()));
  }
}

run().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
