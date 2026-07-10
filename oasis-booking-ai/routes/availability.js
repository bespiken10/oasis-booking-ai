import express from "express";
import {
  getRoomBookings,
  getRoomTypes
} from "../services/stayflexi.js";

const router = express.Router();

function toStayflexiDate(date) {
  const match = String(date || "").match(
    /^(\d{4})-(\d{2})-(\d{2})$/
  );

  if (!match) {
    return null;
  }

  const [, year, month, day] = match;

  return `${day}-${month}-${year} 00:00:00`;
}

function parseStayflexiDate(value) {
  const match = String(value || "").match(
    /^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/
  );

  if (!match) {
    return null;
  }

  const [
    ,
    day,
    month,
    year,
    hour,
    minute,
    second
  ] = match;

  return new Date(
    `${year}-${month}-${day}T${hour}:${minute}:${second}+05:30`
  );
}

function reservationOverlapsStay(
  reservation,
  requestedCheckin,
  requestedCheckout
) {
  const reservationCheckin = parseStayflexiDate(
    reservation.checkin
  );

  const reservationCheckout = parseStayflexiDate(
    reservation.checkout
  );

  if (!reservationCheckin || !reservationCheckout) {
    return false;
  }

  return (
    reservationCheckin < requestedCheckout &&
    reservationCheckout > requestedCheckin
  );
}

router.get("/", async (req, res) => {
  const {
    checkin,
    checkout,
    guests,
    roomType
  } = req.query;

  if (!checkin || !checkout) {
    return res.status(400).json({
      error: "checkin and checkout are required",
      example:
        "/availability?checkin=2026-07-10&checkout=2026-07-12&guests=2"
    });
  }

  const startDate = toStayflexiDate(checkin);
  const endDate = toStayflexiDate(checkout);

  if (!startDate || !endDate) {
    return res.status(400).json({
      error: "Dates must use YYYY-MM-DD format"
    });
  }

  const requestedCheckin = new Date(
    `${checkin}T14:00:00+05:30`
  );

  const requestedCheckout = new Date(
    `${checkout}T13:00:00+05:30`
  );

  if (
    Number.isNaN(requestedCheckin.getTime()) ||
    Number.isNaN(requestedCheckout.getTime())
  ) {
    return res.status(400).json({
      error: "Invalid checkin or checkout date"
    });
  }

  if (requestedCheckout <= requestedCheckin) {
    return res.status(400).json({
      error: "checkout must be after checkin"
    });
  }

  const numOfDays = Math.max(
    1,
    Math.ceil(
      (requestedCheckout.getTime() -
        requestedCheckin.getTime()) /
        (1000 * 60 * 60 * 24)
    ) + 1
  );

  try {
    const [calendar, roomTypes] = await Promise.all([
      getRoomBookings({
        startDate,
        numOfDays
      }),
      getRoomTypes()
    ]);

    const rooms =
      calendar?.allRoomReservations
        ?.singleRoomReservations || [];

    const filteredRooms = rooms.filter((room) => {
      if (!roomType) {
        return true;
      }

      const requestedRoomType = String(
        roomType
      ).toLowerCase();

      return (
        String(room.roomTypeId) === String(roomType) ||
        String(room.roomTypeName || "")
          .toLowerCase()
          .includes(requestedRoomType) ||
        String(room.roomTypeCode || "")
          .toLowerCase()
          .includes(requestedRoomType)
      );
    });

    const roomsWithAvailability = filteredRooms.map(
      (room) => {
        const reservations = Array.isArray(
          room.resInfoList
        )
          ? room.resInfoList
          : [];

        const conflicts = reservations.filter(
          (reservation) =>
            reservationOverlapsStay(
              reservation,
              requestedCheckin,
              requestedCheckout
            )
        );

        return {
          roomId: room.roomId,
          roomTypeId: room.roomTypeId,
          roomTypeName: room.roomTypeName,
          roomTypeCode: room.roomTypeCode,
          available: conflicts.length === 0
        };
      }
    );

    const availableRooms =
      roomsWithAvailability.filter(
        (room) => room.available
      );

    return res.json({
      status: "live",
      hotelId: process.env.STAYFLEXI_HOTEL_ID,
      request: {
        checkin,
        checkout,
        guests: guests
          ? Number.parseInt(guests, 10)
          : null,
        roomType: roomType || null
      },
      available: availableRooms.length > 0,
      summary: {
        totalRoomsChecked:
          roomsWithAvailability.length,
        availableRoomCount:
          availableRooms.length,
        unavailableRoomCount:
          roomsWithAvailability.length -
          availableRooms.length
      },
      rooms: roomsWithAvailability,
      availableRooms,
      roomTypes
    });
  } catch (error) {
    console.error(
      "StayFlexi availability error:",
      error
    );

    return res.status(502).json({
      error:
        "Unable to retrieve live room availability",
      details: error.message
    });
  }
});

export default router;
