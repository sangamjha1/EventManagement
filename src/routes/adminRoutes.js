const express = require("express");
const { all, get } = require("../config/db");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

router.get("/dashboard", authenticate, authorize("admin"), async (req, res) => {
  try {
    const totals = await get(
      `
      SELECT
        (SELECT COUNT(*) FROM users WHERE role = 'organizer') AS organizers,
        (SELECT COUNT(*) FROM users WHERE role = 'admin') AS admins,
        (SELECT COUNT(*) FROM events) AS events,
        (SELECT COUNT(*) FROM registrations) AS registrations,
        (SELECT COUNT(*) FROM registrations WHERE status = 'checked-in') AS checkins,
        (SELECT ROUND(AVG(rating), 2) FROM feedbacks) AS avg_rating,
        (SELECT ROUND(AVG(nps_score), 1) FROM feedbacks) AS avg_nps
      `
    );

    const npsCounts = await get(
      `
      SELECT
        SUM(CASE WHEN nps_score >= 9 THEN 1 ELSE 0 END) AS promoters,
        SUM(CASE WHEN nps_score BETWEEN 0 AND 6 THEN 1 ELSE 0 END) AS detractors,
        COUNT(nps_score) AS total
      FROM feedbacks
      `
    );

    const recentEvents = await all(
      `
      SELECT e.id, e.title, e.category, e.location, e.event_date, e.status, e.mode, u.name AS organizer_name,
             COUNT(r.id) AS registrations_count,
             ROUND(AVG(f.rating), 1) AS avg_rating
      FROM events e
      JOIN users u ON u.id = e.organizer_id
      LEFT JOIN registrations r ON r.event_id = e.id AND r.status != 'cancelled'
      LEFT JOIN feedbacks f ON f.event_id = e.id
      GROUP BY e.id
      ORDER BY e.created_at DESC
      LIMIT 10
      `
    );

    const recentRegistrations = await all(
      `
      SELECT r.id, r.attendee_name, r.attendee_email, r.status, r.created_at, e.title AS event_title, r.team_size
      FROM registrations r
      JOIN events e ON e.id = r.event_id
      ORDER BY r.created_at DESC
      LIMIT 12
      `
    );

    const categoryStats = await all(
      `
      SELECT category, COUNT(*) AS count
      FROM events
      GROUP BY category
      ORDER BY count DESC
      LIMIT 8
      `
    );

    const statusStats = await all(
      `
      SELECT status, COUNT(*) AS count
      FROM events
      GROUP BY status
      `
    );

    const topOrganizers = await all(
      `
      SELECT u.name, u.email,
             COUNT(DISTINCT e.id) AS events_count,
             COUNT(r.id) AS registrations_count
      FROM users u
      LEFT JOIN events e ON e.organizer_id = u.id
      LEFT JOIN registrations r ON r.event_id = e.id AND r.status != 'cancelled'
      WHERE u.role = 'organizer'
      GROUP BY u.id
      ORDER BY registrations_count DESC, events_count DESC
      LIMIT 8
      `
    );

    const totalNps = npsCounts?.total || 0;
    const npsScore = totalNps
      ? Math.round(((npsCounts.promoters - npsCounts.detractors) / totalNps) * 100)
      : 0;

    return res.json({
      totals: {
        ...totals,
        nps_score: npsScore,
      },
      recentEvents,
      recentRegistrations,
      categoryStats,
      statusStats,
      topOrganizers,
    });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch admin dashboard" });
  }
});

module.exports = router;
