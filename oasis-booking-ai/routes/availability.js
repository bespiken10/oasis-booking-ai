const requestedRoomType = String(roomType || "")
  .trim()
  .toLowerCase();

const filteredRooms = roomType
  ? rooms.filter((room) => {
      return (
        String(room.roomTypeId || "").trim().toLowerCase() ===
          requestedRoomType ||
        String(room.roomTypeName || "").trim().toLowerCase() ===
          requestedRoomType ||
        String(room.roomTypeCode || "").trim().toLowerCase() ===
          requestedRoomType
      );
    })
  : rooms;
