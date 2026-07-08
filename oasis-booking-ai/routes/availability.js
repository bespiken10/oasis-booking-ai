import express from "express";
import { getRoomTypes } from "../services/stayflexi.js";

const router = express.Router();

router.get("/", async (req, res) => {
  const { checkin, checkout, guests, roomType } = req.query;

  try {
    const roomTypes = await getRoomTypes();

    res.json({
      status: "needs_calendar_endpoint",
      message: "Room types are connected. Live calendar inventory endpoint still needs to be captured from StayFlexi Network tab.",
      request: { checkin, checkout, guests, roomType },
      roomTypes
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
