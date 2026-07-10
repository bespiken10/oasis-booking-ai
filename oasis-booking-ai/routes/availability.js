import express from "express";
import * as stayflexiService from "../services/stayflexi.js";

const router = express.Router();

/*
|--------------------------------------------------------------------------
| StayFlexi service compatibility
|--------------------------------------------------------------------------
|
| This supports several possible export styles from services/stayflexi.js:
|
| export function getRoomBookings() {}
| export default { getRoomBookings }
| export default getRoomBookings
|
*/

const getRoomBookings =
  stayflexiService.getRoomBookings ??
  stayflexiService.default?.getRoomBookings ??
  (typeof stayflexiService.default === "function"
    ? stayflexiService.default
    : null);

/*
|--------------------------------------------------------------------------
| Helper functions
|--------------------------------------------------------------------------
*/

function normalize(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function isValidDate(value) {
  const dateString = String(value ?? "").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    return false;
  }

  const parsedDate = new Date(`${dateString}T00:00:00.000Z`);

  return (
    !Number.isNaN(parsedDate.getTime()) &&
    parsedDate.toISOString().slice(0, 10) === dateString
  );
}

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

  if (Array.isArray(response?.result)) {
    return response.result;
  }

  if (Array.isArray(response?.result?.rooms)) {
    return response.result.rooms;
  }

  return [];
}

function getNumericValue(...values) {
  for (const value of values) {
    const number = Number(value);

    if (Number.isFinite(number)) {
      return number;
    }
  }

  return null;
}

function resolveAvailableCount(room) {
  const availableCount = getNumericValue(
    room?.availableRooms,
    room?.available_rooms,
    room?.availableRoomCount,
    room?.available_room_count,
    room?.availability,
    room?.available,
    room?.inventory,
    room?.remainingInventory,
    room?.remaining_inventory
  );

  if (availableCount !== null) {
    return Math.max(0, availableCount);
  }

  if (
    room?.available === true ||
    room?.isAvailable === true ||
    room?.is_available === true
  ) {
    return 1;
  }

  return 0;
}

function resolveAvailability(room) {
  if (typeof room?.available === "boolean") {
    return room.available;
  }

  if (typeof room?.isAvailable === "boolean") {
    return room.isAvailable;
  }

  if (typeof room?.is_available === "boolean") {
    return room.is_available;
  }

  const availableCount = resolveAvailableCount(room);

  if (availableCount > 0) {
    return true;
  }

  const status = normalize(room?.status);

  return ["available", "open", "vacant", "active"].includes(status);
}

function formatRoom(room) {
  const roomType =
    room?.roomType ??
    room?.room_type ??
    room?.category ??
    room?.roomCategory ??
    {};

  const roomTypeId =
    room?.roomTypeId ??
    room?.room_type_id ??
    roomType?.id ??
    roomType?.roomTypeId ??
    roomType?.room_type_id ??
    null;

  const roomTypeName =
    room?.roomTypeName ??
    room?.room_type_name ??
    room?.roomName ??
    room?.room_name ??
    roomType?.name ??
    roomType?.roomTypeName ??
    roomType?.room_type_name ??
    room?.name ??
    null;

  const roomTypeCode =
    room?.roomTypeCode ??
    room?.room_type_code ??
    roomType?.code ??
    roomType?.roomTypeCode ??
    roomType?.room_type_code ??
    room?.code ??
    null;

  return {
    roomId:
      room?.roomId ??
      room?.room_id ??
      room?.id ??
      room?.roomNumber ??
      room?.room_number ??
      null,

    roomTypeId,
    roomTypeName,
    roomTypeCode,

    available: resolveAvailability(room),
    availableCount: resolveAvailableCount(room),

    rate: getNumericValue(
      room?.rate,
      room?.price,
      room?.roomRate,
      room?.room_rate,
      room?.baseRate,
      room?.base_rate
    ),

    currency:
      room?.currency ??
      room?.currencyCode ??
      room?.currency_code ??
      "INR",

    raw: room,
  };
}

function matchesRequestedRoomType(room, requestedRoomType) {
  if (!requestedRoomType) {
    return true;
  }

  return (
    normalize(room.roomTypeId) === requestedRoomType ||
    normalize(room.roomTypeName) === requestedRoomType ||
    normalize(room.roomTypeCode) === requestedRoomType
  );
}

/*
|--------------------------------------------------------------------------
| Health check
|--------------------------------------------------------------------------
*/

router.get("/health", (req, res) => {
  return res.status(200).json({
    status: "ok",
    route: "availability",
    stayflexiServiceLoaded: typeof getRoomBookings === "function",
    timestamp: new Date().toISOString(),
  });
});

/*
|--------------------------------------------------------------------------
| Availability route
|--------------------------------------------------------------------------
|
| Examples:
|
| /availability?checkin=2026-07-15&checkout=2026-07-16
|
| /availability?checkin=2026-07-15&checkout=2026-07-16
| &guests=2
| &roomType=Deluxe
|
*/

router.get("/", async (req, res) => {
  const startedAt = Date.now();

  try {
    const hotelId = String(
      process.env.STAYFLEXI_HOTEL_ID ??
        process.env.HOTEL_ID ??
        "23268"
    ).trim();

    const checkin = String(
      req.query.checkin ??
        req.query.checkIn ??
        req.query.check_in ??
        ""
    ).trim();

    const checkout = String(
      req.query.checkout ??
        req.query.checkOut ??
        req.query.check_out ??
        ""
    ).trim();

    const roomType = String(
      req.query.roomType ??
        req.query.room_type ??
        req.query.roomTypeName ??
        ""
    ).trim();

    const guestsInput = Number.parseInt(
      String(req.query.guests ?? req.query.adults ?? "1"),
      10
    );

    const guests =
      Number.isInteger(guestsInput) && guestsInput > 0
        ? guestsInput
        : 1;

    if (!hotelId) {
      return res.status(500).json({
        status: "error",
        error: "Missing hotel configuration",
        message:
          "STAYFLEXI_HOTEL_ID is not configured in Railway Variables.",
      });
    }

    if (!checkin || !checkout) {
      return res.status(400).json({
        status: "error",
        error: "Missing required dates",
        message: "Both checkin and checkout are required.",
        example:
          "/availability?checkin=2026-07-15&checkout=2026-07-16&guests=2",
      });
    }

    if (!isValidDate(checkin) || !isValidDate(checkout)) {
      return res.status(400).json({
        status: "error",
        error: "Invalid date format",
        message: "Dates must use YYYY-MM-DD format.",
      });
    }

    const checkinDate = new Date(`${checkin}T00:00:00.000Z`);
    const checkoutDate = new Date(`${checkout}T00:00:00.000Z`);

    if (checkoutDate <= checkinDate) {
      return res.status(400).json({
        status: "error",
        error: "Invalid date range",
        message: "Checkout must be later than check-in.",
      });
    }

    if (typeof getRoomBookings !== "function") {
      console.error(
        "StayFlexi service export error. Available exports:",
        Object.keys(stayflexiService)
      );

      return res.status(500).json({
        status: "error",
        error: "StayFlexi service is not configured correctly",
        message:
          "services/stayflexi.js must export getRoomBookings.",
        availableExports: Object.keys(stayflexiService),
      });
    }

    console.log("Checking StayFlexi availability", {
      hotelId,
      checkin,
      checkout,
      guests,
      roomType: roomType || null,
    });

    const stayflexiResponse = await getRoomBookings(
      hotelId,
      checkin,
      checkout,
      guests
    );

    const extractedRooms = extractRooms(stayflexiResponse);
    const formattedRooms = extractedRooms.map(formatRoom);

    const requestedRoomType = normalize(roomType);

    const filteredRooms = formattedRooms.filter((room) =>
      matchesRequestedRoomType(room, requestedRoomType)
    );

    const availableRooms = filteredRooms.filter(
      (room) => room.available === true
    );

    const totalAvailableInventory = availableRooms.reduce(
      (total, room) => total + room.availableCount,
      0
    );

    const nights = Math.round(
      (checkoutDate.getTime() - checkinDate.getTime()) /
        (1000 * 60 * 60 * 24)
    );

    return res.status(200).json({
      status: "success",
      source: "StayFlexi",
      live: true,

      hotelId,

      request: {
        checkin,
        checkout,
        nights,
        guests,
        roomType: roomType || null,
      },

      available: availableRooms.length > 0,

      summary: {
        roomsReceivedFromStayFlexi: extractedRooms.length,
        roomsMatchingRequest: filteredRooms.length,
        availableRoomTypes: availableRooms.length,
        totalAvailableInventory,
      },

      rooms: filteredRooms.map(({ raw, ...room }) => room),

      responseTimeMs: Date.now() - startedAt,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    const upstreamStatus =
      error?.response?.status ??
      error?.status ??
      502;

    const upstreamData =
      error?.response?.data ??
      error?.data ??
      null;

    console.error("Availability route failed", {
      message: error?.message,
      status: upstreamStatus,
      upstreamData,
      stack: error?.stack,
    });

    return res.status(
      upstreamStatus >= 400 && upstreamStatus < 600
        ? upstreamStatus
        : 502
    ).json({
      status: "error",
      error: "Unable to retrieve live availability",
      message:
        upstreamData?.message ??
        upstreamData?.error ??
        error?.message ??
        "StayFlexi request failed.",

      upstreamStatus,
      responseTimeMs: Date.now() - startedAt,
      checkedAt: new Date().toISOString(),
    });
  }
});

/*
|--------------------------------------------------------------------------
| Default ES-module export
|--------------------------------------------------------------------------
*/

export default router;
