import test from "node:test";
import assert from "node:assert";
import { sanitizeBaseUrl, buildEndpointUrl } from "../src/health-check.mjs";

test("URL sanitization and construction tests", () => {
  // Trailing slash removal
  assert.strictEqual(
    sanitizeBaseUrl("http://127.0.0.1:20128/v1/"),
    "http://127.0.0.1:20128/v1"
  );
  assert.strictEqual(
    sanitizeBaseUrl("  http://127.0.0.1:20128/v1/// "),
    "http://127.0.0.1:20128/v1"
  );

  // Fallback on invalid or empty input
  assert.strictEqual(
    sanitizeBaseUrl("not-a-url", "http://127.0.0.1:20128/v1"),
    "http://127.0.0.1:20128/v1"
  );
  assert.strictEqual(
    sanitizeBaseUrl(null, "https://router.omniroute.ai/v1"),
    "https://router.omniroute.ai/v1"
  );

  // Endpoint URL building without double slashes
  assert.strictEqual(
    buildEndpointUrl("http://127.0.0.1:20128/v1/", "/chat/completions"),
    "http://127.0.0.1:20128/v1/chat/completions"
  );
  assert.strictEqual(
    buildEndpointUrl("http://127.0.0.1:20128/v1", "models"),
    "http://127.0.0.1:20128/v1/models"
  );
});
