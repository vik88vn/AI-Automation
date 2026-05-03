#!/usr/bin/env node
import "dotenv/config";
import { startServer } from "./server.js";

const port = Number(process.env.AGENT_PORT ?? 4310);
startServer(port);
