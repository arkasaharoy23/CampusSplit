import app from "./app.js";
import { ENV } from "./config/env.js";
import "./config/firebase-admin.js";

const PORT = ENV.PORT;

app.listen(PORT, () => {
  console.log(`\x1b[32m✅ CampusSplit API running on http://localhost:${PORT}\x1b[0m`);
  console.log(`\x1b[36m   Environment: ${ENV.NODE_ENV}\x1b[0m`);
  console.log(`\x1b[36m   Health check: http://localhost:${PORT}/health\x1b[0m`);
});

process.on("unhandledRejection", (reason) => {
  console.error("\x1b[31m[UnhandledRejection]\x1b[0m", reason);
});

process.on("uncaughtException", (err) => {
  console.error("\x1b[31m[UncaughtException]\x1b[0m", err.message);
  process.exit(1);
});