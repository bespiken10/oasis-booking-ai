import "dotenv/config";

const DEFAULT_BASE_URL = "https://api.stayflexi.com";
const DEFAULT_TIMEOUT_MS = 15000;

function getConfig() {
  return {
    baseUrl: String(
      process.env.STAYFLEXI_BASE_URL || DEFAULT_BASE_URL
    ).replace(/\/+$/, ""),

    hotelId: String(process.env.STAYFLEXI_HOTEL_ID || "").trim(),

    token: String(process.env.STAYFLEXI_TOKEN || "").trim(),

    availabilityPath: String(
      process.env.STAYFLEXI_AVAILABILITY_PATH ||
        "/room/getRoomBookings"
    ).trim(),

    timeoutMs:
      Number.parseInt(process.env.STAYFLEXI_TIMEOUT_MS || "", 10) ||
      DEFAULT_TIMEOUT_MS,
  };
}

function requireConfig() {
  const config = getConfig();

  if (!config.hotelId) {
    const error = new Error("Missing STAYFLEXI_HOTEL_ID");
    error.statusCode = 500;
    throw error;
  }

  if (!config.token) {
    const error = new Error("Missing STAYFLEXI_TOKEN");
    error.statusCode = 500;
    throw error;
  }

  return config;
}

function buildUrl(baseUrl, path, query = {}) {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${baseUrl}${cleanPath}`);

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  return url;
}

async function parseResponse(response) {
  const responseText = await response.text();

  if (!responseText) {
    return null;
  }

  try {
    return JSON.parse(responseText);
  } catch {
    return {
      raw: responseText,
    };
  }
}

function getUpstreamMessage(data, status) {
  if (!data) {
    return `StayFlexi returned HTTP ${status} with an empty response`;
  }

  if (typeof data === "string") {
    return data;
  }

  return (
    data.message ||
    data.error ||
    data.errorMessage ||
    data.detail ||
    `StayFlexi returned HTTP ${status}`
  );
}

export async function getRoomBookings({
  checkin,
  checkout,
  guests = 1,
} = {}) {
  const config = requireConfig();

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

  const url = buildUrl(config.baseUrl, config.availabilityPath, {
    hotel_id: config.hotelId,
    hotelId: config.hotelId,
    checkin,
    checkout,
    startDate: checkin,
    endDate: checkout,
    guests,
  });

  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, config.timeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${config.token}`,
        token: config.token,
        "x-access-token": config.token,
        hotel_id: config.hotelId,
        hotelId: config.hotelId,
      },
      signal: controller.signal,
    });

    const data = await parseResponse(response);

    if (!response.ok) {
      const error = new Error(
        getUpstreamMessage(data, response.status)
      );

      error.statusCode = 502;
      error.upstreamStatus = response.status;
      error.upstreamData = data;

      throw error;
    }

    return data;
  } catch (error) {
    if (error.name === "AbortError") {
      const timeoutError = new Error(
        `StayFlexi request timed out after ${config.timeoutMs}ms`
      );

      timeoutError.statusCode = 504;
      timeoutError.upstreamStatus = 504;

      throw timeoutError;
    }

    if (error.statusCode) {
      throw error;
    }

    const networkError = new Error(
      `StayFlexi network request failed: ${error.message}`
    );

    networkError.statusCode = 502;
    throw networkError;
  } finally {
    clearTimeout(timeout);
  }
}

function firstArray(...values) {
  for (const value of values) {
    if (Array.isArray(value)) {
      return value;
    }
  }

  return [];
}

function toBooleanAvailability(room) {
  if (typeof room.available === "boolean") {
    return room.available;
  }

  if (typeof room.isAvailable === "boolean") {
    return room.isAvailable;
  }

  const availableCount = Number(
    room.availableRooms ??
      room.availableRoomCount ??
      room.inventory ??
      room.roomsAvailable ??
      room.count ??
      room.quantity
  );

  if (Number.isFinite(availableCount)) {
    return availableCount > 0;
  }

  const status = String(
    room.status || room.availabilityStatus || ""
  )
    .trim()
    .toLowerCase();

  if (
    ["available", "open", "vacant", "true", "yes"].includes(status)
  ) {
    return true;
  }

  if (
    ["unavailable", "closed", "occupied", "false", "no"].includes(status)
  ) {
    return false;
  }

  return false;
}

export function normalizeStayflexiRooms(payload) {
  const rooms = firstArray(
    payload,
    payload?.rooms,
    payload?.data,
    payload?.data?.rooms,
    payload?.data?.roomBookings,
    payload?.roomBookings,
    payload?.result,
    payload?.result?.rooms,
    payload?.response,
    payload?.response?.rooms
  );

  return rooms.map((room, index) => {
    return {
      roomId: String(
        room.roomId ??
          room.room_id ??
          room.id ??
          room.inventoryId ??
          index + 1
      ),

      roomTypeId: String(
        room.roomTypeId ??
          room.room_type_id ??
          room.roomTypeID ??
          room.categoryId ??
          ""
      ),

      roomTypeName: String(
        room.roomTypeName ??
          room.room_type_name ??
          room.categoryName ??
          room.name ??
          ""
      ),

      roomTypeCode: String(
        room.roomTypeCode ??
          room.room_type_code ??
          room.code ??
          ""
      ),

      available: toBooleanAvailability(room),

      availableRooms:
        Number(
          room.availableRooms ??
            room.availableRoomCount ??
            room.inventory ??
            room.roomsAvailable
        ) || undefined,

      rate:
        Number(
          room.rate ??
            room.price ??
            room.roomRate ??
            room.baseRate
        ) || undefined,

      currency: String(
        room.currency ??
          room.currencyCode ??
          room.currency_code ??
          ""
      ) || undefined,
    };
  });
}
