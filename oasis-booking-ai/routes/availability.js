import express from "express";
import {
  getRoomBookings,
  normalizeStayflexiRooms,
} from "../services/stayflexi.js";

const router = express.Router();

function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function isValidDate(value) {
  if (!value) {
    return false;
  }

  const date = new Date(`${value}T00:00:00Z`);

  return !Number.isNaN(date.getTime());
}

function findMatchingRooms(rooms, requestedRoomType) {
  if (!requestedRoomType) {
    return rooms;
  }

  const wanted = normalizeText(requestedRoomType);

  return rooms.filter((room) => {
    const roomTypeId = normalizeText(room.roomTypeId);
    const roomTypeName = normalizeText(room.roomTypeName);
    const roomTypeCode = normalizeText(room.roomTypeCode);

    return (
      roomTypeId === wanted ||
      roomTypeName === wanted ||
      roomTypeCode === wanted
    );
  });
}

// Route status check
router.get("/status", (req, res) => {
  res.status(200).json({
    status: "ok",
    route: "availability",
    stayflexiServiceLoaded: true,
    timestamp: new Date().toISOString(),
  });
});

// Live availability
router.get("/", async (req, res) => {
  const startedAt = Date.now();

  const checkin = String(
    req.query.checkin || req.query.startDate || ""
  ).trim();

  const checkout = String(
    req.query.checkout || req.query.endDate || ""
  ).trim();

  const guests = Math.max(
    1,
    Number.parseInt(req.query.guests || req.query.adults || "1", 10) || 1
  );

  const roomType = String(req.query.roomType || "").trim() || null;

  if (!checkin) {
    return res.status(400).json({
      status: "error",
      error: "Missing check-in date",
      message: "Provide checkin in YYYY-MM-DD format.",
      example:
        "/availability?checkin=2026-07-15&checkout=2026-07-16&guests=2",
      responseTimeMs: Date.now() - startedAt,
      checkedAt: new Date().toISOString(),
    });
  }

  if (!checkout) {
    return res.status(400).json({
      status: "error",
      error: "Missing check-out date",
      message: "Provide checkout in YYYY-MM-DD format.",
      responseTimeMs: Date.now() - startedAt,
      checkedAt: new Date().toISOString(),
    });
  }

  if (!isValidDate(checkin) || !isValidDate(checkout)) {
    return res.status(400).json({
      status: "error",
      error: "Invalid date",
      message: "Both dates must use YYYY-MM-DD format.",
      responseTimeMs: Date.now() - startedAt,
      checkedAt: new Date().toISOString(),
    });
  }

  if (new Date(`${checkout}T00:00:00Z`) <= new Date(`${checkin}T00:00:00Z`)) {
    return res.status(400).json({
      status: "error",
      error: "Invalid date range",
      message: "checkout must be later than checkin.",
      responseTimeMs: Date.now() - startedAt,
      checkedAt: new Date().toISOString(),
    });
  }

  try {
    const upstreamData = await getRoomBookings({
      checkin,
      checkout,
      guests,
    });

    const rooms = normalizeStayflexiRooms(upstreamData);

    const filteredRooms = findMatchingRooms(rooms, roomType);

    const availableRooms = filteredRooms.filter(
      (room) => room.available === true
    );

    const unavailableRooms = filteredRooms.filter(
      (room) => room.available !== true
    );

    return res.status(200).json({
      status: "live",
      hotelId: process.env.STAYFLEXI_HOTEL_ID,
      request: {
        checkin,
        checkout,
        guests,
        roomType,
      },
      available: availableRooms.length > 0,
      summary: {
        totalRoomsChecked: filteredRooms.length,
        availableRoomCount: availableRooms.length,
        unavailableRoomCount: unavailableRooms.length,
      },
      rooms: filteredRooms,
      responseTimeMs: Date.now() - startedAt,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Availability route failed:", {
      message: error.message,
      statusCode: error.statusCode,
      upstreamStatus: error.upstreamStatus,
    });

    return res.status(error.statusCode || 502).json({
      status: "error",
      error: "Unable to retrieve live availability",
      message: error.message,
      upstreamStatus: error.upstreamStatus || null,
      responseTimeMs: Date.now() - startedAt,
      checkedAt: new Date().toISOString(),
    });
  }
});

export default router;
