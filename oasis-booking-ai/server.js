import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import availabilityRoutes from "./routes/availability.js";
import pricingRoutes from "./routes/pricing.js";
import bookingRoutes from "./routes/booking.js";
import whatsappRoutes from "./routes/whatsapp.js";

import { getRoomTypes } from "./services/stayflexi.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "Oasis Booking AI Backend",
    hotel: "Oasis Executive Suites"
  });
});

app.get("/room-types", async (req, res) => {
  try {
    const data = await getRoomTypes();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.use("/availability", availabilityRoutes);
app.use("/pricing", pricingRoutes);
app.use("/booking", bookingRoutes);
app.use("/whatsapp", whatsappRoutes);

app.listen(PORT, () => {
  console.log(`Oasis Booking AI Backend running on port ${PORT}`);
});
