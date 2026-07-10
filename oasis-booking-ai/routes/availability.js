const express = require("express");
const router = express.Router();

const { getRoomBookings } = require("../services/stayflexi");

/**
 * Convert any value into a clean lowercase string.
 */
function normalize(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

/**
 * Check that a date uses YYYY-MM-DD format
 * and represents a real calendar date.
 */
function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

/**
 * Extract the room array from possible StayFlexi response formats.
 */
function extractRooms(response) {
  if (Array.isArray(response)) {
    return response;
  }

  if (Array.isArray(response?.rooms)) {
    return response.rooms;
  }

  if (Array.isArray(response?.data)) {
    return response.data;
  }

  if (Array.isArray(response?.data?.rooms)) {
    return response.data.rooms;
  }

  if (Array.isArray(response?.roomBookings)) {
    return response.roomBookings;
  }

  if (Array.isArray(response?.data?.roomBookings)) {
    return response.data.roomBookings;
  }

  return [];
}

/**
 * Convert different availability values into true or false.
 */
function resolveAvailability(room) {
  if (typeof room?.available === "boolean") {
    return room.available;
  }

  if (typeof room?.isAvailable === "boolean") {
    return room.isAvailable;
  }

  if (typeof room?.availability === "boolean") {
    return room.availability;
  }

  if (typeof room?.available === "number") {
    return room.available > 0;
  }

  if (typeof room?.availability === "number") {
    return room.availability > 0;
  }

  if (typeof room?.availableRooms === "number") {
    return room.availableRooms > 0;
  }

  if (typeof room?.inventory === "number") {
    return room.inventory > 0;
  }

  if (typeof room?.status === "string") {
    const status = normalize(room.status);

    return (
      status === "available" ||
      status === "open" ||
      status === "vacant" ||
      status === "true"
    );
  }

  return false;
}

/**
 * Convert the StayFlexi room object into the format
 * returned by this API.
 */
function formatRoom(room) {
  return {
    roomId:
      room?.roomId ??
      room?.room_id ??
      room?.id ??
      room?.roomNumber ??
      room?.room_number ??
      null,

    roomTypeId:
      room?.roomTypeId ??
      room?.room_type_id ??
      room?.roomType?.id ??
      room?.room_type?.id ??
      null,

    roomTypeName:
      room?.roomTypeName ??
      room?.room_type_name ??
      room?.roomType?.name ??
      room?.room_type?.name ??
      room?.name ??
      null,

    roomTypeCode:
      room?.roomTypeCode ??
      room?.room_type_code ??
      room?.roomType?.code ??
      room?.room_type?.code ??
      room?.code ??
      null,

    available: resolveAvailability(room),
  };
}

/**
 * GET /availability
 *
 * Example:
 * /availability?checkin=2026-07-15&checkout=2026-07-16&guests=2
 *
 * Room type may be matched by:
 * - roomTypeId
 * - roomTypeName
 * - roomTypeCode
 *
 * Matching is exact, so "Deluxe" does not match "Super Deluxe".
 */
router.get("/", async (req, res) => {
  try {
    const hotelId = String(process.env.STAYFLEXI_HOTEL_ID || "").trim();

    const checkin = String(req.query.checkin || "").trim();
    const checkout = String(req.query.checkout || "").trim();
    const roomType = String(req.query.roomType || "").trim();

    const guestsValue = Number.parseInt(req.query.guests || "1", 10);
    const guests =
      Number.isInteger(guestsValue) && guestsValue > 0 ? guestsValue : 1;

    if (!hotelId) {
      return res.status(500).json({
        error: "Missing STAYFLEXI_HOTEL_ID",
      });
    }

    if (!checkin || !checkout) {
      return res.status(400).json({
        error: "Missing required dates",
        required: ["checkin", "checkout"],
        example:
          "/availability?checkin=2026-07-15&checkout=2026-07-16&guests=2",
      });
    }

    if (!isValidDate(checkin) || !isValidDate(checkout)) {
      return res.status(400).json({
        error: "Invalid date format",
        message: "Dates must use YYYY-MM-DD format.",
      });
    }

    const checkinDate = new Date(`${checkin}T00:00:00.000Z`);
    const checkoutDate = new Date(`${checkout}T00:00:00.000Z`);

    if (checkoutDate <= checkinDate) {
      return res.status(400).json({
        error: "Invalid date range",
        message: "Checkout must be later than check-in.",
      });
    }

    /*
     * This expects services/stayflexi.js to export:
     *
     * getRoomBookings(hotelId, checkin, checkout)
     */
    const stayflexiResponse = await getRoomBookings(
      hotelId,
      checkin,
      checkout
    );

    const rooms = extractRooms(stayflexiResponse).map(formatRoom);

    const requestedRoomType = normalize(roomType);

    const filteredRooms = requestedRoomType
      ? rooms.filter((room) => {
          return (
            normalize(room.roomTypeId) === requestedRoomType ||
            normalize(room.roomTypeName) === requestedRoomType ||
            normalize(room.roomTypeCode) === requestedRoomType
          );
        })
      : rooms;

    const availableRooms = filteredRooms.filter(
      (room) => room.available === true
    );

    const unavailableRooms = filteredRooms.filter(
      (room) => room.available !== true
    );

    return res.status(200).json({
      status: "live",
      hotelId,

      request: {
        checkin,
        checkout,
        guests,
        roomType: roomType || null,
      },

      available: availableRooms.length > 0,

      summary: {
        totalRoomsChecked: filteredRooms.length,
        availableRoomCount: availableRooms.length,
        unavailableRoomCount: unavailableRooms.length,
      },

      rooms: filteredRooms,
    });
  } catch (error) {
    console.error("Availability route error:", {
      message: error?.message,
      status: error?.response?.status,
      data: error?.response?.data,
      stack: error?.stack,
    });

    return res.status(error?.response?.status || 502).json({
      status: "error",
      error: "Unable to retrieve live availability",
      message:
        error?.response?.data?.message ||
        error?.message ||
        "StayFlexi request failed.",
    });
  }
});

module.exports = router;
