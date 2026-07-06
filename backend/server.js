import app from "./app.js";
import { ENV } from "./config/env.js";
import "./config/firebase-admin.js";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = ENV.PORT;

const frontendPath = path.join(__dirname, "../frontend");
app.use(express.static(frontendPath));

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api")) return next();
  const indexPath = path.join(frontendPath, "frontend/index.html");
  res.sendFile(indexPath, (err) => {
    if (err) next();
  });
});

app.listen(PORT, () => {
  console.log(`\x1b[32m✅ CampusSplit server running\x1b[0m`);
  console.log(`\x1b[36m   Frontend: http://localhost:${PORT}\x1b[0m`);
  console.log(`\x1b[36m   API:      http://localhost:${PORT}/api\x1b[0m`);
  console.log(`\x1b[36m   Health:   http://localhost:${PORT}/health\x1b[0m`);
  console.log(`\x1b[36m   Env:      ${ENV.NODE_ENV}\x1b[0m`);
});

process.on("unhandledRejection", (reason) => {
  console.error("\x1b[31m[UnhandledRejection]\x1b[0m", reason);
});

process.on("uncaughtException", (err) => {
  console.error("\x1b[31m[UncaughtException]\x1b[0m", err.message);
  process.exit(1);
});