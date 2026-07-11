const BASE_URL =
  process.env.STAYFLEXI_BASE_URL?.trim() ||
  "https://api.stayflexi.com";

const HOTEL_ID = process.env.STAYFLEXI_HOTEL_ID?.trim();
const TOKEN = process.env.STAYFLEXI_TOKEN?.trim();

/**
 * Returns safe configuration details.
 * The actual token is never exposed.
 */
export function getStayflexiConfigStatus() {
  return {
    baseUrl: BASE_URL,
    hotelIdConfigured: Boolean(HOTEL_ID),
    tokenConfigured: Boolean(TOKEN),
    availabilityPathConfigured: Boolean(
      process.env.STAYFLEXI_AVAILABILITY_PATH?.trim()
    ),
  };
}

/**
 * Validate required environment variables.
 */
function requireStayflexiConfig() {
  if (!HOTEL_ID) {
    const error = new Error("Missing STAYFLEXI_HOTEL_ID");
    error.statusCode = 500;
    throw error;
  }

  if (!TOKEN) {
    const error = new Error("Missing STAYFLEXI_TOKEN");
    error.statusCode = 500;
    throw error;
  }
}

/**
 * Convert:
 * 2026-07-15
 *
 * Into StayFlexi format:
 * 15-07-2026
 */
function convertToStayflexiDate(dateValue) {
  if (!dateValue) {
    return null;
  }

  const normalized = String(dateValue).trim();

  const match = normalized.match(
    /^(\d{4})-(\d{2})-(\d{2})$/
  );

  if (!match) {
    const error = new Error(
      `Invalid date format: ${normalized}. Expected YYYY-MM-DD.`
    );

    error.statusCode = 400;
    throw error;
  }

  const [, year, month, day] = match;

  return `${day}-${month}-${year}`;
}

/**
 * Safely parse JSON or text returned by StayFlexi.
 */
async function parseStayflexiResponse(response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return {
      rawResponse: text.slice(0, 2000),
    };
  }
}

/**
 * Base StayFlexi request helper.
 */
export async function stayflexiRequest(
  path,
  {
    method = "GET",
    query = {},
    body,
    headers = {},
    timeoutMs = 15000,
  } = {}
) {
  requireStayflexiConfig();

  if (!path || typeof path !== "string") {
    const error = new Error(
      "A valid StayFlexi API path is required"
    );

    error.statusCode = 500;
    throw error;
  }

  const normalizedPath = path.startsWith("/")
    ? path
    : `/${path}`;

  const url = new URL(`${BASE_URL}${normalizedPath}`);

  for (const [key, value] of Object.entries(query)) {
    if (
      value !== undefined &&
      value !== null &&
      String(value).trim() !== ""
    ) {
      url.searchParams.set(key, String(value));
    }
  }

  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const requestHeaders = {
      Accept: "application/json, text/plain, */*",

      /*
       * This is the current assumed authorization format.
       * We may adjust it after seeing a 401 or 403 response.
       */
      Authorization: `Bearer ${TOKEN}`,

      ...headers,
    };

    if (body !== undefined) {
      requestHeaders["Content-Type"] = "application/json";
    }

    const response = await fetch(url, {
      method,
      headers: requestHeaders,
      signal: controller.signal,
      body:
        body === undefined
          ? undefined
          : JSON.stringify(body),
    });

    const data = await parseStayflexiResponse(response);

    if (!response.ok) {
      const error = new Error(
        `StayFlexi request failed with HTTP ${response.status}`
      );

      error.statusCode = 502;
      error.upstreamStatus = response.status;
      error.upstreamData = data;
      error.requestUrl = url.toString();

      throw error;
    }

    return {
      status: response.status,
      data,
      requestUrl: url.toString(),
    };
  } catch (error) {
    if (error.name === "AbortError") {
      const timeoutError = new Error(
        `StayFlexi request timed out after ${timeoutMs}ms`
      );

      timeoutError.statusCode = 504;
      throw timeoutError;
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fetch hotel calendar data.
 *
 * Public route receives:
 * YYYY-MM-DD
 *
 * StayFlexi receives:
 * DD-MM-YYYY
 */
export async function getRoomBookings({
  checkin,
  checkout,
  guests = 1,
} = {}) {
  if (!checkin) {
    const error = new Error(
      "Missing StayFlexi start date. Provide checkin or startDate."
    );

    error.statusCode = 400;
    throw error;
  }

  if (!checkout) {
    const error = new Error(
      "Missing StayFlexi end date. Provide checkout or endDate."
    );

    error.statusCode = 400;
    throw error;
  }

  const availabilityPath =
    process.env.STAYFLEXI_AVAILABILITY_PATH?.trim();

  if (!availabilityPath) {
    const error = new Error(
      "Missing STAYFLEXI_AVAILABILITY_PATH."
    );

    error.statusCode = 500;
    throw error;
  }

  const fromDate = convertToStayflexiDate(checkin);
  const toDate = convertToStayflexiDate(checkout);

  return stayflexiRequest(availabilityPath, {
    method: "GET",
    query: {
      hotelId: HOTEL_ID,
      hotel_id: HOTEL_ID,
      fromDate,
      toDate,
    },
  });
}

/**
 * Temporary compatibility export.
 *
 * This prevents older imports from crashing while the
 * integration is being rebuilt.
 */
export async function getRoomTypes() {
  const roomTypesPath =
    process.env.STAYFLEXI_ROOM_TYPES_PATH?.trim();

  if (!roomTypesPath) {
    const error = new Error(
      "Missing STAYFLEXI_ROOM_TYPES_PATH"
    );

    error.statusCode = 500;
    throw error;
  }

  return stayflexiRequest(roomTypesPath, {
    method: "GET",
    query: {
      hotelId: HOTEL_ID,
      hotel_id: HOTEL_ID,
    },
  });
}
