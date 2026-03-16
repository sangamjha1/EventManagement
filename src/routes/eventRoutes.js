const express = require("express");
const { all, get, run } = require("../config/db");
const { authenticate, authorize } = require("../middleware/auth");
const { nonEmpty, parsePositiveInt } = require("../utils/validators");

const router = express.Router();

function computeNps({ promoters = 0, detractors = 0, total = 0 }) {
  if (!total) {
    return 0;
  }
  return Math.round(((promoters - detractors) / total) * 100);
}

router.get("/", async (req, res) => {
  const { q = "", category = "all", date = "", mode = "all", status = "published" } = req.query;

  try {
    const params = [];
    let query = `
      SELECT
        e.*,
        u.name AS organizer_name,
        COUNT(DISTINCT r.id) AS registrations_count,
        ROUND(AVG(f.rating), 1) AS avg_rating,
        ROUND(AVG(f.nps_score), 1) AS avg_nps,
        COUNT(DISTINCT f.id) AS feedback_count
      FROM events e
      JOIN users u ON u.id = e.organizer_id
      LEFT JOIN registrations r ON r.event_id = e.id AND r.status != 'cancelled'
      LEFT JOIN feedbacks f ON f.event_id = e.id
      WHERE 1=1
    `;

    if (status !== "all") {
      query += " AND LOWER(e.status) = ?";
      params.push(status.toLowerCase());
    }

    if (q.trim()) {
      query += " AND (LOWER(e.title) LIKE ? OR LOWER(e.description) LIKE ? OR LOWER(e.location) LIKE ? OR LOWER(e.eligibility) LIKE ?)";
      const search = `%${q.trim().toLowerCase()}%`;
      params.push(search, search, search, search);
    }

    if (category !== "all") {
      query += " AND LOWER(e.category) = ?";
      params.push(category.toLowerCase());
    }

    if (mode !== "all") {
      query += " AND LOWER(e.mode) = ?";
      params.push(mode.toLowerCase());
    }

    if (date) {
      query += " AND e.event_date = ?";
      params.push(date);
    }

    query += " GROUP BY e.id ORDER BY e.event_date ASC, e.start_time ASC";

    const events = await all(query, params);
    return res.json({ events });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch events" });
  }
});

router.get("/featured", async (req, res) => {
  try {
    const events = await all(
      `
      SELECT e.*, u.name AS organizer_name,
             COUNT(r.id) AS registrations_count,
             ROUND(AVG(f.rating), 1) AS avg_rating,
             ROUND(AVG(f.nps_score), 1) AS avg_nps
      FROM events e
      JOIN users u ON u.id = e.organizer_id
      LEFT JOIN registrations r ON r.event_id = e.id AND r.status != 'cancelled'
      LEFT JOIN feedbacks f ON f.event_id = e.id
      WHERE e.status = 'published'
      GROUP BY e.id
      ORDER BY registrations_count DESC, e.event_date ASC
      LIMIT 6
      `
    );

    return res.json({ events });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch featured events" });
  }
});

router.post("/", authenticate, authorize("organizer", "admin"), async (req, res) => {
  const {
    title,
    description,
    category,
    location,
    eventDate,
    startTime,
    endTime,
    capacity,
    bannerUrl,
    mode,
    fee,
    prizePool,
    eligibility,
    registrationDeadline,
    difficulty,
    maxTeamSize,
    status,
  } = req.body;

  if (
    !nonEmpty(title) ||
    !nonEmpty(description) ||
    !nonEmpty(category) ||
    !nonEmpty(location) ||
    !nonEmpty(eventDate) ||
    !nonEmpty(startTime) ||
    !nonEmpty(endTime) ||
    !parsePositiveInt(capacity)
  ) {
    return res.status(400).json({ error: "All required event fields are missing" });
  }

  try {
    const result = await run(
      `INSERT INTO events
        (organizer_id, title, description, category, location, event_date, start_time, end_time, capacity,
         banner_url, mode, fee, prize_pool, eligibility, registration_deadline, difficulty, max_team_size, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.id,
        title.trim(),
        description.trim(),
        category.trim(),
        location.trim(),
        eventDate,
        startTime,
        endTime,
        parsePositiveInt(capacity),
        bannerUrl || null,
        nonEmpty(mode) ? mode.trim() : "Offline",
        Number.isFinite(Number(fee)) ? Number(fee) : 0,
        nonEmpty(prizePool) ? prizePool.trim() : "Certificate + Recognition",
        nonEmpty(eligibility) ? eligibility.trim() : "Open to all students and professionals",
        registrationDeadline || null,
        nonEmpty(difficulty) ? difficulty.trim() : "Intermediate",
        parsePositiveInt(maxTeamSize) || 1,
        nonEmpty(status) ? status.trim().toLowerCase() : "published",
      ]
    );

    const event = await get("SELECT * FROM events WHERE id = ?", [result.lastID]);
    return res.status(201).json({ event });
  } catch (error) {
    return res.status(500).json({ error: "Failed to create event" });
  }
});

router.get("/mine", authenticate, authorize("organizer", "admin"), async (req, res) => {
  try {
    const events = await all(
      `
      SELECT
        e.*,
        COUNT(r.id) AS registrations_count,
        ROUND(AVG(f.rating), 1) AS avg_rating,
        ROUND(AVG(f.nps_score), 1) AS avg_nps,
        COUNT(DISTINCT f.id) AS feedback_count
      FROM events e
      LEFT JOIN registrations r ON r.event_id = e.id AND r.status != 'cancelled'
      LEFT JOIN feedbacks f ON f.event_id = e.id
      WHERE e.organizer_id = ?
      GROUP BY e.id
      ORDER BY e.created_at DESC
      `,
      [req.user.id]
    );

    return res.json({ events });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch your events" });
  }
});

router.get("/insights", authenticate, authorize("organizer", "admin"), async (req, res) => {
  try {
    const metrics = await get(
      `
      SELECT
        COUNT(DISTINCT e.id) AS total_events,
        COUNT(r.id) AS total_registrations,
        SUM(CASE WHEN r.status = 'checked-in' THEN 1 ELSE 0 END) AS total_checkins,
        ROUND(AVG(f.rating), 2) AS avg_rating,
        ROUND(AVG(f.nps_score), 1) AS avg_nps
      FROM events e
      LEFT JOIN registrations r ON r.event_id = e.id
      LEFT JOIN feedbacks f ON f.event_id = e.id
      WHERE e.organizer_id = ?
      `,
      [req.user.id]
    );

    const byEvent = await all(
      `
      SELECT
        e.id,
        e.title,
        e.capacity,
        e.status,
        COUNT(r.id) AS registrations,
        SUM(CASE WHEN r.status = 'checked-in' THEN 1 ELSE 0 END) AS checkins,
        ROUND(AVG(f.rating), 1) AS avg_rating,
        ROUND(AVG(f.nps_score), 1) AS avg_nps
      FROM events e
      LEFT JOIN registrations r ON r.event_id = e.id AND r.status != 'cancelled'
      LEFT JOIN feedbacks f ON f.event_id = e.id
      WHERE e.organizer_id = ?
      GROUP BY e.id
      ORDER BY e.event_date ASC
      `,
      [req.user.id]
    );

    const npsCounts = await get(
      `
      SELECT
        SUM(CASE WHEN f.nps_score >= 9 THEN 1 ELSE 0 END) AS promoters,
        SUM(CASE WHEN f.nps_score BETWEEN 0 AND 6 THEN 1 ELSE 0 END) AS detractors,
        COUNT(f.nps_score) AS total
      FROM events e
      LEFT JOIN feedbacks f ON f.event_id = e.id
      WHERE e.organizer_id = ?
      `,
      [req.user.id]
    );

    return res.json({
      metrics: {
        totalEvents: metrics.total_events || 0,
        totalRegistrations: metrics.total_registrations || 0,
        totalCheckins: metrics.total_checkins || 0,
        avgRating: metrics.avg_rating || 0,
        avgNps: metrics.avg_nps || 0,
        npsScore: computeNps(npsCounts || {}),
      },
      byEvent,
    });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch insights" });
  }
});

router.patch("/:id/status", authenticate, authorize("organizer", "admin"), async (req, res) => {
  const { status } = req.body;
  const id = req.params.id;

  if (!["published", "draft", "closed"].includes(String(status || "").toLowerCase())) {
    return res.status(400).json({ error: "Status must be published, draft, or closed" });
  }

  try {
    const event = await get("SELECT organizer_id FROM events WHERE id = ?", [id]);
    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }

    if (req.user.role !== "admin" && event.organizer_id !== req.user.id) {
      return res.status(403).json({ error: "Not allowed" });
    }

    await run("UPDATE events SET status = ? WHERE id = ?", [status.toLowerCase(), id]);
    return res.json({ message: "Event status updated" });
  } catch (error) {
    return res.status(500).json({ error: "Failed to update status" });
  }
});

router.post("/:id/feedback", async (req, res) => {
  const { attendeeEmail, rating, comment, npsScore } = req.body;
  const id = req.params.id;

  if (!nonEmpty(attendeeEmail) || !Number.isInteger(Number(rating)) || Number(rating) < 1 || Number(rating) > 5) {
    return res.status(400).json({ error: "Valid email and rating (1-5) are required" });
  }

  if (npsScore !== undefined && (Number(npsScore) < 0 || Number(npsScore) > 10)) {
    return res.status(400).json({ error: "NPS score must be between 0 and 10" });
  }

  try {
    const event = await get("SELECT id FROM events WHERE id = ?", [id]);
    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }

    await run(
      `INSERT INTO feedbacks (event_id, attendee_email, rating, nps_score, comment)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(event_id, attendee_email) DO UPDATE SET rating=excluded.rating, nps_score=excluded.nps_score, comment=excluded.comment`,
      [
        id,
        attendeeEmail.toLowerCase(),
        Number(rating),
        npsScore === undefined || npsScore === null ? null : Number(npsScore),
        comment || null,
      ]
    );

    return res.status(201).json({ message: "Feedback submitted" });
  } catch (error) {
    return res.status(500).json({ error: "Failed to save feedback" });
  }
});

router.get("/:id", async (req, res) => {
  const id = req.params.id;

  try {
    const event = await get(
      `
      SELECT e.*, u.name AS organizer_name,
             COUNT(DISTINCT r.id) AS registrations_count,
             ROUND(AVG(f.rating), 1) AS avg_rating,
             ROUND(AVG(f.nps_score), 1) AS avg_nps,
             COUNT(DISTINCT f.id) AS feedback_count
      FROM events e
      JOIN users u ON u.id = e.organizer_id
      LEFT JOIN registrations r ON r.event_id = e.id AND r.status != 'cancelled'
      LEFT JOIN feedbacks f ON f.event_id = e.id
      WHERE e.id = ?
      GROUP BY e.id
      `,
      [id]
    );

    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }

    const feedbacks = await all(
      `
      SELECT attendee_email, rating, nps_score, comment, created_at
      FROM feedbacks
      WHERE event_id = ?
      ORDER BY created_at DESC
      LIMIT 20
      `,
      [id]
    );

    const npsCounts = await get(
      `
      SELECT
        SUM(CASE WHEN nps_score >= 9 THEN 1 ELSE 0 END) AS promoters,
        SUM(CASE WHEN nps_score BETWEEN 0 AND 6 THEN 1 ELSE 0 END) AS detractors,
        COUNT(nps_score) AS total
      FROM feedbacks
      WHERE event_id = ?
      `,
      [id]
    );

    return res.json({
      event,
      feedbacks,
      nps: {
        score: computeNps(npsCounts || {}),
        total: npsCounts?.total || 0,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch event" });
  }
});

router.get("/:id/analytics", authenticate, authorize("organizer", "admin"), async (req, res) => {
  const id = req.params.id;

  try {
    const event = await get("SELECT id, organizer_id, title, capacity FROM events WHERE id = ?", [id]);
    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }

    if (req.user.role !== "admin" && event.organizer_id !== req.user.id) {
      return res.status(403).json({ error: "Not allowed" });
    }

    const totals = await get(
      `
      SELECT
        COUNT(r.id) AS registrations,
        SUM(CASE WHEN r.status = 'checked-in' THEN 1 ELSE 0 END) AS checkins,
        ROUND(AVG(f.rating), 2) AS avg_rating,
        ROUND(AVG(f.nps_score), 1) AS avg_nps
      FROM events e
      LEFT JOIN registrations r ON r.event_id = e.id AND r.status != 'cancelled'
      LEFT JOIN feedbacks f ON f.event_id = e.id
      WHERE e.id = ?
      `,
      [id]
    );

    const byDay = await all(
      `
      SELECT DATE(created_at) AS day, COUNT(*) AS registrations
      FROM registrations
      WHERE event_id = ?
      GROUP BY DATE(created_at)
      ORDER BY DATE(created_at) ASC
      `,
      [id]
    );

    const npsCounts = await get(
      `
      SELECT
        SUM(CASE WHEN nps_score >= 9 THEN 1 ELSE 0 END) AS promoters,
        SUM(CASE WHEN nps_score BETWEEN 0 AND 6 THEN 1 ELSE 0 END) AS detractors,
        COUNT(nps_score) AS total
      FROM feedbacks
      WHERE event_id = ?
      `,
      [id]
    );

    return res.json({
      event,
      totals: {
        registrations: totals.registrations || 0,
        checkins: totals.checkins || 0,
        capacity: event.capacity,
        avgRating: totals.avg_rating || 0,
        avgNps: totals.avg_nps || 0,
        npsScore: computeNps(npsCounts || {}),
      },
      byDay,
    });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch analytics" });
  }
});

router.get("/:id/export/registrations", authenticate, authorize("organizer", "admin"), async (req, res) => {
  const id = req.params.id;

  try {
    const event = await get("SELECT id, organizer_id, title FROM events WHERE id = ?", [id]);
    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }

    if (req.user.role !== "admin" && event.organizer_id !== req.user.id) {
      return res.status(403).json({ error: "Not allowed" });
    }

    const rows = await all(
      `
      SELECT attendee_name, attendee_email, attendee_phone, team_name, team_size, institute, role, status, created_at
      FROM registrations
      WHERE event_id = ?
      ORDER BY created_at DESC
      `,
      [id]
    );

    const header = [
      "attendee_name",
      "attendee_email",
      "attendee_phone",
      "team_name",
      "team_size",
      "institute",
      "role",
      "status",
      "created_at",
    ];
    const csvRows = [
      header.join(","),
      ...rows.map((row) =>
        header
          .map((key) => `"${String(row[key] ?? "").replace(/"/g, '""')}"`)
          .join(",")
      ),
    ];

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="event-${id}-registrations.csv"`);
    return res.send(csvRows.join("\n"));
  } catch (error) {
    return res.status(500).json({ error: "Failed to export registrations" });
  }
});

router.get("/:id/export/feedback", authenticate, authorize("organizer", "admin"), async (req, res) => {
  const id = req.params.id;

  try {
    const event = await get("SELECT id, organizer_id, title FROM events WHERE id = ?", [id]);
    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }

    if (req.user.role !== "admin" && event.organizer_id !== req.user.id) {
      return res.status(403).json({ error: "Not allowed" });
    }

    const rows = await all(
      `
      SELECT attendee_email, rating, nps_score, comment, created_at
      FROM feedbacks
      WHERE event_id = ?
      ORDER BY created_at DESC
      `,
      [id]
    );

    const header = ["attendee_email", "rating", "nps_score", "comment", "created_at"];
    const csvRows = [
      header.join(","),
      ...rows.map((row) =>
        header
          .map((key) => `"${String(row[key] ?? "").replace(/"/g, '""')}"`)
          .join(",")
      ),
    ];

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="event-${id}-feedback.csv"`);
    return res.send(csvRows.join("\n"));
  } catch (error) {
    return res.status(500).json({ error: "Failed to export feedback" });
  }
});

module.exports = router;
