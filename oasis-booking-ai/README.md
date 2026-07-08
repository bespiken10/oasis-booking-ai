# Oasis Booking AI

AI booking backend for Oasis Executive Suites.

## Purpose

This backend connects:

- WhatsApp / DoubleTick
- AI booking assistant
- StayFlexi API
- Escalation to hotel manager

## Setup

```bash
npm install
cp .env.example .env
npm run dev
```

## Important Security Note

Do not commit `.env` or real StayFlexi tokens to GitHub.
Rotate any token that has been pasted into chat or shared publicly.

## Current Connected Endpoint

```text
GET /api/v2/room/getAllRoomTypes/
```

## Local Test URLs

```text
http://localhost:3000/health
http://localhost:3000/room-types
http://localhost:3000/availability?checkin=2026-07-10&checkout=2026-07-11&guests=2
```
