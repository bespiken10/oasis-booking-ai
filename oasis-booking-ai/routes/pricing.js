import express from "express";

const router = express.Router();

router.get("/", async (req, res) => {
  const { checkin, checkout, roomType } = req.query;

  res.json({
    status: "needs_rate_endpoint",
    message: "Pricing route ready. Add StayFlexi rate-plan endpoint after capture.",
    request: { checkin, checkout, roomType }
  });
});

export default router;
