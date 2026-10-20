import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import {
  DEFAULT_PI_MODEL,
  DEFAULT_CODEX_MODEL,
  claudeArgs,
  codexTextArgs,
  piArgs,
  chatModel,
  chatConfigured,
  imageConfigured,
  openAiCompatibleUrl,
  openAiCompatibleRequest,
  runOpenAiCompatible,
  maskConfig,
  NO_IMAGE_INSTRUCTION,
  buildChatPrompt,
  chatPromptWithImagePolicy,
} from "../scripts/lib/agent-providers.mjs";
import { defaultConfig } from "../scripts/lib/lab-config.mjs";

test("pi and codex argv builders", () => {
  assert.deepEqual(piArgs("hi", "m").slice(0, 3), ["-p", "--model", "m"]);
  assert.equal(chatModel({ provider: "pi", model: "" }, {}), DEFAULT_PI_MODEL);
  assert.equal(chatModel({ provider: "codex", model: "" }, {}), DEFAULT_CODEX_MODEL);
  assert.equal(chatModel({ provider: "pi", model: "" }, { WHITEBOARD_STUDIO_PI_MODEL: "z" }), "z");
  assert.equal(chatModel({ provider: "codex", model: "" }, { WHITEBOARD_STUDIO_CODEX_MODEL: "z" }), "z");
  assert.equal(chatModel({ provider: "pi", model: "" }, { WHITEBOARD_STUDIO_PI_MODEL: "x" }), "x");
  assert.equal(chatModel({ provider: "codex", model: "y" }, { WHITEBOARD_STUDIO_CODEX_MODEL: "x" }), "y");
  const args = codexTextArgs("p", { model: "m", jobDir: "/j", responseFile: "/j/r.txt" });
  assert.equal(args[args.indexOf("--sandbox") + 1], "read-only");
  for (const flag of ["--ephemeral", "--skip-git-repo-check", "--output-last-message"]) assert.ok(args.includes(flag));
  assert.equal(args[args.indexOf("-C") + 1], "/j");
});

test("claude argv disables all tools", () => {
  const { args } = claudeArgs({ model: "sonnet" });
  assert.deepEqual(args.slice(0, 5), ["-p", "--tools", "", "--output-format", "text"]);
  assert.deepEqual(args.slice(-2), ["--model", "sonnet"]);
  assert.ok(!claudeArgs({}).args.includes("--model"));
});

test("configured flags", () => {
  assert.equal(chatConfigured(defaultConfig.agent.chat), false);
  assert.equal(chatConfigured({ provider: "pi" }), true);
  assert.equal(chatConfigured({ provider: "openai-compatible", baseUrl: "http://x", model: "" }), false);
  assert.equal(imageConfigured(defaultConfig.agent.image), false);
  assert.equal(imageConfigured({ provider: "codex" }), true);
});

test("openai-compatible request shape", () => {
  assert.equal(openAiCompatibleUrl("http://h/v1/"), "http://h/v1/chat/completions");
  const withKey = openAiCompatibleRequest({ baseUrl: "http://h/v1", model: "m", apiKey: "sk-secret" }, "hello");
  assert.equal(withKey.init.headers.authorization, "Bearer sk-secret");
  assert.deepEqual(JSON.parse(withKey.init.body), { model: "m", messages: [{ role: "user", content: "hello" }] });
  assert.equal(openAiCompatibleRequest({ baseUrl: "http://h", model: "m" }, "x").init.headers.authorization, undefined);
});

async function withMock(handler, fn) {
  const server = http.createServer(handler);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    return await fn(`http://127.0.0.1:${server.address().port}/v1`);
  } finally {
    server.close();
  }
}

test("openai-compatible success and 401 without leaking the key", async () => {
  const seen = [];
  await withMock(
    (req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        seen.push({ url: req.url, auth: req.headers.authorization, body: JSON.parse(body) });
        if (req.headers.authorization !== "Bearer good-key") {
          res.writeHead(401, { "content-type": "application/json" });
          return res.end(JSON.stringify({ error: { message: "Incorrect API key provided: bad-key-123" } }));
        }
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ choices: [{ message: { content: "  reply  " } }] }));
      });
    },
    async (baseUrl) => {
      const ok = await runOpenAiCompatible({ baseUrl, model: "m", apiKey: "good-key" }, "q");
      assert.equal(ok.text, "reply");
      assert.equal(seen[0].url, "/v1/chat/completions");
      assert.equal(seen[0].body.messages[0].content, "q");
      await assert.rejects(runOpenAiCompatible({ baseUrl, model: "m", apiKey: "bad-key-123" }, "q"), (error) => {
        assert.match(error.message, /401/);
        assert.ok(!error.message.includes("bad-key-123"), error.message);
        return true;
      });
    },
  );
});

test("config masking hides secrets", () => {
  const config = structuredClone(defaultConfig);
  config.agent.chat.apiKey = "sk-secret";
  config.share.cloudflareTunnelToken = "tok-secret";
  const text = JSON.stringify(maskConfig(config));
  assert.ok(!text.includes("sk-secret") && !text.includes("tok-secret"));
  assert.equal(config.agent.chat.apiKey, "sk-secret");
});

test("image request without image provider is answered by chat with a no-image instruction", () => {
  assert.match(NO_IMAGE_INSTRUCTION, /not available/i);
  assert.match(NO_IMAGE_INSTRUCTION, /editable diagram/i);
});

test("chat prompts are English-only and image policy is applied", () => {
  const main = buildChatPrompt({ roomId: "r", text: "hi", board: {}, history: [], routerRules: "RULES", visualStyle: "STYLE" });
  const noImage = chatPromptWithImagePolicy(main, true);
  const fallback = chatPromptWithImagePolicy(main, true);
  assert.match(main, /Answer in English/);
  assert.ok(main.includes("RULES") && main.includes("STYLE"));
  assert.equal(chatPromptWithImagePolicy(main, false), main);
  assert.ok(noImage.endsWith(NO_IMAGE_INSTRUCTION));
  assert.equal(fallback, noImage);
  for (const text of [main, noImage, NO_IMAGE_INSTRUCTION]) {
    assert.doesNotMatch(text, /[\u0400-\u04FF]/);
    assert.doesNotMatch(text, /Russian/i);
  }
});
