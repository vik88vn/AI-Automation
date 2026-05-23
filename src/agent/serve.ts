#!/usr/bin/env node
import "dotenv/config";
import { startServer } from "./server.js";

// Railway (and most PaaS providers) inject the port to bind via `PORT`.
// Fall back to AGENT_PORT for local dev, then a sensible default.
const port = Number(process.env.PORT ?? process.env.AGENT_PORT ?? 4310);
startServer(port);
