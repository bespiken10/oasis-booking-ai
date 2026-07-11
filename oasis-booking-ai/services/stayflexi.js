const BASE_URL =
  process.env.STAYFLEXI_BASE_URL?.trim() ||
  "https://api.stayflexi.com";

const HOTEL_ID = process.env.STAYFLEXI_HOTEL_ID?.trim();
const TOKEN = process.env.STAYFLEXI_TOKEN?.trim();

/**
 * Returns safe configuration information.
 * It never returns the actual token.
 */
export function getStayflexiConfigStatus() {
  return {
    baseUrl: BASE_URL,
    hotelIdConfigured: Boolean(HOTEL_ID),
    tokenConfigured: Boolean(TOKEN),
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
 * Parse an upstream response safely.
 */
async function parseResponse(response) {
  const responseText = await response.text();

  if (!responseText) {
    return null;
  }

  try {
    return JSON.parse(responseText);
  } catch {
    return {
      rawResponse: responseText.slice(0, 1000),
    };
  }
}

/**
 * Base request helper for StayFlexi.
 *
 * Do not log TOKEN or request headers containing TOKEN.
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
    throw new Error("A valid StayFlexi API path is required");
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
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
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",

        /*
         * This authorization format may need adjustment after we inspect
         * the exact successful StayFlexi browser request.
         */
        Authorization: `Bearer ${TOKEN}`,

        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const data = await parseResponse(response);

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
 * Temporary diagnostic function.
 *
 * We will replace the endpoint path and query structure after confirming
 * the exact StayFlexi availability request.
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

  /*
   * Keep the endpoint configurable until its exact path is confirmed.
   */
  const availabilityPath =
    process.env.STAYFLEXI_AVAILABILITY_PATH?.trim();

  if (!availabilityPath) {
    const error = new Error(
      "Missing STAYFLEXI_AVAILABILITY_PATH. Configure the verified StayFlexi availability endpoint before making live requests."
    );

    error.statusCode = 500;
    throw error;
  }

  return stayflexiRequest(availabilityPath, {
    query: {
      hotel_id: HOTEL_ID,
      hotelId: HOTEL_ID,
      checkin,
      checkout,
      guests,
    },
  });
}

/**
 * Export retained because server.js previously attempted to import it.
 * This prevents the old “does not provide an export named getRoomTypes”
 * crash.
 */
export async function getRoomTypes() {
  const roomTypesPath = process.env.STAYFLEXI_ROOM_TYPES_PATH?.trim();

  if (!roomTypesPath) {
    const error = new Error(
      "Missing STAYFLEXI_ROOM_TYPES_PATH"
    );

    error.statusCode = 500;
    throw error;
  }

  return stayflexiRequest(roomTypesPath, {
    query: {
      hotel_id: HOTEL_ID,
      hotelId: HOTEL_ID,
    },
  });
}
