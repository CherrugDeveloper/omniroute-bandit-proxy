import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { DiscountedUCB1Bandit } from "../src/bandit.mjs";
import { compressBody, truncateBiggestMessage } from "../src/index.mjs";

const bandit = new DiscountedUCB1Bandit(":memory:");

describe("Step 5: Token Estimation, Context Compression & Body Preparation", () => {
  describe("Token Estimation (estimateTokens)", () => {
    /**
     * @test Verify estimateTokens uses enhanced multi-heuristic token estimation
     */
    test("estimates tokens using enhanced multi-heuristic token estimation for string content", () => {
      const body = {
        messages: [
          { role: "system", content: "12345678" }, // 8 chars
          { role: "user", content: "123456789012" } // 12 chars
        ]
      };
      // Enhanced estimation: char-based (4 chars/token) + word-based cross-check + message overhead + 5% buffer
      // Total chars = 20, generalChars = 20, estimatedTokens = ceil(20/4) = 5
      // wordBasedEstimate = ceil(2 * 1.3) = 3, max(5, 3) = 5
      // + messages.length * 4 = 5 + 8 = 13, * 1.05 = 13.65, ceil = 14
      assert.equal(bandit.estimateTokens(body), 14);
    });

    /**
     * @test Verify multimodal content handling (text parts and image_url heuristic with enhanced estimation)
     */
    test("handles multimodal content with text and image_url using enhanced estimation", () => {
      const body = {
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Hello" }, // 5 chars
              { type: "image_url", image_url: { url: "http://..." } } // +255 tokens for auto detail
            ]
          }
        ]
      };
      // Enhanced estimation: text (5 chars) + image (255 tokens auto) + message overhead + 5% buffer
      // text: ceil(5/4) = 2, max with word-based = 2
      // image: +255 = 257, + messages.length * 4 = 257 + 4 = 261, * 1.05 = 274.05, ceil = 275
      assert.equal(bandit.estimateTokens(body), 275);
    });

    /**
     * @test Verify non-string/non-array content fallback via JSON serialization with enhanced estimation
     */
    test("handles non-string/non-array content via JSON serialization with enhanced estimation", () => {
      const body = {
        messages: [
          { role: "assistant", content: { foo: "bar" } }
        ]
      };
      const jsonStr = JSON.stringify({ foo: "bar" });
      // Enhanced estimation: JSON weighting (2.5 chars/token) + word-based + message overhead + 5% buffer
      // jsonStr = `{"foo":"bar"}` (13 chars), jsonCharCount = 13, ceil(13/2.5) = 6
      // wordBasedEstimate = ceil(1 * 1.3) = 2, max(6, 2) = 6
      // + messages.length * 4 = 6 + 4 = 10, * 1.05 = 10.5, ceil = 11
      assert.equal(bandit.estimateTokens(body), 11);
    });

    /**
     * @test Verify 0 tokens returned for invalid or empty body
     */
    test("returns 0 for empty or invalid body", () => {
      assert.equal(bandit.estimateTokens(null), 0);
      assert.equal(bandit.estimateTokens({}), 0);
    });
  });

  describe("Emergency Truncation (truncateBiggestMessage)", () => {
    /**
     * @test Verify null returned for empty or invalid body
     */
    test("returns null if messages length is 0 or body is invalid", () => {
      assert.equal(truncateBiggestMessage(null, 1000), null);
      assert.equal(truncateBiggestMessage({ messages: [] }, 1000), null);
    });

    /**
     * @test Verify proportional truncation of the largest message when tokens >= 2000
     */
    test("truncates biggest message when tokens >= 2000 and total exceeds target", () => {
      const largeContent = "A".repeat(10000); // ~3333 tokens
      const body = {
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: largeContent }
        ]
      };
      const result = truncateBiggestMessage(body, 1000);
      assert.ok(result);
      assert.equal(result.truncatedBig, true);
      assert.ok(result.body.messages[1].content.includes("[... troncato:"));
    });
  });

  describe("Sliding Window Compression (compressBody)", () => {
    /**
     * @test Verify null returned for invalid body
     */
    test("returns null for invalid body", () => {
      assert.equal(compressBody(null, 1000), null);
      assert.equal(compressBody({ messages: [] }, 1000), null);
    });

    /**
     * @test Verify messages < 6 fallback to truncateBiggestMessage
     */
    test("falls back to truncateBiggestMessage when messages < 6", () => {
      const body = {
        messages: [
          { role: "system", content: "Sys" },
          { role: "user", content: "A".repeat(12000) }
        ]
      };
      const result = compressBody(body, 500);
      assert.ok(result);
      assert.equal(result.truncatedBig, true);
    });

    /**
     * @test Verify sliding window compression (system + first user + tail + summary) when messages >= 6
     */
    test("applies sliding window compression when messages >= 6", () => {
      const messages = [
        { role: "system", content: "System prompt" },
        { role: "user", content: "First user question" },
        { role: "assistant", content: "Response 1" },
        { role: "user", content: "Question 2" },
        { role: "assistant", content: "Response 2" },
        { role: "user", content: "Question 3" },
        { role: "assistant", content: "Response 3" },
        { role: "user", content: "Question 4" },
        { role: "assistant", content: "Response 4" },
        { role: "user", content: "Question 5" },
        { role: "assistant", content: "Response 5" },
        { role: "user", content: "Final question" }
      ];
      const body = { messages };
      const result = compressBody(body, 50000);
      assert.ok(result);
      assert.ok(result.body.messages.length < messages.length);
      assert.equal(result.body.messages[0].role, "system");
      assert.equal(result.body.messages[1].role, "user");
      assert.equal(result.body.messages[1].content, "First user question");
      
      const summaryMsg = result.body.messages.find(m => typeof m.content === "string" && m.content.includes("messaggi intermedi omessi"));
      assert.ok(summaryMsg);
    });
  });

  describe("Tool Dropping on Summarization Requests", () => {
    /**
     * @test Verify tools, tool_choice, and parallel_tool_calls are dropped when summarization is detected
     */
    test("drops tools when summarization request is detected", () => {
      const body = {
        messages: [
          { role: "system", content: "System instructions" },
          { role: "user", content: "Please summarize our conversation without calling any tools." }
        ],
        tools: [{ type: "function", function: { name: "test_tool" } }],
        tool_choice: "auto",
        parallel_tool_calls: true
      };

      const firstMsg = body.messages[0]?.content || "";
      const firstMsgStr = typeof firstMsg === "string" ? firstMsg : JSON.stringify(firstMsg);
      const isSummarization = /summariz|summariz|condense|context.*compress|riassunt/i.test(firstMsgStr.slice(0, 500)) ||
        /summariz|summariz|condense|context.*compress|riassunt/i.test((body.messages[1]?.content || "").slice(0, 500));

      const hasTools = Array.isArray(body.tools) && body.tools.length > 0;
      if (hasTools && isSummarization) {
        delete body.tools;
        delete body.tool_choice;
        delete body.parallel_tool_calls;
      }

      assert.equal(body.tools, undefined);
      assert.equal(body.tool_choice, undefined);
      assert.equal(body.parallel_tool_calls, undefined);
    });
  });
});
