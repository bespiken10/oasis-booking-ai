import express from "express";
import { draftBookingReply } from "../ai/bookingAssistant.js";

const router = express.Router();

router.post("/webhook", async (req, res) => {
  const incoming = req.body;

  const reply = draftBookingReply({
    guestName: incoming.name || incoming.guestName,
    phone: incoming.phone || incoming.from,
    message: incoming.message || incoming.text
  });

  res.json({
    status: "received",
    reply
  });
});

export default router;
