import express from "express";

import {
  getRoomBookings,
  getStayflexiConfigStatus,
} from "../services/stayflexi.js";

const router = express.Router();

/**
 * Validate a date in YYYY-MM-DD format.
 */
function normalizeDate(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = String(value).trim();

  if (!normalized) {
    return null;
  }

  const datePattern = /^\d{4}-\d{2}-\d{2}$/;

  if (!datePattern.test(normalized)) {
    return null;
  }

  const parsedDate = new Date(`${normalized}T00:00:00.000Z`);

  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return normalized;
}

/**
 * Validate guest count.
 */
function normalizeGuests(value) {
  const guests = Number.parseInt(value, 10);

  if (!Number.isInteger(guests)) {
    return null;
  }

  if (guests < 1 || guests > 20) {
    return null;
  }

  return guests;
}

/**
 * Safe error payload for upstream failures.
 */
function buildErrorResponse(error, requestStartedAt) {
  return {
    status: "error",
    error: "Unable to retrieve live availability",
    message: error?.message || "Unknown availability error",
    upstreamStatus: error?.upstreamStatus || null,
    upstreamData: error?.upstreamData || null,
    responseTimeMs: Date.now() - requestStartedAt,
    checkedAt: new Date().toISOString(),
  };
}

/**
 * Availability route health check.
 *
 * GET /availability/health
 */
router.get("/health", (req, res) => {
  const config = getStayflexiConfigStatus();

  return res.status(200).json({
    status: "ok",
    route: "availability",
    stayflexiServiceLoaded: true,
    configuration: config,
    timestamp: new Date().toISOString(),
  });
});

/**
 * Live availability endpoint.
 *
 * Example:
 * GET /availability?checkin=2026-07-15&checkout=2026-07-16&guests=2
 */
router.get("/", async (req, res) => {
  const requestStartedAt = Date.now();

  const checkin = normalizeDate(
    req.query.checkin || req.query.startDate
  );

  const checkout = normalizeDate(
    req.query.checkout || req.query.endDate
  );

  const guests = normalizeGuests(req.query.guests || 1);

  if (!checkin) {
    return res.status(400).json({
      status: "error",
      error: "Invalid check-in date",
      message: "Provide checkin in YYYY-MM-DD format.",
      example:
        "/availability?checkin=2026-07-15&checkout=2026-07-16&guests=2",
    });
  }

  if (!checkout) {
    return res.status(400).json({
      status: "error",
      error: "Invalid checkout date",
      message: "Provide checkout in YYYY-MM-DD format.",
      example:
        "/availability?checkin=2026-07-15&checkout=2026-07-16&guests=2",
    });
  }

  if (checkout <= checkin) {
    return res.status(400).json({
      status: "error",
      error: "Invalid date range",
      message: "Checkout must be later than check-in.",
    });
  }

  if (!guests) {
    return res.status(400).json({
      status: "error",
      error: "Invalid guest count",
      message: "Guests must be a whole number between 1 and 20.",
    });
  }

  try {
    console.log("[availability] Request received", {
      checkin,
      checkout,
      guests,
    });

    const upstreamResult = await getRoomBookings({
      checkin,
      checkout,
      guests,
    });

    return res.status(200).json({
      status: "live",
      request: {
        checkin,
        checkout,
        guests,
      },
      upstreamStatus: upstreamResult.status,
      data: upstreamResult.data,
      responseTimeMs: Date.now() - requestStartedAt,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[availability] Request failed", {
      message: error?.message,
      statusCode: error?.statusCode,
      upstreamStatus: error?.upstreamStatus,
      upstreamData: error?.upstreamData,
      responseTimeMs: Date.now() - requestStartedAt,
    });

    const statusCode =
      Number.isInteger(error?.statusCode) &&
      error.statusCode >= 400 &&
      error.statusCode <= 599
        ? error.statusCode
        : 500;

    return res
      .status(statusCode)
      .json(buildErrorResponse(error, requestStartedAt));
  }
});

export default router;
