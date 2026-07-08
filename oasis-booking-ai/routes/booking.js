import express from "express";
import { draftBookingReply } from "../ai/bookingAssistant.js";

const router = express.Router();

router.post("/quote", async (req, res) => {
  const quote = draftBookingReply(req.body);
  res.json(quote);
});

router.post("/handoff", async (req, res) => {
  const { guestName, phone, message } = req.body;

  res.json({
    status: "handoff_required",
    sendTo: [process.env.ESCALATION_PRIMARY, process.env.ESCALATION_SECONDARY].filter(Boolean),
    guestName,
    phone,
    message
  });
});

export default router;
