const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcryptjs");

const DB_PATH = "event_management.db";
const db = new sqlite3.Database(DB_PATH);

function run(query, params = []) {
  return new Promise((resolve, reject) => {
    db.run(query, params, function onRun(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve(this);
    });
  });
}

function get(query, params = []) {
  return new Promise((resolve, reject) => {
    db.get(query, params, (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(row);
    });
  });
}

function all(query, params = []) {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows);
    });
  });
}

async function ensureColumn(table, column, definition) {
  const cols = await all(`PRAGMA table_info(${table})`);
  const exists = cols.some((c) => c.name === column);
  if (!exists) {
    await run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

async function migrateUsersTableIfNeeded() {
  const table = await get("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'");
  if (!table || !table.sql) {
    return;
  }

  const needsRoleUpdate = !table.sql.includes("'participant'");
  const needsCompositeUnique = table.sql.includes("email TEXT NOT NULL UNIQUE");

  if (!needsRoleUpdate && !needsCompositeUnique) {
    return;
  }

  await run(`
    CREATE TABLE IF NOT EXISTS users_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('participant', 'organizer', 'admin')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(email, role)
    )
  `);

  await run(`
    INSERT INTO users_new (id, name, email, password_hash, role, created_at)
    SELECT id, name, email, password_hash, role, created_at
    FROM users
  `);

  await run("DROP TABLE users");
  await run("ALTER TABLE users_new RENAME TO users");
}

async function initializeDb() {
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('participant', 'organizer', 'admin')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(email, role)
    )
  `);
  await migrateUsersTableIfNeeded();
  await ensureColumn("users", "is_verified", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn("users", "email_verification_token", "TEXT");
  await ensureColumn("users", "email_verification_expires", "TEXT");
  await ensureColumn("users", "password_reset_token", "TEXT");
  await ensureColumn("users", "password_reset_expires", "TEXT");
  await ensureColumn("users", "phone", "TEXT");
  await ensureColumn("users", "institution", "TEXT");
  await ensureColumn("users", "city", "TEXT");
  await ensureColumn("users", "country", "TEXT");
  await ensureColumn("users", "linkedin", "TEXT");
  await ensureColumn("users", "company_name", "TEXT");
  await ensureColumn("users", "company_website", "TEXT");
  await ensureColumn("users", "designation", "TEXT");

  await run(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organizer_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      location TEXT NOT NULL,
      event_date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      capacity INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (organizer_id) REFERENCES users(id)
    )
  `);

  await ensureColumn("events", "banner_url", "TEXT");
  await ensureColumn("events", "mode", "TEXT NOT NULL DEFAULT 'Offline'");
  await ensureColumn("events", "fee", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn("events", "prize_pool", "TEXT NOT NULL DEFAULT 'Certificate + Recognition'");
  await ensureColumn("events", "eligibility", "TEXT NOT NULL DEFAULT 'Open to all students and professionals'");
  await ensureColumn("events", "registration_deadline", "TEXT");
  await ensureColumn("events", "difficulty", "TEXT NOT NULL DEFAULT 'Intermediate'");
  await ensureColumn("events", "max_team_size", "INTEGER NOT NULL DEFAULT 1");
  await ensureColumn("events", "status", "TEXT NOT NULL DEFAULT 'published'");

  await run(`
    CREATE TABLE IF NOT EXISTS registrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL,
      attendee_name TEXT NOT NULL,
      attendee_email TEXT NOT NULL,
      attendee_phone TEXT,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'confirmed' CHECK(status IN ('confirmed', 'checked-in', 'cancelled')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (event_id) REFERENCES events(id),
      UNIQUE(event_id, attendee_email)
    )
  `);

  await ensureColumn("registrations", "team_name", "TEXT");
  await ensureColumn("registrations", "team_size", "INTEGER NOT NULL DEFAULT 1");
  await ensureColumn("registrations", "institute", "TEXT");
  await ensureColumn("registrations", "role", "TEXT");

  await run(`
    CREATE TABLE IF NOT EXISTS feedbacks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL,
      attendee_email TEXT NOT NULL,
      rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
      nps_score INTEGER CHECK(nps_score >= 0 AND nps_score <= 10),
      comment TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (event_id) REFERENCES events(id),
      UNIQUE(event_id, attendee_email)
    )
  `);
  await ensureColumn("feedbacks", "nps_score", "INTEGER CHECK(nps_score >= 0 AND nps_score <= 10)");

  await seedAdmin();
  await seedDemoData();
}

async function seedAdmin() {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    return;
  }

  const existing = await get("SELECT id FROM users WHERE email = ?", [adminEmail]);
  if (existing) {
    return;
  }

  const passwordHash = await bcrypt.hash(adminPassword, 10);
  await run(
    "INSERT INTO users (name, email, password_hash, role, is_verified) VALUES (?, ?, ?, 'admin', 1)",
    ["Platform Admin", adminEmail, passwordHash]
  );
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy.toISOString().slice(0, 10);
}

async function seedDemoData() {
  const existingEvents = await get("SELECT COUNT(*) AS count FROM events");
  if (existingEvents && existingEvents.count > 0) {
    return;
  }

  const organizerEmail = "organizer.demo@eventflow.local";
  let organizer = await get("SELECT id FROM users WHERE email = ?", [organizerEmail]);

  if (!organizer) {
    const passwordHash = await bcrypt.hash("Organizer@123", 10);
    const created = await run(
      "INSERT INTO users (name, email, password_hash, role, is_verified, company_name, designation) VALUES (?, ?, ?, 'organizer', 1, ?, ?)",
      ["Demo Organizer", organizerEmail, passwordHash, "EventFlow Labs", "Community Lead"]
    );
    organizer = { id: created.lastID };
  }

  const today = new Date();
  const events = [
    {
      title: "National AI Innovation Hackathon 2026",
      description:
        "Build practical AI solutions for healthcare, education, and finance with mentor support and final jury demo day.",
      category: "Hackathon",
      location: "Bengaluru",
      eventDate: addDays(today, 12),
      startTime: "09:30",
      endTime: "18:00",
      capacity: 450,
      bannerUrl: "https://images.unsplash.com/photo-1517048676732-d65bc937f952",
      mode: "Hybrid",
      fee: 0,
      prizePool: "INR 2,50,000 + Incubation",
      eligibility: "UG/PG students, early-stage founders",
      registrationDeadline: addDays(today, 9),
      difficulty: "Advanced",
      maxTeamSize: 4,
      status: "published",
    },
    {
      title: "Product Sprint: Build & Ship in 48 Hours",
      description:
        "A fast-paced product building sprint focused on MVP execution, user testing, and presentation storytelling.",
      category: "Workshop",
      location: "Pune",
      eventDate: addDays(today, 6),
      startTime: "10:00",
      endTime: "20:00",
      capacity: 180,
      bannerUrl: "https://images.unsplash.com/photo-1552664730-d307ca884978",
      mode: "Offline",
      fee: 499,
      prizePool: "Top 3 get hiring referrals",
      eligibility: "Students and fresh graduates",
      registrationDeadline: addDays(today, 4),
      difficulty: "Intermediate",
      maxTeamSize: 3,
      status: "published",
    },
    {
      title: "Campus to Career Tech Summit",
      description:
        "Panel talks by senior engineers and recruiters on portfolio strategy, interviews, and long-term growth.",
      category: "Conference",
      location: "Delhi",
      eventDate: addDays(today, 20),
      startTime: "11:00",
      endTime: "17:30",
      capacity: 600,
      bannerUrl: "https://images.unsplash.com/photo-1540317580384-e5d43867caa6",
      mode: "Offline",
      fee: 0,
      prizePool: "Certificates + networking access",
      eligibility: "All streams",
      registrationDeadline: addDays(today, 17),
      difficulty: "Beginner",
      maxTeamSize: 1,
      status: "published",
    },
    {
      title: "Data Storytelling Challenge",
      description:
        "Analyze a real public dataset and present insights with visual storytelling and actionable recommendations.",
      category: "Case Study",
      location: "Online",
      eventDate: addDays(today, 15),
      startTime: "14:00",
      endTime: "19:00",
      capacity: 300,
      bannerUrl: "https://images.unsplash.com/photo-1551281044-8c0b0b0b0b0b",
      mode: "Online",
      fee: 199,
      prizePool: "INR 75,000",
      eligibility: "Students and analysts",
      registrationDeadline: addDays(today, 13),
      difficulty: "Intermediate",
      maxTeamSize: 2,
      status: "published",
    },
    {
      title: "Web3 Builders League",
      description:
        "Create decentralized apps and smart-contract prototypes with mentor clinics and investor office hours.",
      category: "Hackathon",
      location: "Hyderabad",
      eventDate: addDays(today, 28),
      startTime: "09:00",
      endTime: "21:00",
      capacity: 320,
      bannerUrl: "https://images.unsplash.com/photo-1639762681485-074b7f938ba0",
      mode: "Hybrid",
      fee: 0,
      prizePool: "INR 1,20,000 + Grants",
      eligibility: "Developers and designers",
      registrationDeadline: addDays(today, 24),
      difficulty: "Advanced",
      maxTeamSize: 5,
      status: "published",
    },
    {
      title: "Design Jam: UX for Social Impact",
      description:
        "A design-first challenge to prototype usable solutions for accessibility, civic tech, and education.",
      category: "Workshop",
      location: "Chennai",
      eventDate: addDays(today, 10),
      startTime: "10:30",
      endTime: "17:00",
      capacity: 140,
      bannerUrl: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4",
      mode: "Offline",
      fee: 299,
      prizePool: "Internship interview track",
      eligibility: "UI/UX students and professionals",
      registrationDeadline: addDays(today, 8),
      difficulty: "Beginner",
      maxTeamSize: 3,
      status: "published",
    },
  ];

  const createdEventIds = [];
  for (const event of events) {
    const result = await run(
      `INSERT INTO events
        (organizer_id, title, description, category, location, event_date, start_time, end_time, capacity,
         banner_url, mode, fee, prize_pool, eligibility, registration_deadline, difficulty, max_team_size, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        organizer.id,
        event.title,
        event.description,
        event.category,
        event.location,
        event.eventDate,
        event.startTime,
        event.endTime,
        event.capacity,
        event.bannerUrl,
        event.mode,
        event.fee,
        event.prizePool,
        event.eligibility,
        event.registrationDeadline,
        event.difficulty,
        event.maxTeamSize,
        event.status,
      ]
    );
    createdEventIds.push(result.lastID);
  }

  const applicants = [
    { name: "Aarav Mehta", email: "aarav.m@example.com", team: "ByteForce", size: 3, institute: "IIT Delhi", role: "Developer" },
    { name: "Diya Kapoor", email: "diya.k@example.com", team: "UI Ninjas", size: 2, institute: "NID", role: "Designer" },
    { name: "Rohan Das", email: "rohan.d@example.com", team: "DataMonks", size: 2, institute: "BITS Pilani", role: "Analyst" },
    { name: "Sneha Iyer", email: "sneha.i@example.com", team: "ProtoLabs", size: 4, institute: "VIT", role: "Product" },
    { name: "Kabir Jain", email: "kabir.j@example.com", team: "ChainOps", size: 3, institute: "IIIT Hyderabad", role: "Developer" },
  ];

  for (const eventId of createdEventIds) {
    for (const applicant of applicants) {
      const tag = `${eventId}.${applicant.email}`;
      await run(
        `INSERT INTO registrations
          (event_id, attendee_name, attendee_email, attendee_phone, notes, status, team_name, team_size, institute, role)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          eventId,
          applicant.name,
          `event${tag}`,
          "+91-9999999999",
          "Excited to participate.",
          Math.random() > 0.6 ? "checked-in" : "confirmed",
          applicant.team,
          applicant.size,
          applicant.institute,
          applicant.role,
        ]
      );
    }
  }

  for (const eventId of createdEventIds) {
    await run(
      "INSERT OR IGNORE INTO feedbacks (event_id, attendee_email, rating, nps_score, comment) VALUES (?, ?, ?, ?, ?)",
      [eventId, `event${eventId}.aarav.m@example.com`, 5, 10, "Excellent structure and mentoring support."]
    );
    await run(
      "INSERT OR IGNORE INTO feedbacks (event_id, attendee_email, rating, nps_score, comment) VALUES (?, ?, ?, ?, ?)",
      [eventId, `event${eventId}.diya.k@example.com`, 4, 8, "Great event experience and smooth coordination."]
    );
  }
}

module.exports = {
  db,
  run,
  get,
  all,
  initializeDb,
};
