const BASE_URL =
  process.env.STAYFLEXI_BASE_URL || "https://api.stayflexi.com";

const HOTEL_ID = process.env.STAYFLEXI_HOTEL_ID;
const TOKEN = process.env.STAYFLEXI_TOKEN;

function requireConfig() {
  if (!HOTEL_ID) {
    throw new Error("Missing STAYFLEXI_HOTEL_ID");
  }

  if (!TOKEN) {
    throw new Error(
      "Missing STAYFLEXI_TOKEN. Use a rotated token, not an exposed one."
    );
  }
}

async function parseStayflexiResponse(response) {
  const text = await response.text();
  let data;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    throw new Error(
      `StayFlexi ${response.status}: ${JSON.stringify(data)}`
    );
  }

  return data;
}

export async function stayflexiGet(path, params = {}) {
  requireConfig();

  const url = new URL(`${BASE_URL}${path}`);

  url.searchParams.set("hotel_id", HOTEL_ID);
  url.searchParams.set("hotelId", HOTEL_ID);

  Object.entries(params).forEach(([key, value]) => {
    if (
      value !== undefined &&
      value !== null &&
      value !== ""
    ) {
      url.searchParams.set(key, String(value));
    }
  });

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: TOKEN,
      Accept: "application/json"
    }
  });

  return parseStayflexiResponse(response);
}

export async function stayflexiPost(path, body = {}) {
  requireConfig();

  const url = new URL(`${BASE_URL}${path}`);

  url.searchParams.set("hotel_id", HOTEL_ID);
  url.searchParams.set("hotelId", HOTEL_ID);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: TOKEN,
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      ...body,
      hotelId: HOTEL_ID
    })
  });

  return parseStayflexiResponse(response);
}

export function getRoomTypes() {
  return stayflexiGet("/api/v2/room/getAllRoomTypes/");
}

export function getBranding() {
  return stayflexiGet("/user/groupBranding", {
    hostUrl: "app.stayflexi.com"
  });
}

export function getRoomBookings({
  startDate,
  numOfDays = 7,
  roomTypes = null,
  availableRooms = false,
  blockedRooms = false,
  bookedRooms = false,
  cleanRooms = false,
  clusterRooms = false,
  dirtyRooms = false
} = {}) {
  return stayflexiPost(
    "/core/api/v1/reservation/navigationGetRoomBookings",
    {
      roomIdsSort: true,
      startDate,
      numOfDays,
      roomTypes,
      availableRooms,
      blockedRooms,
      bookedRooms,
      cleanRooms,
      clusterRooms,
      dirtyRooms,
      viewType: "resourceTimelineWeek"
    }
  );
}
