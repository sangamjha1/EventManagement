const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { get, run, all } = require("../config/db");
const { authenticate } = require("../middleware/auth");
const { isEmail, nonEmpty } = require("../utils/validators");
const { sendMail } = require("../utils/mailer");

const router = express.Router();

function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      isVerified: !!user.is_verified,
    },
    process.env.JWT_SECRET,
    { expiresIn: "8h" }
  );
}

function appBaseUrl(req) {
  return process.env.APP_BASE_URL || `${req.protocol}://${req.get("host")}`;
}

function frontendBaseUrl(req) {
  return process.env.FRONTEND_URL || process.env.APP_BASE_URL || `${req.protocol}://${req.get("host")}`;
}

function mapUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    isVerified: !!user.is_verified,
    phone: user.phone,
    institution: user.institution,
    city: user.city,
    country: user.country,
    linkedin: user.linkedin,
    companyName: user.company_name,
    companyWebsite: user.company_website,
    designation: user.designation,
  };
}

async function sendVerificationEmail(req, userEmail, token) {
  const verifyLink = `${appBaseUrl(req)}/api/auth/verify-email?token=${token}`;
  await sendMail({
    to: userEmail,
    subject: "Verify your EventFlow account",
    text: `Verify your account by clicking this link: ${verifyLink}`,
    html: `<p>Welcome to EventFlow.</p><p>Verify your account: <a href=\"${verifyLink}\">Verify Email</a></p>`,
  });
}

async function handleRegister(req, res, forcedRole = null) {
  const {
    role,
    name,
    email,
    password,
    phone,
    institution,
    city,
    country,
    linkedin,
    companyName,
    companyWebsite,
    designation,
  } = req.body;

  const normalizedRole = String(forcedRole || role || "").toLowerCase();
  if (!["participant", "organizer"].includes(normalizedRole)) {
    return res.status(400).json({ error: "Role must be participant or organizer" });
  }

  if (!nonEmpty(name) || !isEmail(email) || !nonEmpty(password) || password.length < 8) {
    return res.status(400).json({ error: "Provide valid name, email, and password (min 8 chars)" });
  }

  if (normalizedRole === "organizer" && (!nonEmpty(companyName) || !nonEmpty(designation))) {
    return res.status(400).json({ error: "Organizer registration requires company name and designation" });
  }

  try {
    const existing = await get("SELECT id FROM users WHERE email = ? AND role = ?", [
      email.toLowerCase(),
      normalizedRole,
    ]);
    if (existing) {
      return res.status(409).json({ error: "Email already registered" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const verificationToken = crypto.randomBytes(32).toString("hex");
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const result = await run(
      `INSERT INTO users
        (name, email, password_hash, role, is_verified, email_verification_token, email_verification_expires,
         phone, institution, city, country, linkedin, company_name, company_website, designation)
       VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name.trim(),
        email.toLowerCase(),
        passwordHash,
        normalizedRole,
        verificationToken,
        verificationExpires,
        phone || null,
        institution || null,
        city || null,
        country || null,
        linkedin || null,
        companyName || null,
        companyWebsite || null,
        designation || null,
      ]
    );

    await sendVerificationEmail(req, email.toLowerCase(), verificationToken);

    const user = await get("SELECT * FROM users WHERE id = ?", [result.lastID]);
    return res.status(201).json({
      message: "Account created. Please verify your email before login.",
      user: mapUser(user),
    });
  } catch (error) {
    return res.status(500).json({ error: "Failed to register" });
  }
}

router.post("/register", async (req, res) => handleRegister(req, res));

router.post("/signup", async (req, res) => {
  return handleRegister(req, res, "organizer");
});

router.get("/verify-email", async (req, res) => {
  const { token } = req.query;

  if (!nonEmpty(token)) {
    return res.status(400).send("Invalid verification link");
  }

  try {
    const user = await get(
      "SELECT id, email_verification_expires FROM users WHERE email_verification_token = ?",
      [token]
    );

    if (!user) {
      return res.status(400).send("Verification link is invalid or already used.");
    }

    if (user.email_verification_expires && new Date(user.email_verification_expires) < new Date()) {
      return res.status(400).send("Verification link has expired. Please request a new one.");
    }

    await run(
      "UPDATE users SET is_verified = 1, email_verification_token = NULL, email_verification_expires = NULL WHERE id = ?",
      [user.id]
    );

    return res.send("Email verified successfully. You can close this tab and login.");
  } catch (error) {
    return res.status(500).send("Verification failed.");
  }
});

router.post("/resend-verification", async (req, res) => {
  const { email, role } = req.body;

  if (!isEmail(email)) {
    return res.status(400).json({ error: "Valid email is required" });
  }

  try {
    const roleFilter = role ? String(role).toLowerCase() : "";
    if (roleFilter && !["participant", "organizer"].includes(roleFilter)) {
      return res.status(400).json({ error: "Role must be participant or organizer" });
    }

    const users = await all(
      "SELECT id, is_verified, role FROM users WHERE email = ?",
      [email.toLowerCase()]
    );

    if (!users || users.length === 0) {
      return res.json({ message: "If the email exists, a verification link has been sent." });
    }

    const targetUsers = roleFilter ? users.filter((u) => u.role === roleFilter) : users;
    if (targetUsers.length === 0) {
      return res.json({ message: "If the email exists, a verification link has been sent." });
    }

    const hasUnverified = targetUsers.some((u) => !u.is_verified);
    if (!hasUnverified) {
      return res.json({ message: "Email is already verified." });
    }

    for (const target of targetUsers.filter((u) => !u.is_verified)) {
      const verificationToken = crypto.randomBytes(32).toString("hex");
      const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      await run(
        "UPDATE users SET email_verification_token = ?, email_verification_expires = ? WHERE id = ?",
        [verificationToken, verificationExpires, target.id]
      );
      await sendVerificationEmail(req, email.toLowerCase(), verificationToken);
    }

    return res.json({ message: "Verification email sent." });
  } catch (error) {
    return res.status(500).json({ error: "Failed to resend verification email" });
  }
});

router.post("/login", async (req, res) => {
  const { email, password, role } = req.body;

  if (!isEmail(email) || !nonEmpty(password)) {
    return res.status(400).json({ error: "Invalid credentials" });
  }

  try {
    const roleFilter = String(role || "").toLowerCase();
    if (!["participant", "organizer"].includes(roleFilter)) {
      return res.status(400).json({ error: "Role must be participant or organizer" });
    }

    const user = await get("SELECT * FROM users WHERE email = ? AND role = ?", [email.toLowerCase(), roleFilter]);
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const matches = await bcrypt.compare(password, user.password_hash);
    if (!matches) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    if (!user.is_verified) {
      return res.status(403).json({ error: "Please verify your email before login" });
    }

    const token = signToken(user);
    return res.json({ token, user: mapUser(user) });
  } catch (error) {
    return res.status(500).json({ error: "Login failed" });
  }
});

router.post("/admin/login", async (req, res) => {
  const { email, password } = req.body;

  if (!isEmail(email) || !nonEmpty(password)) {
    return res.status(400).json({ error: "Invalid credentials" });
  }

  try {
    const user = await get("SELECT * FROM users WHERE email = ?", [email.toLowerCase()]);
    if (!user || user.role !== "admin") {
      return res.status(401).json({ error: "Invalid admin credentials" });
    }

    const matches = await bcrypt.compare(password, user.password_hash);
    if (!matches) {
      return res.status(401).json({ error: "Invalid admin credentials" });
    }

    const token = signToken(user);
    return res.json({ token, user: mapUser(user) });
  } catch (error) {
    return res.status(500).json({ error: "Admin login failed" });
  }
});

router.post("/forgot-password", async (req, res) => {
  const { email, role } = req.body;

  if (!isEmail(email)) {
    return res.status(400).json({ error: "Valid email is required" });
  }

  try {
    const roleFilter = role ? String(role).toLowerCase() : "";
    if (roleFilter && !["participant", "organizer"].includes(roleFilter)) {
      return res.status(400).json({ error: "Role must be participant or organizer" });
    }

    const users = await all("SELECT id, role FROM users WHERE email = ?", [email.toLowerCase()]);
    if (!users || users.length === 0) {
      return res.json({ message: "If the email exists, a password reset link has been sent." });
    }

    const targetUsers = roleFilter ? users.filter((u) => u.role === roleFilter) : users;
    if (targetUsers.length === 0) {
      return res.json({ message: "If the email exists, a password reset link has been sent." });
    }

    for (const target of targetUsers) {
      const resetToken = crypto.randomBytes(32).toString("hex");
      const resetExpires = new Date(Date.now() + 60 * 60 * 1000).toISOString();

      await run("UPDATE users SET password_reset_token = ?, password_reset_expires = ? WHERE id = ?", [
        resetToken,
        resetExpires,
        target.id,
      ]);

      const resetLink = `${appBaseUrl(req)}/reset-password?token=${resetToken}`;
      await sendMail({
        to: email.toLowerCase(),
        subject: "Reset your EventFlow password",
        text: `Reset your password using this link: ${resetLink}`,
        html: `<p>Reset your password: <a href=\"${resetLink}\">Reset Password</a></p>`,
      });
    }

    return res.json({ message: "If the email exists, a password reset link has been sent." });
  } catch (error) {
    return res.status(500).json({ error: "Failed to send reset link" });
  }
});

router.post("/reset-password", async (req, res) => {
  const { token, password } = req.body;

  if (!nonEmpty(token) || !nonEmpty(password) || password.length < 8) {
    return res.status(400).json({ error: "Invalid token or weak password" });
  }

  try {
    const user = await get(
      "SELECT id, password_reset_expires FROM users WHERE password_reset_token = ?",
      [token]
    );

    if (!user) {
      return res.status(400).json({ error: "Invalid reset token" });
    }

    if (user.password_reset_expires && new Date(user.password_reset_expires) < new Date()) {
      return res.status(400).json({ error: "Reset token has expired" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await run(
      "UPDATE users SET password_hash = ?, password_reset_token = NULL, password_reset_expires = NULL WHERE id = ?",
      [passwordHash, user.id]
    );

    return res.json({ message: "Password reset successful" });
  } catch (error) {
    return res.status(500).json({ error: "Failed to reset password" });
  }
});

router.get("/me", authenticate, async (req, res) => {
  try {
    const user = await get("SELECT * FROM users WHERE id = ?", [req.user.id]);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    return res.json({ user: mapUser(user) });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch profile" });
  }
});

router.patch("/profile", authenticate, async (req, res) => {
  const {
    name,
    phone,
    institution,
    city,
    country,
    linkedin,
    companyName,
    companyWebsite,
    designation,
  } = req.body;

  if (!nonEmpty(name)) {
    return res.status(400).json({ error: "Name is required" });
  }

  try {
    await run(
      `UPDATE users
       SET name = ?, phone = ?, institution = ?, city = ?, country = ?, linkedin = ?,
           company_name = ?, company_website = ?, designation = ?
       WHERE id = ?`,
      [
        name.trim(),
        phone || null,
        institution || null,
        city || null,
        country || null,
        linkedin || null,
        companyName || null,
        companyWebsite || null,
        designation || null,
        req.user.id,
      ]
    );

    const user = await get("SELECT * FROM users WHERE id = ?", [req.user.id]);
    return res.json({ message: "Profile updated", user: mapUser(user) });
  } catch (error) {
    return res.status(500).json({ error: "Failed to update profile" });
  }
});

module.exports = router;
