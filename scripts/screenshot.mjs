#!/usr/bin/env node
import { chromium } from "playwright-core";
import { resolve } from "node:path";

const [url = `http://localhost:${process.env.TLDRAW_PORT ?? 4179}/`, output = "/tmp/tldraw-diagram.png"] = process.argv.slice(2);
const executablePath = process.env.CHROME_PATH || undefined; // unset: Playwright default browser
const browser = await chromium.launch({ headless: true, executablePath });
const page = await browser.newPage({ viewport: { width: 1920, height: 1200 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
await page.goto(url, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(5000);
await page.screenshot({ path: resolve(output), fullPage: true });
await browser.close();
console.log(resolve(output));
if (errors.length) console.error(errors.join("\n"));
