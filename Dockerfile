# ──────────────────────────────────────────────────────────────────────────
# AI QA Engineer — backend (agent server + Playwright)
#
# Uses the official Playwright image so Chromium and all required system
# libraries are preinstalled and version-matched to the playwright npm
# package (1.59.1 — see package-lock.json). This is the most reliable way to
# run Playwright on a PaaS like Railway, where Nixpacks often misses browser
# system dependencies.
# ──────────────────────────────────────────────────────────────────────────
FROM mcr.microsoft.com/playwright:v1.59.1-jammy

WORKDIR /app

# Install node deps first for better layer caching. The Prisma schema must be
# present before `prisma generate`, which `tsc` depends on for its types.
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# Generate the Prisma client so the TypeScript build can resolve its types.
# (Does not require a live database connection.)
RUN npx prisma generate

# Copy the backend source and compile to dist/.
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Chromium ships in the base image, but install explicitly to guarantee the
# browser revision matches the installed playwright version.
RUN npx playwright install chromium

ENV NODE_ENV=production

# Railway injects PORT at runtime; this EXPOSE is for local `docker run`.
EXPOSE 4310

CMD ["node", "dist/agent/serve.js"]
