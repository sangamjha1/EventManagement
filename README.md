# Seamless Event Management System

Build a centralized platform to automate event planning, registration, execution, and feedback, with rich analytics and engagement tracking for organizers.

## Tech Stack (Prompt-Aligned)
- Frontend: React (Vite scaffold included)
- Backend: Node.js + Express
- Database: SQLite (swap-ready for Postgres/MySQL)
- Analytics: Engagement, funnel, attendance, and NPS metrics

## Why It Wins Hackathons
- Complete end-to-end flow from discovery to post-event feedback
- Analytics depth for organizers and sponsors
- Scalable, API-first architecture with clean UX
- Security-first auth and role-based access

## Features
- Event discovery with search, category, and date filters
- Organizer onboarding, authentication, and event creation
- Registration flow with ticketing and capacity management
- Attendee check-in with QR-ready endpoints
- Seat fill progress and waitlist-ready logic
- Personalized reminders and email notifications
- Favorites and saved events for attendees
- Feedback collection with NPS-style scoring
- Organizer insights: registrations, conversions, no-shows, and engagement
- Admin dashboard for platform-wide monitoring
- CSV export for attendees and feedback
- Role-based access control for organizer and admin
- Audit-friendly activity tracking on key actions

## Setup
1. Install dependencies
```bash
npm install
```
2. Create env file
```bash
cp .env.example .env
```
3. Update secrets in `.env` (especially `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`)
4. Start app
```bash
npm run dev
```

Open: `http://localhost:4000`

Admin panel: `http://localhost:4000/admin`

## React Frontend (Optional)
The React client lives in `client/` and is wired to the existing API.

1. Install client dependencies
```bash
cd client
npm install
```
2. Configure API base URL (optional)
```bash
cp .env.example .env
```
3. Start the React dev server
```bash
npm run dev
```

The React app runs on `http://localhost:5173` and calls the API on `http://localhost:4000`.

## API Overview
- `POST /api/auth/signup` organizer signup
- `POST /api/auth/login` organizer login
- `POST /api/auth/admin/login` admin login
- `GET /api/events` list/search events
- `POST /api/events` create event (auth organizer/admin)
- `GET /api/events/mine` organizer events
- `GET /api/events/insights` organizer analytics
- `GET /api/events/:id/analytics` per-event analytics
- `GET /api/events/:id/export/registrations` export registrations CSV
- `GET /api/events/:id/export/feedback` export feedback CSV
- `POST /api/registrations` register attendee
- `GET /api/registrations/event/:eventId` organizer/admin attendees
- `PATCH /api/registrations/:registrationId/checkin` organizer/admin check-in
- `GET /api/admin/dashboard` admin dashboard data

## Security Notes
- JWT-based route protection
- Role-based authorization (`organizer`, `admin`)
- Hidden admin route and separate admin credentials
- Input validation on key endpoints

## Implementation Notes
- This repo ships with a server-rendered UI; the API-first backend is ready for a React client or SPA front-end swap.
