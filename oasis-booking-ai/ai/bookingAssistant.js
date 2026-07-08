export function draftBookingReply(input = {}) {
  const guestName = input.guestName || "Guest";

  return {
    status: "draft_reply",
    guestName,
    instructions: [
      "Check live availability in StayFlexi before confirming.",
      "Never confirm final price without live rate and tax validation.",
      "If guest shares OTA price, ask for screenshot showing taxes and platform fees.",
      "Escalate uncertain or high-value bookings to the manager."
    ],
    message: `Hello ${guestName}, thank you for contacting Oasis Executive Suites. Please share your check-in date, check-out date, number of guests, and preferred room type. I will check live availability and the best available rate for you.`
  };
}
