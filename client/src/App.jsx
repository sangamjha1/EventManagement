
import React, { useEffect, useMemo, useState } from "react";
import { downloadCsv, getJson, postJson } from "./api.js";

const emptyInsights = {
  totalEvents: 0,
  totalRegistrations: 0,
  totalCheckins: 0,
  avgRating: 0,
  avgNps: 0,
  npsScore: 0,
};

const demoTrend = [42, 58, 51, 68, 77, 63, 85];
const demoSatisfaction = [3.8, 4.1, 4.3, 4.6, 4.2, 4.7, 4.9];

function getRoute() {
  const hash = window.location.hash.replace("#", "").trim();
  return hash || "home";
}

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString();
}

export default function App() {
  const [route, setRoute] = useState(getRoute);
  const [events, setEvents] = useState([]);
  const [eventFilters, setEventFilters] = useState({ q: "", category: "all", mode: "all" });
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [eventDetail, setEventDetail] = useState(null);
  const [eventError, setEventError] = useState("");
  const [showRegistration, setShowRegistration] = useState(false);

  const [token, setToken] = useState(() => localStorage.getItem("auth_token") || "");
  const [user, setUser] = useState(null);
  const [authError, setAuthError] = useState("");
  const [authSuccess, setAuthSuccess] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authTab, setAuthTab] = useState("login");
  const [signupRole, setSignupRole] = useState("");
  const [showForgot, setShowForgot] = useState(false);

  const [insights, setInsights] = useState(emptyInsights);
  const [byEvent, setByEvent] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [analytics, setAnalytics] = useState(null);
  const [analyticsError, setAnalyticsError] = useState("");

  const [feedbackForm, setFeedbackForm] = useState({
    eventId: "",
    attendeeEmail: "",
    rating: 5,
    npsScore: 9,
    comment: "",
  });
  const [feedbackStatus, setFeedbackStatus] = useState("");

  const [registrationStatus, setRegistrationStatus] = useState("");
  const [registrationForm, setRegistrationForm] = useState({
    attendeePhone: "",
    notes: "",
    teamName: "",
    teamSize: 1,
    institute: "",
    role: "",
  });


  useEffect(() => {
    const onHashChange = () => setRoute(getRoute());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);


  useEffect(() => {
    getJson("/api/events")
      .then((data) => setEvents(data.events || []))
      .catch(() => setEvents([]));
  }, []);

  useEffect(() => {
    if (!token) {
      setUser(null);
      return;
    }
    getJson("/api/auth/me", token)
      .then((data) => setUser(data.user))
      .catch(() => {
        setUser(null);
        setToken("");
        localStorage.removeItem("auth_token");
      });
  }, [token]);

  useEffect(() => {
    if (!token || !user || (user.role !== "organizer" && user.role !== "admin")) {
      setInsights(emptyInsights);
      setByEvent([]);
      return;
    }
    getJson("/api/events/insights", token)
      .then((data) => {
        setInsights(data.metrics || emptyInsights);
        setByEvent(data.byEvent || []);
      })
      .catch(() => {
        setInsights(emptyInsights);
        setByEvent([]);
      });
  }, [token, user]);

  useEffect(() => {
    if (!selectedEventId || !token) {
      setAnalytics(null);
      return;
    }
    setAnalyticsError("");
    getJson(`/api/events/${selectedEventId}/analytics`, token)
      .then((data) => setAnalytics(data))
      .catch((err) => setAnalyticsError(err.message || "Failed to load analytics"));
  }, [selectedEventId, token]);

  useEffect(() => {
    if (!selectedEvent) {
      setEventDetail(null);
      setEventError("");
      return;
    }
    setEventError("");
    getJson(`/api/events/${selectedEvent.id}`)
      .then((data) => setEventDetail(data))
      .catch((err) => setEventError(err.message || "Failed to load event"));
  }, [selectedEvent]);

  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      const matchesQuery = event.title.toLowerCase().includes(eventFilters.q.toLowerCase()) ||
        event.description.toLowerCase().includes(eventFilters.q.toLowerCase()) ||
        event.location.toLowerCase().includes(eventFilters.q.toLowerCase());
      const matchesCategory = eventFilters.category === "all" || event.category.toLowerCase() === eventFilters.category;
      const matchesMode = eventFilters.mode === "all" || event.mode.toLowerCase() === eventFilters.mode;
      return matchesQuery && matchesCategory && matchesMode;
    });
  }, [events, eventFilters]);

  const eventOptions = useMemo(() => events.map((event) => ({
    value: String(event.id),
    label: `${event.title} (${event.event_date})`,
  })), [events]);

  function handleLogin(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const role = String(formData.get("role") || "organizer");
    const email = String(formData.get("email") || "");
    const password = String(formData.get("password") || "");

    setAuthError("");
    setAuthSuccess("");
    setAuthLoading(true);

    postJson("/api/auth/login", { email, password, role })
      .then((data) => {
        setToken(data.token);
        localStorage.setItem("auth_token", data.token);
        setUser(data.user);
        window.location.hash = "dashboard";
      })
      .catch((err) => setAuthError(err.message || "Login failed"))
      .finally(() => setAuthLoading(false));
  }

  function handleSignup(e, role) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const payload = {
      role,
      name: formData.get("name"),
      email: formData.get("email"),
      password: formData.get("password"),
      phone: formData.get("phone"),
      institution: formData.get("institution"),
      city: formData.get("city"),
      country: formData.get("country"),
      linkedin: formData.get("linkedin"),
      companyName: formData.get("companyName"),
      companyWebsite: formData.get("companyWebsite"),
      designation: formData.get("designation"),
    };

    setAuthError("");
    setAuthSuccess("");
    setAuthLoading(true);

    const endpoint = role === "organizer" ? "/api/auth/signup" : "/api/auth/register";
    postJson(endpoint, payload)
      .then(() => {
        setAuthSuccess("Account created. Please verify your email before logging in.");
        setAuthTab("login");
      })
      .catch((err) => setAuthError(err.message || "Signup failed"))
      .finally(() => setAuthLoading(false));
  }

  function handleForgotPassword(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const email = String(formData.get("email") || "");

    setAuthError("");
    setAuthSuccess("");
    setAuthLoading(true);

    postJson("/api/auth/forgot-password", { email })
      .then(() => {
        setAuthSuccess("If the email exists, a reset link was sent.");
      })
      .catch((err) => setAuthError(err.message || "Failed to send reset link"))
      .finally(() => setAuthLoading(false));
  }

  function handleLogout() {
    setToken("");
    setUser(null);
    localStorage.removeItem("auth_token");
    window.location.hash = "home";
  }

  function handleFeedbackSubmit(e) {
    e.preventDefault();
    setFeedbackStatus("");
    const payload = {
      attendeeEmail: feedbackForm.attendeeEmail,
      rating: Number(feedbackForm.rating),
      npsScore: Number(feedbackForm.npsScore),
      comment: feedbackForm.comment,
    };

    postJson(`/api/events/${feedbackForm.eventId}/feedback`, payload)
      .then(() => {
        setFeedbackStatus("Thanks! Feedback submitted.");
        setFeedbackForm((prev) => ({
          ...prev,
          comment: "",
        }));
      })
      .catch((err) => setFeedbackStatus(err.message || "Failed to submit feedback"));
  }

  function handleRegister(e) {
    e.preventDefault();
    setRegistrationStatus("");
    if (!selectedEvent) {
      setRegistrationStatus("Select an event first.");
      return;
    }

    postJson(
      "/api/registrations",
      {
        eventId: selectedEvent.id,
        attendeePhone: registrationForm.attendeePhone,
        notes: registrationForm.notes,
        teamName: registrationForm.teamName,
        teamSize: Number(registrationForm.teamSize),
        institute: registrationForm.institute,
        role: registrationForm.role,
      },
      token
    )
      .then(() => {
        setRegistrationStatus("Registration confirmed. Check your email for updates.");
        setShowRegistration(false);
      })
      .catch((err) => setRegistrationStatus(err.message || "Registration failed"));
  }

  const fillPercent = analytics
    ? Math.min(100, Math.round((analytics.totals.registrations / Math.max(1, analytics.totals.capacity)) * 100))
    : 0;

  return (
    <div className="app">
      <nav className="topnav">
        <div className="brand">
          <span>SEAMLESS</span>
          <strong>Event OS</strong>
        </div>
        <div className="links">
          <a href="#home" className={route === "home" ? "active" : ""}>Home</a>
          <a href="#events" className={route === "events" ? "active" : ""}>Events</a>
          <a href="#feedback" className={route === "feedback" ? "active" : ""}>Feedback</a>
          <a href="#dashboard" className={route === "dashboard" ? "active" : ""}>Dashboard</a>
          {!user && <a href="#auth" className={route === "auth" ? "active" : ""}>Login</a>}
        </div>
        <div className="auth">
          {user ? (
            <>
              <span className="muted">{user.name}</span>
              <button className="btn ghost" onClick={handleLogout}>Logout</button>
            </>
          ) : null}
        </div>
      </nav>
      {route === "home" && (
        <header className="hero">
          <div>
            <p className="pill">Seamless Event Management System</p>
            <h1>Everything you need to plan, run, and learn from events.</h1>
            <p className="sub">
              A clean, centralized platform for registrations, check-ins, analytics, and feedback—built for
              fast-moving organizers and hackathons.
            </p>
            <div className="cta-row">
              <a className="btn" href="#auth">Create account</a>
              <a className="btn secondary" href="#events">Browse events</a>
            </div>
            <div className="hero-metrics">
              <div>
                <h3>{events.length}</h3>
                <p>Live events</p>
              </div>
              <div>
                <h3>{insights.totalRegistrations || 1280}</h3>
                <p>Registrations</p>
              </div>
              <div>
                <h3>{insights.avgRating || 4.8}</h3>
                <p>Avg rating</p>
              </div>
            </div>
          </div>
          <div className="hero-card">
            <h3>Organizer highlights</h3>
            <ul>
              <li>Live analytics + NPS tracking</li>
              <li>Built-in feedback collection</li>
              <li>CSV export for sponsors</li>
              <li>Attendee check-in ready</li>
            </ul>
            <div className="hero-chart">
              {demoTrend.map((value, index) => (
                <span key={`hero-${index}`} style={{ height: `${Math.max(12, value)}%` }} />
              ))}
            </div>
          </div>
        </header>
      )}

      {route === "auth" && !user && (
        <section className="auth-page">
          <div className="auth-panel">
            <div>
              <p className="eyebrow">Welcome</p>
              <h2>Sign in</h2>
              <p className="muted">Access your organizer or participant workspace.</p>
            </div>
            <div className="auth-tabs">
              <button className={authTab === "login" ? "active" : ""} onClick={() => setAuthTab("login")}>Login</button>
              <button className={authTab === "signup" ? "active" : ""} onClick={() => setAuthTab("signup")}>Create account</button>
            </div>

            {authTab === "login" && (
              <>
                <form onSubmit={handleLogin} className="auth-form">
                  <label>
                    Role
                    <select name="role" defaultValue="organizer">
                      <option value="organizer">Organizer</option>
                      <option value="participant">Participant</option>
                    </select>
                  </label>
                  <label>
                    Email
                    <input name="email" type="email" placeholder="you@company.com" required />
                  </label>
                  <label>
                    Password
                    <input name="password" type="password" placeholder="••••••••" required />
                  </label>
                  {authError && <p className="error">{authError}</p>}
                  {authSuccess && <p className="status">{authSuccess}</p>}
                  <button className="btn" disabled={authLoading} type="submit">
                    {authLoading ? "Signing in..." : "Sign in"}
                  </button>
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => setShowForgot((prev) => !prev)}
                  >
                    Forgot password?
                  </button>
                </form>
                {showForgot && (
                  <form onSubmit={handleForgotPassword} className="auth-form subtle">
                    <label>
                      Account email
                      <input name="email" type="email" required />
                    </label>
                    {authError && <p className="error">{authError}</p>}
                    {authSuccess && <p className="status">{authSuccess}</p>}
                    <button className="btn" type="submit" disabled={authLoading}>Send reset link</button>
                  </form>
                )}
              </>
            )}

            {authTab === "signup" && !signupRole && (
              <div className="role-pick">
                <div className="role-card" onClick={() => setSignupRole("organizer")}>
                  <h3>Organizer</h3>
                  <p className="muted">Create events, track analytics, and manage registrations.</p>
                  <button className="btn secondary" type="button">Continue</button>
                </div>
                <div className="role-card" onClick={() => setSignupRole("participant")}>
                  <h3>Participant</h3>
                  <p className="muted">Register for events and submit feedback.</p>
                  <button className="btn secondary" type="button">Continue</button>
                </div>
              </div>
            )}

            {authTab === "signup" && signupRole === "organizer" && (
              <form onSubmit={(e) => handleSignup(e, "organizer")} className="auth-form">
                <div className="auth-row">
                  <h3>Create organizer account</h3>
                  <button type="button" className="btn ghost" onClick={() => setSignupRole("")}>Change role</button>
                </div>
                <label>
                  Name
                  <input name="name" required />
                </label>
                <label>
                  Email
                  <input name="email" type="email" required />
                </label>
                <label>
                  Password
                  <input name="password" type="password" minLength="8" required />
                </label>
                <label>
                  Company
                  <input name="companyName" required />
                </label>
                <label>
                  Designation
                  <input name="designation" required />
                </label>
                <label>
                  Phone
                  <input name="phone" />
                </label>
                <label>
                  Website
                  <input name="companyWebsite" />
                </label>
                {authError && <p className="error">{authError}</p>}
                {authSuccess && <p className="status">{authSuccess}</p>}
                <button className="btn" type="submit" disabled={authLoading}>Create organizer account</button>
              </form>
            )}

            {authTab === "signup" && signupRole === "participant" && (
              <form onSubmit={(e) => handleSignup(e, "participant")} className="auth-form">
                <div className="auth-row">
                  <h3>Create participant account</h3>
                  <button type="button" className="btn ghost" onClick={() => setSignupRole("")}>Change role</button>
                </div>
                <label>
                  Name
                  <input name="name" required />
                </label>
                <label>
                  Email
                  <input name="email" type="email" required />
                </label>
                <label>
                  Password
                  <input name="password" type="password" minLength="8" required />
                </label>
                <label>
                  Institution
                  <input name="institution" />
                </label>
                <label>
                  City
                  <input name="city" />
                </label>
                <label>
                  Country
                  <input name="country" />
                </label>
                <label>
                  LinkedIn
                  <input name="linkedin" />
                </label>
                {authError && <p className="error">{authError}</p>}
                {authSuccess && <p className="status">{authSuccess}</p>}
                <button className="btn" type="submit" disabled={authLoading}>Create participant account</button>
              </form>
            )}

          </div>
        </section>
      )}

      {route === "auth" && user && (
        <section className="panel">
          <h2>My Profile</h2>
          <p className="muted">You are signed in.</p>
          <div className="list">
            <div className="list-item">
              <div>
                <strong>Name</strong>
                <p className="muted">{user.name}</p>
              </div>
              <span>{user.role}</span>
            </div>
            <div className="list-item">
              <div>
                <strong>Email</strong>
                <p className="muted">{user.email}</p>
              </div>
              <span>{user.isVerified ? "Verified" : "Unverified"}</span>
            </div>
          </div>
          <div className="cta-row">
            <a className="btn" href="#dashboard">Go to dashboard</a>
            <button className="btn secondary" onClick={handleLogout}>Logout</button>
          </div>
        </section>
      )}
      {route === "events" && (
        <section className="events-layout">
          <div className="panel">
            <div className="panel-head">
              <div>
                <h2>Discover Events</h2>
                <p className="muted">Browse upcoming events and register in seconds.</p>
              </div>
              <div className="filters">
                <input
                  placeholder="Search events"
                  value={eventFilters.q}
                  onChange={(e) => setEventFilters((prev) => ({ ...prev, q: e.target.value }))}
                />
                <select
                  value={eventFilters.category}
                  onChange={(e) => setEventFilters((prev) => ({ ...prev, category: e.target.value }))}
                >
                  <option value="all">All categories</option>
                  <option value="hackathon">Hackathon</option>
                  <option value="workshop">Workshop</option>
                  <option value="conference">Conference</option>
                  <option value="case study">Case Study</option>
                </select>
                <select
                  value={eventFilters.mode}
                  onChange={(e) => setEventFilters((prev) => ({ ...prev, mode: e.target.value }))}
                >
                  <option value="all">All modes</option>
                  <option value="online">Online</option>
                  <option value="offline">Offline</option>
                  <option value="hybrid">Hybrid</option>
                </select>
              </div>
            </div>

            <div className="event-grid">
              {filteredEvents.map((event) => (
                <article key={event.id} className="event-card" onClick={() => setSelectedEvent(event)}>
                  <div>
                    <p className="tag">{event.category}</p>
                    <h3>{event.title}</h3>
                    <p className="muted">{event.location} · {event.mode}</p>
                  </div>
                  <div className="stats">
                    <span>{event.registrations_count} regs</span>
                    <span>{event.avg_rating || 0}★</span>
                    <span>NPS {event.avg_nps || 0}</span>
                  </div>
                  <p className="muted">{event.event_date} · {event.start_time} - {event.end_time}</p>
                  <div className="card-actions">
                    <button
                      className="btn"
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedEvent(event);
                        setShowRegistration(true);
                      }}
                    >
                      Register now
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div className="panel">
            <h2>Event Details</h2>
            {eventError && <p className="error">{eventError}</p>}
            {!selectedEvent && <p className="muted">Select an event to see details.</p>}
            {eventDetail && (
              <>
                <h3>{eventDetail.event.title}</h3>
                <p className="muted">{eventDetail.event.location} · {eventDetail.event.mode}</p>
                <p>{eventDetail.event.description}</p>
                <div className="stats">
                  <span>{eventDetail.event.registrations_count} regs</span>
                  <span>{eventDetail.event.avg_rating || 0}★</span>
                  <span>NPS {eventDetail.nps?.score || 0}</span>
                </div>
                <div className="card-actions">
                  <button
                    className="btn"
                    type="button"
                    onClick={() => setShowRegistration(true)}
                  >
                    Register now
                  </button>
                </div>
                <h4>Latest feedback</h4>
                <div className="list">
                  {eventDetail.feedbacks.length === 0 ? (
                    <p className="muted">No feedback yet.</p>
                  ) : (
                    eventDetail.feedbacks.map((item) => (
                      <div key={`${item.attendee_email}-${item.created_at}`} className="list-item">
                        <div>
                          <strong>{item.attendee_email}</strong>
                          <p className="muted">Rating {item.rating} · NPS {item.nps_score ?? "-"}</p>
                        </div>
                        <span>{formatDate(item.created_at)}</span>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        </section>
      )}

      {route === "dashboard" && (
        <section className="grid">
          <div className="panel">
            <h2>Organizer Insights</h2>
            {token && user && (user.role === "organizer" || user.role === "admin") ? (
              <>
                <div className="metrics">
                  <div>
                    <h4>{insights.totalEvents}</h4>
                    <p>Events</p>
                  </div>
                  <div>
                    <h4>{insights.totalRegistrations}</h4>
                    <p>Registrations</p>
                  </div>
                  <div>
                    <h4>{insights.totalCheckins}</h4>
                    <p>Check-ins</p>
                  </div>
                  <div>
                    <h4>{insights.avgRating}</h4>
                    <p>Avg Rating</p>
                  </div>
                  <div>
                    <h4>{insights.avgNps}</h4>
                    <p>Avg NPS</p>
                  </div>
                  <div>
                    <h4>{insights.npsScore}</h4>
                    <p>NPS Score</p>
                  </div>
                </div>

                <label className="select-label">
                  Pick an event
                  <select value={selectedEventId} onChange={(e) => setSelectedEventId(e.target.value)}>
                    <option value="">Select event</option>
                    {byEvent.map((event) => (
                      <option key={event.id} value={event.id}>
                        {event.title}
                      </option>
                    ))}
                  </select>
                </label>

                {analyticsError && <p className="error">{analyticsError}</p>}
                {analytics && (
                  <div className="analytics">
                    <div className="analytics-summary">
                      <div>
                        <h3>{analytics.event.title}</h3>
                        <p className="muted">Capacity: {analytics.totals.capacity}</p>
                      </div>
                      <div className="bar">
                        <div style={{ width: `${fillPercent}%` }} />
                      </div>
                      <p className="muted">{analytics.totals.registrations} registrations · {fillPercent}% filled</p>
                      <div className="mini-metrics">
                        <span>Check-ins: {analytics.totals.checkins}</span>
                        <span>Avg Rating: {analytics.totals.avgRating}</span>
                        <span>NPS: {analytics.totals.npsScore}</span>
                      </div>
                    </div>
                    <div className="chart">
                      <h4>Registrations by Day</h4>
                      {analytics.byDay.length === 0 ? (
                        <p className="muted">No registrations yet.</p>
                      ) : (
                        <div className="bars">
                          {analytics.byDay.map((row) => (
                            <div key={row.day} className="bar-row">
                              <span>{row.day}</span>
                              <div className="bar-track">
                                <div style={{ width: `${Math.min(100, row.registrations * 10)}%` }} />
                              </div>
                              <strong>{row.registrations}</strong>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="export-row">
                      <button className="btn secondary" onClick={() => downloadCsv(`/api/events/${analytics.event.id}/export/registrations`, token)}>
                        Export registrations CSV
                      </button>
                      <button className="btn secondary" onClick={() => downloadCsv(`/api/events/${analytics.event.id}/export/feedback`, token)}>
                        Export feedback CSV
                      </button>
                    </div>
                  </div>
                )}

                <div className="chart-grid">
                  <div className="chart-card">
                    <div className="chart-head">
                      <h4>Engagement Trend</h4>
                      <span className="pill small">Demo</span>
                    </div>
                    <div className="sparkline">
                      {demoTrend.map((value, index) => (
                        <div key={`trend-${index}`} style={{ height: `${Math.max(12, value)}%` }} />
                      ))}
                    </div>
                    <p className="muted small">Daily check-in activity across all events.</p>
                  </div>
                  <div className="chart-card">
                    <div className="chart-head">
                      <h4>Satisfaction</h4>
                      <span className="pill small">NPS</span>
                    </div>
                    <div className="donut" style={{ "--value": "78%" }}>
                      <div>
                        <strong>78</strong>
                        <span>Score</span>
                      </div>
                    </div>
                    <p className="muted small">Promoters vs detractors (demo).</p>
                  </div>
                  <div className="chart-card">
                    <div className="chart-head">
                      <h4>Channel Mix</h4>
                      <span className="pill small">Demo</span>
                    </div>
                    <div className="stacked">
                      <span style={{ width: "46%" }}>Social 46%</span>
                      <span style={{ width: "32%" }}>Campus 32%</span>
                      <span style={{ width: "22%" }}>Partners 22%</span>
                    </div>
                    <p className="muted small">Top acquisition sources this week.</p>
                  </div>
                </div>
              </>
            ) : (
              <p className="muted">Login as an organizer to unlock analytics and exports.</p>
            )}
          </div>

          <div className="panel">
            <h2>Participant Registration</h2>
            <p className="muted">Participants can register for events and receive confirmation instantly.</p>
            <form className="feedback-form" onSubmit={handleRegister}>
              <label>
                Event
                <select value={selectedEvent?.id || ""} onChange={(e) => {
                  const event = events.find((item) => String(item.id) === e.target.value);
                  setSelectedEvent(event || null);
                }} required>
                  <option value="">Select event</option>
                  {eventOptions.map((event) => (
                    <option key={event.value} value={event.value}>
                      {event.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Team Name
                <input value={registrationForm.teamName} onChange={(e) => setRegistrationForm((prev) => ({ ...prev, teamName: e.target.value }))} />
              </label>
              <label>
                Team Size
                <input type="number" min="1" value={registrationForm.teamSize} onChange={(e) => setRegistrationForm((prev) => ({ ...prev, teamSize: e.target.value }))} />
              </label>
              <label>
                Phone
                <input value={registrationForm.attendeePhone} onChange={(e) => setRegistrationForm((prev) => ({ ...prev, attendeePhone: e.target.value }))} />
              </label>
              <label>
                Institute
                <input value={registrationForm.institute} onChange={(e) => setRegistrationForm((prev) => ({ ...prev, institute: e.target.value }))} />
              </label>
              <label>
                Role
                <input value={registrationForm.role} onChange={(e) => setRegistrationForm((prev) => ({ ...prev, role: e.target.value }))} />
              </label>
              <label className="full">
                Notes
                <textarea rows="3" value={registrationForm.notes} onChange={(e) => setRegistrationForm((prev) => ({ ...prev, notes: e.target.value }))} />
              </label>
              <button className="btn" type="submit">Register participant</button>
              {registrationStatus && <p className="status">{registrationStatus}</p>}
            </form>
            {!token && <p className="muted">Login as a participant to register.</p>}
          </div>
        </section>
      )}

      {route === "feedback" && (
        <section className="panel feedback">
          <div>
            <h2>Feedback + NPS</h2>
            <p className="muted">Capture attendee sentiment and NPS to drive improvements.</p>
          </div>
          <form className="feedback-form" onSubmit={handleFeedbackSubmit}>
            <label>
              Event
              <select
                value={feedbackForm.eventId}
                onChange={(e) => setFeedbackForm((prev) => ({ ...prev, eventId: e.target.value }))}
                required
              >
                <option value="">Select event</option>
                {eventOptions.map((event) => (
                  <option key={event.value} value={event.value}>
                    {event.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Attendee Email
              <input
                type="email"
                required
                value={feedbackForm.attendeeEmail}
                onChange={(e) => setFeedbackForm((prev) => ({ ...prev, attendeeEmail: e.target.value }))}
              />
            </label>
            <label>
              Rating (1-5)
              <input
                type="number"
                min="1"
                max="5"
                value={feedbackForm.rating}
                onChange={(e) => setFeedbackForm((prev) => ({ ...prev, rating: e.target.value }))}
              />
            </label>
            <label>
              NPS (0-10)
              <input
                type="number"
                min="0"
                max="10"
                value={feedbackForm.npsScore}
                onChange={(e) => setFeedbackForm((prev) => ({ ...prev, npsScore: e.target.value }))}
              />
            </label>
            <label className="full">
              Comment
              <textarea
                rows="3"
                value={feedbackForm.comment}
                onChange={(e) => setFeedbackForm((prev) => ({ ...prev, comment: e.target.value }))}
              />
            </label>
            <button className="btn" type="submit">Submit feedback</button>
            {feedbackStatus && <p className="status">{feedbackStatus}</p>}
          </form>
        </section>
      )}

      {showRegistration && (
        <div className="modal" onClick={() => setShowRegistration(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <button className="close" onClick={() => setShowRegistration(false)}>×</button>
            <h2>Register for {selectedEvent?.title || "event"}</h2>
            {!token && <p className="muted">Please login as a participant to register.</p>}
            <form className="feedback-form" onSubmit={handleRegister}>
              <label>
                Team Name
                <input value={registrationForm.teamName} onChange={(e) => setRegistrationForm((prev) => ({ ...prev, teamName: e.target.value }))} />
              </label>
              <label>
                Team Size
                <input type="number" min="1" value={registrationForm.teamSize} onChange={(e) => setRegistrationForm((prev) => ({ ...prev, teamSize: e.target.value }))} />
              </label>
              <label>
                Phone
                <input value={registrationForm.attendeePhone} onChange={(e) => setRegistrationForm((prev) => ({ ...prev, attendeePhone: e.target.value }))} />
              </label>
              <label>
                Institute
                <input value={registrationForm.institute} onChange={(e) => setRegistrationForm((prev) => ({ ...prev, institute: e.target.value }))} />
              </label>
              <label>
                Role
                <input value={registrationForm.role} onChange={(e) => setRegistrationForm((prev) => ({ ...prev, role: e.target.value }))} />
              </label>
              <label className="full">
                Notes
                <textarea rows="3" value={registrationForm.notes} onChange={(e) => setRegistrationForm((prev) => ({ ...prev, notes: e.target.value }))} />
              </label>
              <button
                className="btn"
                type="submit"
                onClick={() => {
                  if (!token) {
                    setRegistrationStatus("Please login as a participant to register.");
                    window.location.hash = "auth";
                  }
                }}
              >
                Submit registration
              </button>
              {registrationStatus && <p className="status">{registrationStatus}</p>}
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
