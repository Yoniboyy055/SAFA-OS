export {};
const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { RelayClient } = require("../src/relay/relay_client");

function sign(workerKey, method, path, body, ts) {
  const bodyHash = crypto.createHash("sha256").update(body).digest("hex");
  const payload = `${ts}.${method}.${path}.${bodyHash}`;
  return crypto.createHmac("sha256", workerKey).update(payload).digest("base64url");
}

test("relay client signs HMAC headers", async () => {
  const client = new RelayClient({
    baseUrl: "https://example.com",
    workerKey: "unit-test-key"
  });
  const headers = client.signHeadersForTest(
    "POST",
    "/api/worker/claim",
    "{}",
    "1"
  );
  const expected = sign("unit-test-key", "POST", "/api/worker/claim", "{}", "1");
  assert.equal(headers["x-safa-signature"], expected);
});
