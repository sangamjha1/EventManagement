require("dotenv").config();

const express = require("express");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const path = require("path");
const cookieParser = require("cookie-parser");
const { initializeDb, get, run } = require("./config/db");
const { nonEmpty } = require("./utils/validators");

const authRoutes = require("./routes/authRoutes");
const eventRoutes = require("./routes/eventRoutes");
const registrationRoutes = require("./routes/registrationRoutes");
const adminRoutes = require("./routes/adminRoutes");

const app = express();
const PORT = process.env.PORT || 4000;

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "..", "views"));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use((req, res, next) => {
  const origin = process.env.CORS_ORIGIN || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});
app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/", (req, res) => {
  res.render("index");
});

app.get("/admin", (req, res) => {
  res.render("admin");
});

app.get("/reset-password", async (req, res) => {
  const { token } = req.query;
  if (!nonEmpty(token)) {
    return res.status(400).send("Invalid reset link.");
  }

  try {
    const user = await get(
      "SELECT id, password_reset_expires FROM users WHERE password_reset_token = ?",
      [token]
    );

    if (!user) {
      return res.status(400).send("Reset link is invalid or already used.");
    }

    if (user.password_reset_expires && new Date(user.password_reset_expires) < new Date()) {
      return res.status(400).send("Reset link has expired. Please request a new one.");
    }

    res.cookie("reset_token", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 15 * 60 * 1000,
    });

    return res.render("reset-password");
  } catch (error) {
    return res.status(500).send("Failed to load reset page.");
  }
});

app.post("/reset-password", async (req, res) => {
  const token = req.cookies.reset_token;
  const { password, confirmPassword } = req.body;

  if (!nonEmpty(token)) {
    return res.status(400).send("Reset link is invalid or expired.");
  }

  if (!nonEmpty(password) || password.length < 8 || password !== confirmPassword) {
    return res.status(400).send("Passwords must match and be at least 8 characters.");
  }

  try {
    const user = await get(
      "SELECT id, password_reset_expires FROM users WHERE password_reset_token = ?",
      [token]
    );

    if (!user) {
      return res.status(400).send("Reset link is invalid or already used.");
    }

    if (user.password_reset_expires && new Date(user.password_reset_expires) < new Date()) {
      return res.status(400).send("Reset link has expired. Please request a new one.");
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await run(
      "UPDATE users SET password_hash = ?, password_reset_token = NULL, password_reset_expires = NULL WHERE id = ?",
      [passwordHash, user.id]
    );

    res.clearCookie("reset_token");
    const redirectBase = process.env.FRONTEND_URL || process.env.APP_BASE_URL || `${req.protocol}://${req.get("host")}`;
    return res.redirect(`${redirectBase}/#auth`);
  } catch (error) {
    return res.status(500).send("Failed to reset password.");
  }
});

const clientDist = path.join(__dirname, "..", "client", "dist");
if (fs.existsSync(clientDist)) {
  app.use("/app", express.static(clientDist));
  app.get("/app/*", (req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

app.use("/api/auth", authRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/registrations", registrationRoutes);
app.use("/api/admin", adminRoutes);

app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Something went wrong" });
});

initializeDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to initialize database", err);
    process.exit(1);
  });
