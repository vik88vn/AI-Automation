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

// ─────────────────────────────────────────────────────────────────────────
// Static pages — served as plain HTML to keep the agent's navigation simple
// ─────────────────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, "public")));

// ─────────────────────────────────────────────────────────────────────────
// AUTH endpoints
// ─────────────────────────────────────────────────────────────────────────

// BUG #1 (HIGH SEVERITY): Login accepts empty password
// Real validation should reject empty passwords; this code only checks email.
app.post("/api/login", (req, res) => {
  const { email, password } = req.body;

  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  // BUG: missing password validation. Empty password is accepted.
  // Should be: if (!password) return res.status(400).json({ error: "Password required" });

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

  // BUG #6 (MEDIUM): Search throws on certain regex characters
  // Wrapping the user query directly in `new RegExp` without escaping.
  // A query like `[` or `*?` will throw SyntaxError → 500 response.
  if (q) {
    const re = new RegExp(q, "i"); // <-- BUG: no escaping
    const filtered = products.filter((p) => re.test(p.name));
    return res.json({ products: filtered });
  }

  return res.json({ products });
});

app.get("/api/products/:id", (req, res) => {
  const id = parseInt(req.params.id, 10);
  const product = products.find((p) => p.id === id);
  if (!product) return res.status(404).json({ error: "Product not found" });
  return res.json({ product });
});

// BUG #4 (HIGH): /admin/products POST returns 500 when category is missing
// Should validate and return 400 with field-level error.
app.post("/api/admin/products", (req, res) => {
  const { name, price, category } = req.body;

  if (!name || !price) {
    return res.status(400).json({ error: "Name and price required" });
  }

  // BUG: when category is missing, we crash inside category.toLowerCase()
  // instead of returning 400.
  const normalizedCategory = category.toLowerCase(); // <-- BUG HERE

  const newProduct = {
    id: nextProductId++,
    name,
    price: parseFloat(price),
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
