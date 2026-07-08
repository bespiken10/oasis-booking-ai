const BASE_URL = process.env.STAYFLEXI_BASE_URL || "https://api.stayflexi.com";
const HOTEL_ID = process.env.STAYFLEXI_HOTEL_ID;
const TOKEN = process.env.STAYFLEXI_TOKEN;

function requireConfig() {
  if (!HOTEL_ID) throw new Error("Missing STAYFLEXI_HOTEL_ID");
  if (!TOKEN) throw new Error("Missing STAYFLEXI_TOKEN. Use a rotated token, not an exposed one.");
}

export async function stayflexiGet(path, params = {}) {
  requireConfig();

  const url = new URL(`${BASE_URL}${path}`);
  url.searchParams.set("hotel_id", HOTEL_ID);
  url.searchParams.set("hotelId", HOTEL_ID);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  });

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: TOKEN,
      Accept: "application/json"
    }
  });

  const text = await response.text();
  let data;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    throw new Error(`StayFlexi ${response.status}: ${JSON.stringify(data)}`);
  }

  return data;
}

export function getRoomTypes() {
  return stayflexiGet("/api/v2/room/getAllRoomTypes/");
}

export function getBranding() {
  return stayflexiGet("/user/groupBranding", {
    hostUrl: "app.stayflexi.com"
  });
}
