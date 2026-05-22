// Quick probe: invokes the AgentBrowser exactly the way the agent does,
// triggers a known 500 endpoint via a search form, and prints the click
// result. Confirms whether networkErrors makes it into result.data.
import { AgentBrowser } from "../dist/agent/browser.js";

const browser = new AgentBrowser({ headless: true, reportDir: "./reports" });
await browser.start();

console.log("\n--- step 1: navigate to /products.html ---");
const nav = await browser.execute({
  action: "navigate",
  target: "http://localhost:3100/products.html",
  reason: "probe",
});
console.log(JSON.stringify(nav, null, 2));

console.log("\n--- step 2: type regex specials in search ---");
const type = await browser.execute({
  action: "type",
  target: "#q",
  value: "[*?\\",
  reason: "probe",
});
console.log(JSON.stringify(type, null, 2));

console.log("\n--- step 3: click search button (should trigger 500) ---");
const click = await browser.execute({
  action: "click",
  target: "button",
  reason: "probe",
});
console.log(JSON.stringify(click, null, 2));

if (click.data?.networkErrors?.length > 0) {
  console.log("\n✅ SUCCESS: networkErrors surfaced in click result.data");
} else {
  console.log("\n❌ FAIL: click result.data has no networkErrors. Data was:", click.data);
}

await browser.stop();
