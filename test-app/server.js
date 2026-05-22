// BugShop - Intentionally buggy e-commerce demo for QA agent case study
//
// This server contains DELIBERATE BUGS for a QA agent to discover.
// See test-app/BUGS.md for the full list.

const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3100;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// In-memory data
const products = [
  { id: 1, name: "Wireless Headphones", price: 89.99, category: "audio", inventory: 12 },
  { id: 2, name: "Smart Watch Pro", price: 249.99, category: "wearables", inventory: 8 },
  { id: 3, name: "USB-C Hub", price: 39.99, category: "accessories", inventory: 0 },
  { id: 4, name: "Mechanical Keyboard", price: 129.99, category: "accessories", inventory: 4 },
];

let nextProductId = 5;
const sessions = new Set();

// Known user accounts for the demo. Login must validate submitted
// credentials against this list; unknown email/password combinations
// must be rejected so anonymous users cannot bypass authentication.
const users = [
  { email: "demo@bugshop.test", password: "demo1234" },
  { email: "admin@bugshop.test", password: "admin1234" },
];

// ─────────────────────────────────────────────────────────────────────────
// Auth helpers
// ─────────────────────────────────────────────────────────────────────────

// Minimal cookie parser — pulls a named cookie from the raw Cookie header.
// (We avoid adding a `cookie-parser` dependency.)
function getCookie(req, name) {
  const header = req.headers && req.headers.cookie;
  if (!header) return null;
  const parts = header.split(";");
  for (const part of parts) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k === name) return decodeURIComponent(v);
  }
  return null;
}

function isAuthenticated(req) {
  const sessionId = getCookie(req, "session");
  return !!sessionId && sessions.has(sessionId);
}

// Middleware: require an authenticated session for API routes.
// Responds 401 Unauthorized when no valid session cookie is present.
function requireAuthApi(req, res, next) {
  if (!isAuthenticated(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  return next();
}

// Middleware: require an authenticated session for HTML pages.
// Redirects anonymous visitors to /login.html.
function requireAuthPage(req, res, next) {
  if (!isAuthenticated(req)) {
    return res.redirect(302, "/login.html");
  }
  return next();
}

// ─────────────────────────────────────────────────────────────────────────
// Static pages — served as plain HTML to keep the agent's navigation simple
// ─────────────────────────────────────────────────────────────────────────

// Gate the admin page BEFORE express.static can serve admin.html directly.
app.get(["/admin", "/admin.html"], requireAuthPage, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.use(express.static(path.join(__dirname, "public")));

// ─────────────────────────────────────────────────────────────────────────
// AUTH endpoints
// ─────────────────────────────────────────────────────────────────────────

// BUG_002 fix: validate credentials before issuing a session. Previously the
// endpoint only checked that an email was present and would mint a session
// for ANY input — including empty passwords and unknown users — which let
// anonymous visitors reach protected pages like /dashboard.html.
app.post("/api/login", (req, res) => {
  const { email, password } = req.body || {};

  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }
  if (!password) {
    return res.status(400).json({ error: "Password is required" });
  }

  const user = users.find((u) => u.email === email && u.password === password);
  if (!user) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const sessionId = `sess_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  sessions.add(sessionId);
  res.cookie("session", sessionId, { httpOnly: true });
  return res.json({ ok: true, redirect: "/dashboard.html", session: sessionId });
});

// BUG #2 (CRITICAL): Signup throws TypeError on certain email patterns
app.post("/api/signup", (req, res) => {
  const { email, password, name } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password required" });
  }

  // BUG_005 fix: reject signups with empty/missing name. Without this, the
  // system accumulates anonymous accounts that break greetings, reporting,
  // and any downstream code assuming `name` is non-empty.
  if (typeof name !== "string" || name.trim() === "") {
    return res.status(400).json({ error: "Name is required" });
  }

  // BUG: parsing email domain crashes on malformed inputs (no try/catch).
  // If email contains no @, .split("@")[1].split(".") throws.
  const domain = email.split("@")[1].split(".")[0]; // <-- BUG HERE
  const initials = name ? name.charAt(0).toUpperCase() : domain.charAt(0).toUpperCase();

  return res.json({
    ok: true,
    user: { email, initials, domain },
    redirect: "/dashboard.html",
  });
});

app.post("/api/logout", (req, res) => {
  res.clearCookie("session");
  return res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────────
// PRODUCTS endpoints
// ─────────────────────────────────────────────────────────────────────────

app.get("/api/products", (req, res) => {
  const q = (req.query.q || "").toString();

  // BUG_004 cleanup: hide any pre-existing products with invalid (non-positive)
  // prices from the public catalog so they cannot be purchased even if they
  // were persisted before validation was added.
  const visibleProducts = products.filter((p) => typeof p.price === "number" && p.price > 0);

  // Escape regex special characters in the user-supplied query so that
  // inputs like `[`, `*?`, or `\` are treated as literal text instead of
  // throwing a SyntaxError when compiling the RegExp.
  if (q) {
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(escaped, "i");
    const filtered = visibleProducts.filter((p) => re.test(p.name));
    return res.json({ products: filtered });
  }

  return res.json({ products: visibleProducts });
});

app.get("/api/products/:id", (req, res) => {
  const id = parseInt(req.params.id, 10);
  const product = products.find((p) => p.id === id);
  if (!product) return res.status(404).json({ error: "Product not found" });
  return res.json({ product });
});

// BUG #4 (HIGH): /admin/products POST returns 500 when category is missing
// Should validate and return 400 with field-level error.
//
// BUG #3 fix: this endpoint must require an authenticated admin session.
// Without `requireAuthApi`, any anonymous visitor could persist arbitrary
// products into the public catalog.
app.post("/api/admin/products", requireAuthApi, (req, res) => {
  const { name, price, category } = req.body;

  if (!name || price === undefined || price === null || price === "") {
    return res.status(400).json({ error: "Name and price required" });
  }

  // BUG_005 fix: reject non-positive or non-numeric prices. A price of zero
  // or below would either give the product away or credit the customer at
  // checkout, so this is a financial-exposure guard.
  const parsedPrice = parseFloat(price);
  if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
    return res.status(400).json({ error: "Price must be a positive number greater than 0" });
  }

  // BUG_007 fix: validate category server-side before normalizing. Previously
  // a missing/empty category caused `category.toLowerCase()` to throw, which
  // surfaced to the client as a 5xx. Reject with a 4xx field-level error.
  if (typeof category !== "string" || category.trim() === "") {
    return res.status(400).json({ error: "Category is required" });
  }

  const normalizedCategory = category.toLowerCase();

  const newProduct = {
    id: nextProductId++,
    name,
    price: parsedPrice,
    category: normalizedCategory,
    inventory: 0,
  };
  products.push(newProduct);
  return res.json({ ok: true, product: newProduct });
});

// ─────────────────────────────────────────────────────────────────────────
// CART / CHECKOUT
// ─────────────────────────────────────────────────────────────────────────

app.post("/api/cart/add", (req, res) => {
  const { productId, quantity } = req.body;
  const product = products.find((p) => p.id === parseInt(productId, 10));
  if (!product) return res.status(404).json({ error: "Product not found" });
  if (product.inventory <= 0) return res.status(400).json({ error: "Out of stock" });
  return res.json({ ok: true, added: { productId: product.id, quantity: quantity || 1 } });
});

// BUG #7 (LOW): Slow endpoint. Dashboard stats take 3-4s to respond
// (deliberate to demonstrate performance metrics capture).
app.get("/api/dashboard/stats", (req, res) => {
  const delay = 3000 + Math.random() * 1500;
  setTimeout(() => {
    res.json({
      totalProducts: products.length,
      lowStock: products.filter((p) => p.inventory < 5).length,
      outOfStock: products.filter((p) => p.inventory === 0).length,
    });
  }, delay);
});

// ─────────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`BugShop test app running at http://localhost:${PORT}`);
  console.log("This app contains intentional bugs for QA agent case studies.");
  console.log("See test-app/BUGS.md for the full list.");
});
