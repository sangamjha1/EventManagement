const express = require("express");
const { all, get, run } = require("../config/db");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

router.post("/", authenticate, authorize("participant"), async (req, res) => {
  const {
    eventId,
    attendeePhone,
    notes,
    teamName,
    teamSize,
    institute,
    role,
  } = req.body;

  if (!eventId) {
    return res.status(400).json({ error: "Valid event is required" });
  }

  try {
    const event = await get("SELECT id, capacity, max_team_size, status FROM events WHERE id = ?", [eventId]);
    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }

    if (event.status !== "published") {
      return res.status(409).json({ error: "Registrations are closed for this event" });
    }

    const capacity = await get(
      "SELECT COUNT(id) AS count FROM registrations WHERE event_id = ? AND status != 'cancelled'",
      [eventId]
    );

    if (capacity.count >= event.capacity) {
      return res.status(409).json({ error: "Event is full" });
    }

    const parsedTeamSize = Math.max(1, Number(teamSize || 1));
    if (parsedTeamSize > Number(event.max_team_size || 1)) {
      return res.status(400).json({ error: `Team size cannot exceed ${event.max_team_size}` });
    }

    const user = await get("SELECT name, email, phone, institution FROM users WHERE id = ?", [req.user.id]);
    if (!user) {
      return res.status(401).json({ error: "Participant profile not found" });
    }

    await run(
      `INSERT INTO registrations
        (event_id, attendee_name, attendee_email, attendee_phone, notes, team_name, team_size, institute, role)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        eventId,
        user.name,
        user.email.toLowerCase(),
        attendeePhone || user.phone || null,
        notes || null,
        teamName || null,
        parsedTeamSize,
        institute || user.institution || null,
        role || null,
      ]
    );

    return res.status(201).json({ message: "Registration confirmed" });
  } catch (error) {
    if (String(error.message).includes("UNIQUE")) {
      return res.status(409).json({ error: "You are already registered for this event" });
    }
    return res.status(500).json({ error: "Failed to register" });
  }
});

router.get("/my", authenticate, authorize("participant"), async (req, res) => {
  try {
    const registrations = await all(
      `
      SELECT r.id, r.status, r.created_at, r.team_name, r.team_size, r.institute,
             e.id AS event_id, e.title, e.category, e.event_date, e.start_time, e.end_time, e.location, e.mode
      FROM registrations r
      JOIN events e ON e.id = r.event_id
      WHERE r.attendee_email = ?
      ORDER BY r.created_at DESC
      `,
      [req.user.email.toLowerCase()]
    );

    return res.json({ registrations });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch your registrations" });
  }
});

router.patch("/:registrationId/checkin", authenticate, authorize("organizer", "admin"), async (req, res) => {
  const registrationId = req.params.registrationId;

  try {
    const registration = await get(
      `
      SELECT r.id, e.organizer_id
      FROM registrations r
      JOIN events e ON e.id = r.event_id
      WHERE r.id = ?
      `,
      [registrationId]
    );

    if (!registration) {
      return res.status(404).json({ error: "Registration not found" });
    }

    if (req.user.role !== "admin" && registration.organizer_id !== req.user.id) {
      return res.status(403).json({ error: "Not allowed" });
    }

    await run("UPDATE registrations SET status = 'checked-in' WHERE id = ?", [registrationId]);
    return res.json({ message: "Attendee checked in" });
  } catch (error) {
    return res.status(500).json({ error: "Failed to update check-in" });
  }
});

router.get("/event/:eventId", authenticate, authorize("organizer", "admin"), async (req, res) => {
  const eventId = req.params.eventId;

  try {
    const event = await get("SELECT id, organizer_id FROM events WHERE id = ?", [eventId]);
    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }

    if (req.user.role !== "admin" && event.organizer_id !== req.user.id) {
      return res.status(403).json({ error: "Not allowed" });
    }

    const registrations = await all(
      `
      SELECT id, attendee_name, attendee_email, attendee_phone, notes, status, team_name, team_size, institute, role, created_at
      FROM registrations
      WHERE event_id = ?
      ORDER BY created_at DESC
      `,
      [eventId]
    );

    return res.json({ registrations });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch registrations" });
  }
});

module.exports = router;
