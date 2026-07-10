const DEFAULT_BASE_URL = "https://api.stayflexi.com";

const DEFAULT_ROOM_BOOKINGS_PATH =
  "/core/api/v1/reservation/navigationGetRoomBookings";

/*
|--------------------------------------------------------------------------
| Runtime configuration
|--------------------------------------------------------------------------
|
| Environment variables are read when the function runs, not when the
| module first loads. This works better with Railway deployments.
|
| Required Railway variables:
|
| STAYFLEXI_HOTEL_ID
| STAYFLEXI_TOKEN
|
| Optional:
|
| STAYFLEXI_BASE_URL
| STAYFLEXI_ROOM_BOOKINGS_PATH
| STAYFLEXI_TIMEOUT_MS
|
*/

function getConfig() {
  const baseUrl = String(
    process.env.STAYFLEXI_BASE_URL || DEFAULT_BASE_URL
  )
    .trim()
    .replace(/\/+$/, "");

  const roomBookingsPath = String(
    process.env.STAYFLEXI_ROOM_BOOKINGS_PATH ||
      DEFAULT_ROOM_BOOKINGS_PATH
  ).trim();

  const hotelId = String(
    process.env.STAYFLEXI_HOTEL_ID ||
      process.env.HOTEL_ID ||
      ""
  ).trim();

  const token = String(
    process.env.STAYFLEXI_TOKEN ||
      process.env.STAYFLEXI_ACCESS_TOKEN ||
      ""
  ).trim();

  const timeoutInput = Number.parseInt(
    String(process.env.STAYFLEXI_TIMEOUT_MS || "20000"),
    10
  );

  const timeoutMs =
    Number.isInteger(timeoutInput) && timeoutInput > 0
      ? timeoutInput
      : 20000;

  return {
    baseUrl,
    roomBookingsPath,
    hotelId,
    token,
    timeoutMs,
  };
}

/*
|--------------------------------------------------------------------------
| Validation helpers
|--------------------------------------------------------------------------
*/

function isValidDate(value) {
  const dateString = String(value || "").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    return false;
  }

  const parsedDate = new Date(`${dateString}T00:00:00.000Z`);

  return (
    !Number.isNaN(parsedDate.getTime()) &&
    parsedDate.toISOString().slice(0, 10) === dateString
  );
}

function calculateNights(checkin, checkout) {
  if (!isValidDate(checkin) || !isValidDate(checkout)) {
    return null;
  }

  const checkinDate = new Date(`${checkin}T00:00:00.000Z`);
  const checkoutDate = new Date(`${checkout}T00:00:00.000Z`);

  const difference =
    checkoutDate.getTime() - checkinDate.getTime();

  const nights = Math.round(
    difference / (1000 * 60 * 60 * 24)
  );

  return nights > 0 ? nights : null;
}

function normalizeGuests(value) {
  const guests = Number.parseInt(String(value || "1"), 10);

  return Number.isInteger(guests) && guests > 0
    ? guests
    : 1;
}

function normalizeRoomTypes(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || "").trim())
      .filter(Boolean);
  }

  const roomType = String(value || "").trim();

  return roomType ? [roomType] : [];
}

/*
|--------------------------------------------------------------------------
| Argument compatibility
|--------------------------------------------------------------------------
|
| Supports the current route call:
|
| getRoomBookings(hotelId, checkin, checkout, guests)
|
| Also supports:
|
| getRoomBookings({
|   hotelId,
|   checkin,
|   checkout,
|   startDate,
|   numOfDays,
|   guests,
|   roomType
| })
|
*/

function normalizeArguments(
  hotelIdOrOptions,
  checkinArgument,
  checkoutArgument,
  guestsArgument
) {
  if (
    hotelIdOrOptions &&
    typeof hotelIdOrOptions === "object" &&
    !Array.isArray(hotelIdOrOptions)
  ) {
    const options = hotelIdOrOptions;

    const checkin = String(
      options.checkin ||
        options.checkIn ||
        options.check_in ||
        options.startDate ||
        ""
    ).trim();

    const checkout = String(
      options.checkout ||
        options.checkOut ||
        options.check_out ||
        options.endDate ||
        ""
    ).trim();

    const calculatedNights = calculateNights(
      checkin,
      checkout
    );

    const suppliedNights = Number.parseInt(
      String(
        options.numOfDays ||
          options.numberOfDays ||
          options.nights ||
          ""
      ),
      10
    );

    const numOfDays =
      Number.isInteger(suppliedNights) &&
      suppliedNights > 0
        ? suppliedNights
        : calculatedNights;

    return {
      hotelId: String(
        options.hotelId ||
          options.hotel_id ||
          ""
      ).trim(),

      checkin,
      checkout,

      startDate: String(
        options.startDate || checkin
      ).trim(),

      endDate: String(
        options.endDate || checkout
      ).trim(),

      numOfDays,

      guests: normalizeGuests(
        options.guests || options.adults
      ),

      roomTypes: normalizeRoomTypes(
        options.roomTypes ||
          options.roomType ||
          options.room_type
      ),
    };
  }

  const checkin = String(checkinArgument || "").trim();
  const checkout = String(checkoutArgument || "").trim();

  return {
    hotelId: String(hotelIdOrOptions || "").trim(),
    checkin,
    checkout,
    startDate: checkin,
    endDate: checkout,
    numOfDays: calculateNights(checkin, checkout),
    guests: normalizeGuests(guestsArgument),
    roomTypes: [],
  };
}

/*
|--------------------------------------------------------------------------
| Response parser
|--------------------------------------------------------------------------
*/

async function parseResponse(response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return {
      rawText: text,
    };
  }
}

function getErrorMessage(data, response) {
  if (typeof data === "string" && data.trim()) {
    return data.trim();
  }

  if (data?.message) {
    return String(data.message);
  }

  if (data?.error) {
    return typeof data.error === "string"
      ? data.error
      : JSON.stringify(data.error);
  }

  if (data?.rawText) {
    return String(data.rawText).slice(0, 500);
  }

  return `StayFlexi request failed with status ${response.status}`;
}

/*
|--------------------------------------------------------------------------
| Authentication headers
|--------------------------------------------------------------------------
|
| The token is never written to logs or returned to the browser.
|
*/

function buildHeaders(token) {
  const authorizationValue = /^Bearer\s+/i.test(token)
    ? token
    : `Bearer ${token}`;

  return {
    Accept: "application/json",
    "Content-Type": "application/json",

    Authorization: authorizationValue,

    /*
     * Some StayFlexi deployments read the raw token from one of these
     * headers. Sending both keeps the integration compatible without
     * exposing the value in responses or logs.
     */
    "x-access-token": token,
    token,
  };
}

/*
|--------------------------------------------------------------------------
| StayFlexi room-bookings request
|--------------------------------------------------------------------------
*/

export async function getRoomBookings(
  hotelIdOrOptions,
  checkinArgument,
  checkoutArgument,
  guestsArgument
) {
  const config = getConfig();

  const request = normalizeArguments(
    hotelIdOrOptions,
    checkinArgument,
    checkoutArgument,
    guestsArgument
  );

  const hotelId = request.hotelId || config.hotelId;

  if (!hotelId) {
    const error = new Error(
      "Missing STAYFLEXI_HOTEL_ID. Add it in Railway Variables."
    );

    error.status = 500;
    throw error;
  }

  if (!config.token) {
    const error = new Error(
      "Missing STAYFLEXI_TOKEN. Add a valid token in Railway Variables."
    );

    error.status = 500;
    throw error;
  }

  if (!request.startDate) {
    const error = new Error(
      "Missing StayFlexi start date. Provide checkin or startDate."
    );

    error.status = 400;
    throw error;
  }

  if (!isValidDate(request.startDate)) {
    const error = new Error(
      "Invalid StayFlexi start date. Use YYYY-MM-DD."
    );

    error.status = 400;
    throw error;
  }

  if (
    request.endDate &&
    !isValidDate(request.endDate)
  ) {
    const error = new Error(
      "Invalid StayFlexi end date. Use YYYY-MM-DD."
    );

    error.status = 400;
    throw error;
  }

  if (
    !Number.isInteger(request.numOfDays) ||
    request.numOfDays < 1
  ) {
    const error = new Error(
      "Unable to calculate StayFlexi stay length. Checkout must be later than check-in."
    );

    error.status = 400;
    throw error;
  }

  const endpointPath = config.roomBookingsPath.startsWith("/")
    ? config.roomBookingsPath
    : `/${config.roomBookingsPath}`;

  const url = new URL(
    `${config.baseUrl}${endpointPath}`
  );

  /*
   * StayFlexi commonly expects both hotelId and hotel_id.
   * Supplying both avoids naming differences between API versions.
   */
  url.searchParams.set("hotelId", hotelId);
  url.searchParams.set("hotel_id", hotelId);

  const requestBody = {
    hotelId,
    hotel_id: hotelId,

    checkin: request.checkin || request.startDate,
    checkout: request.checkout || request.endDate,

    startDate: request.startDate,
    endDate: request.endDate,

    numOfDays: request.numOfDays,
    numberOfDays: request.numOfDays,
    nights: request.numOfDays,

    guests: request.guests,
    adults: request.guests,

    roomType:
      request.roomTypes.length === 1
        ? request.roomTypes[0]
        : null,

    roomTypes: request.roomTypes,
  };

  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, config.timeoutMs);

  const startedAt = Date.now();

  try {
    console.log("Calling StayFlexi room bookings API", {
      endpoint: url.pathname,
      hotelId,
      startDate: request.startDate,
      endDate: request.endDate || null,
      numOfDays: request.numOfDays,
      guests: request.guests,
      roomTypes: request.roomTypes,
    });

    const response = await fetch(url, {
      method: "POST",
      headers: buildHeaders(config.token),
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    const data = await parseResponse(response);

    if (!response.ok) {
      const message = getErrorMessage(data, response);

      const error = new Error(
        `StayFlexi ${response.status}: ${message}`
      );

      error.status = response.status;
      error.response = {
        status: response.status,
        data,
      };

      throw error;
    }

    console.log("StayFlexi room bookings API succeeded", {
      status: response.status,
      responseTimeMs: Date.now() - startedAt,
    });

    return data;
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeoutError = new Error(
        `StayFlexi request timed out after ${config.timeoutMs}ms.`
      );

      timeoutError.status = 504;
      timeoutError.response = {
        status: 504,
        data: {
          message: timeoutError.message,
        },
      };

      throw timeoutError;
    }

    console.error("StayFlexi room bookings API failed", {
      message: error?.message,
      status:
        error?.response?.status ||
        error?.status ||
        null,
      responseTimeMs: Date.now() - startedAt,
    });

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/*
|--------------------------------------------------------------------------
| Default export
|--------------------------------------------------------------------------
|
| This keeps compatibility with:
|
| import stayflexi from "../services/stayflexi.js";
|
*/

export default {
  getRoomBookings,
};
