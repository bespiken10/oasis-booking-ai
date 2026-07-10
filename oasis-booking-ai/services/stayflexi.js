import "dotenv/config";
import express from "express";
import availabilityRouter from "./routes/availability.js";

const app = express();

const PORT = Number(process.env.PORT) || 8080;

app.disable("x-powered-by");

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// Basic request logging
app.use((req, res, next) => {
  const startedAt = Date.now();

  res.on("finish", () => {
    console.log(
      `${req.method} ${req.originalUrl} ${res.statusCode} ${
        Date.now() - startedAt
      }ms`
    );
  });

  next();
});

// Root route
app.get("/", (req, res) => {
  res.status(200).json({
    ok: true,
    service: "Oasis Booking AI Backend",
    hotel: "Oasis Executive Suites",
    status: "online",
    timestamp: new Date().toISOString(),
  });
});

// Health-check route
app.get("/health", (req, res) => {
  res.status(200).json({
    ok: true,
    status: "healthy",
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// Availability routes
app.use("/availability", availabilityRouter);

// Handle unknown routes
app.use((req, res) => {
  res.status(404).json({
    status: "error",
    error: "Route not found",
    method: req.method,
    path: req.originalUrl,
  });
});

// Central error handler
app.use((error, req, res, next) => {
  console.error("Unhandled server error:", error);

  if (res.headersSent) {
    return next(error);
  }

  res.status(error.status || 500).json({
    status: "error",
    error: "Internal server error",
    message:
      process.env.NODE_ENV === "production"
        ? "The server could not complete the request."
        : error.message,
    timestamp: new Date().toISOString(),
  });
});

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`Oasis Booking AI Backend running on port ${PORT}`);
});

// Graceful shutdown
function shutdown(signal) {
  console.log(`${signal} received. Closing server.`);

  server.close(() => {
    console.log("Server closed.");
    process.exit(0);
  });

  setTimeout(() => {
    console.error("Forced shutdown after timeout.");
    process.exit(1);
  }, 10000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
  process.exit(1);
});
