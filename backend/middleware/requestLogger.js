export const requestLogger = (req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    const color = res.statusCode >= 500 ? "\x1b[31m" : res.statusCode >= 400 ? "\x1b[33m" : "\x1b[32m";
    console.log(`${color}[${new Date().toISOString()}] ${req.method} ${req.path} ${res.statusCode} — ${duration}ms\x1b[0m`);
  });
  next();
};