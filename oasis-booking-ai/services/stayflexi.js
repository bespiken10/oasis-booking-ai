const BASE_URL =
  process.env.STAYFLEXI_BASE_URL || "https://api.stayflexi.com";

/**
 * Read environment variables at request time.
 * This avoids stale values and makes Railway configuration changes safer.
 */
function getConfig() {
  const hotelId = String(process.env.STAYFLEXI_HOTEL_ID || "").trim();
  const token = String(process.env.STAYFLEXI_TOKEN || "").trim();

  if (!hotelId) {
    throw new Error("Missing STAYFLEXI_HOTEL_ID");
  }

  if (!token) {
    throw new Error("Missing STAYFLEXI_TOKEN");
  }

  return {
    hotelId,
    token,
  };
}

/**
 * Join the StayFlexi base URL and API path safely.
 */
function createUrl(path) {
  const normalizedBaseUrl = BASE_URL.replace(/\/+$/, "");
  const normalizedPath = String(path || "").startsWith("/")
    ? path
    : `/${path}`;

  return new URL(`${normalizedBaseUrl}${normalizedPath}`);
}

/**
 * Parse JSON, text, or an empty StayFlexi response.
 */
async function parseStayflexiResponse(response) {
  const responseText = await response.text();

  let responseData = null;

  if (responseText) {
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = responseText;
    }
  }

  if (!response.ok) {
    const error = new Error(
      `StayFlexi ${response.status}: ${
        responseData === null
          ? "Empty upstream response"
          : JSON.stringify(responseData)
      }`
    );

    error.status = response.status;
    error.statusCode = response.status;
    error.response = {
      status: response.status,
      data: responseData,
    };

    throw error;
  }

  return responseData;
}

/**
 * Execute a GET request against StayFlexi.
 */
export async function stayflexiGet(path, params = {}) {
  const { hotelId, token } = getConfig();
  const url = createUrl(path);

  url.searchParams.set("hotel_id", hotelId);
  url.searchParams.set("hotelId", hotelId);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: token,
      Accept: "application/json",
    },
  });

  return parseStayflexiResponse(response);
}

/**
 * Execute a POST request against StayFlexi.
 */
export async function stayflexiPost(path, body = {}) {
  const { hotelId, token } = getConfig();
  const url = createUrl(path);

  url.searchParams.set("hotel_id", hotelId);
  url.searchParams.set("hotelId", hotelId);

  const requestBody = {
    ...body,
    hotelId,
    hotel_id: hotelId,
  };

  console.log("StayFlexi request", {
    method: "POST",
    path,
    hotelId,
    startDate: requestBody.startDate || null,
    numOfDays: requestBody.numOfDays || null,
    roomTypes: requestBody.roomTypes || null,
  });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: token,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  return parseStayflexiResponse(response);
}

/**
 * Convert YYYY-MM-DD into a UTC date.
 */
function parseDate(dateString) {
  const value = String(dateString || "").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

/**
 * Calculate the number of nights between check-in and check-out.
 */
function calculateNumberOfDays(checkin, checkout) {
  const start = parseDate(checkin);
  const end = parseDate(checkout);

  if (!start || !end) {
    return null;
  }

  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  const difference = Math.round(
    (end.getTime() - start.getTime()) / millisecondsPerDay
  );

  return difference > 0 ? difference : null;
}

/**
 * Fetch StayFlexi room types.
 */
export function getRoomTypes() {
  return stayflexiGet("/api/v2/room/getAllRoomTypes/");
}

/**
 * Test basic StayFlexi connectivity.
 */
export function getBranding() {
  return stayflexiGet("/user/groupBranding", {
    hostUrl: "app.stayflexi.com",
  });
}

/**
 * Fetch room bookings and availability.
 *
 * Supports both:
 *
 * getRoomBookings({
 *   checkin,
 *   checkout,
 *   guests
 * })
 *
 * and the older format:
 *
 * getRoomBookings({
 *   startDate,
 *   numOfDays
 * })
 */
export function getRoomBookings({
  checkin,
  checkout,
  guests = 1,

  startDate,
  numOfDays,

  roomType,
  roomTypes = null,

  availableRooms = false,
  blockedRooms = false,
  bookedRooms = false,
  cleanRooms = false,
  clusterRooms = false,
  dirtyRooms = false,
} = {}) {
  const resolvedStartDate = String(
    startDate || checkin || ""
  ).trim();

  const calculatedDays = calculateNumberOfDays(checkin, checkout);

  const resolvedNumOfDays =
    Number.isInteger(Number(numOfDays)) && Number(numOfDays) > 0
      ? Number(numOfDays)
      : calculatedDays || 1;

  if (!resolvedStartDate) {
    throw new Error(
      "Missing StayFlexi start date. Provide checkin or startDate."
    );
  }

  let resolvedRoomTypes = roomTypes;

  if (!resolvedRoomTypes && roomType) {
    resolvedRoomTypes = [String(roomType).trim()];
  }

  return stayflexiPost(
    "/core/api/v1/reservation/navigationGetRoomBookings",
    {
      roomIdsSort: true,
      startDate: resolvedStartDate,
      numOfDays: resolvedNumOfDays,
      roomTypes: resolvedRoomTypes,

      availableRooms,
      blockedRooms,
      bookedRooms,
      cleanRooms,
      clusterRooms,
      dirtyRooms,

      guests: Number(guests) || 1,
      viewType: "resourceTimelineWeek",
    }
  );
}
