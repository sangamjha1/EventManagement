const authForm = document.getElementById("authForm");
const registerForm = document.getElementById("registerForm");
const feedbackForm = document.getElementById("feedbackForm");
const createEventForm = document.getElementById("createEventForm");
const profileForm = document.getElementById("profileForm");
const forgotForm = document.getElementById("forgotForm");
const resetForm = document.getElementById("resetForm");

const openLoginBtn = document.getElementById("openLogin");
const openSignupBtn = document.getElementById("openSignup");
const organizerPanel = document.getElementById("organizerPanel");
const organizerGate = document.getElementById("organizerGate");

const state = {
  mode: "login",
  events: [],
  featured: [],
  token: localStorage.getItem("auth_token") || "",
  user: JSON.parse(localStorage.getItem("auth_user") || "null"),
  favorites: JSON.parse(localStorage.getItem("favorite_events") || "[]"),
};

function toast(message, type = "ok") {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.style.background = type === "error" ? "#8f2f2f" : "#14283c";
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 2600);
}

async function api(url, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }

  const response = await fetch(url, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || data.message || "Request failed");
  }
  return data;
}

function toggleModal(id, show) {
  const el = document.getElementById(id);
  el.classList.toggle("hidden", !show);
}

function formatDate(dateStr, start, end) {
  const date = new Date(dateStr);
  const readable = Number.isNaN(date.getTime()) ? dateStr : date.toLocaleDateString();
  return `${readable}${start ? ` | ${start}${end ? ` - ${end}` : ""}` : ""}`;
}

function getStatusChip(status) {
  if (status === "published") return '<span class="chip success">Published</span>';
  if (status === "draft") return '<span class="chip warn">Draft</span>';
  return '<span class="chip">Closed</span>';
}

function isParticipant() {
  return !!state.user && state.user.role === "participant";
}

function isOrganizer() {
  return !!state.user && state.user.role === "organizer";
}

function updateTopActions() {
  if (state.user) {
    openLoginBtn.textContent = `Logout (${state.user.role})`;
    openSignupBtn.classList.add("hidden");
  } else {
    openLoginBtn.textContent = "Login";
    openSignupBtn.classList.remove("hidden");
  }
}

function renderFeatured() {
  const row = document.getElementById("featuredRow");
  document.getElementById("metricFeatured").textContent = state.featured.length;
  row.innerHTML = state.featured
    .map(
      (event) => `
      <article class="featured-mini">
        <div class="chips"><span class="chip">${event.category}</span><span class="chip">${event.mode}</span></div>
        <h4>${event.title}</h4>
        <p>${event.location}</p>
        <p>${event.registrations_count || 0} applications | ⭐ ${event.avg_rating || "New"}</p>
        <button class="btn ghost" onclick="viewEvent(${event.id})">View</button>
      </article>`
    )
    .join("");
}

function renderEvents() {
  const grid = document.getElementById("eventGrid");
  document.getElementById("eventCount").textContent = `${state.events.length} results`;
  document.getElementById("metricEvents").textContent = state.events.length;
  document.getElementById("metricFavs").textContent = state.favorites.length;

  const totalRegs = state.events.reduce((acc, event) => acc + Number(event.registrations_count || 0), 0);
  document.getElementById("metricRegs").textContent = totalRegs;

  grid.innerHTML = state.events
    .map((event) => {
      const fill = Math.min(100, Math.round((Number(event.registrations_count || 0) / Number(event.capacity || 1)) * 100));
      const isFav = state.favorites.includes(event.id);
      return `
      <article class="event-card card">
        <div class="event-top">
          <div class="chips">
            <span class="chip">${event.category}</span>
            <span class="chip">${event.mode || "Offline"}</span>
            ${getStatusChip(event.status)}
          </div>
          <span class="event-meta">⭐ ${event.avg_rating || "New"}</span>
        </div>
        <h3>${event.title}</h3>
        <p class="event-meta">${formatDate(event.event_date, event.start_time, event.end_time)}</p>
        <p class="event-meta">${event.location} | by ${event.organizer_name}</p>
        <p>${event.description.slice(0, 120)}${event.description.length > 120 ? "..." : ""}</p>
        <div class="chips">
          <span class="chip">Prize: ${event.prize_pool || "Certificate"}</span>
          <span class="chip">Fee: ${Number(event.fee || 0) > 0 ? `INR ${event.fee}` : "Free"}</span>
        </div>
        <div class="event-meta">${event.registrations_count || 0}/${event.capacity} seats filled</div>
        <div class="progress"><div style="width:${fill}%"></div></div>
        <div class="event-actions">
          <button class="btn primary" onclick="openRegister(${event.id})">Apply</button>
          <button class="btn ghost" onclick="viewEvent(${event.id})">Details</button>
          <button class="btn ghost" onclick="toggleFavorite(${event.id})">${isFav ? "Saved" : "Save"}</button>
          <button class="btn soft" onclick="openFeedback(${event.id})">Rate</button>
        </div>
      </article>`;
    })
    .join("");
}

function setActiveTab(tabName) {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.tab === tabName);
  });

  const map = {
    discover: "discoverTab",
    myRegs: "myRegsTab",
    profile: "profileTab",
    organizer: "organizerTab",
  };

  Object.values(map).forEach((id) => document.getElementById(id).classList.add("hidden"));
  document.getElementById(map[tabName]).classList.remove("hidden");

  if (tabName === "myRegs") {
    loadMyRegistrations();
  }
  if (tabName === "profile") {
    renderProfile();
  }
}

function openAuth(mode, preferredRole = null) {
  state.mode = mode;
  const title = document.getElementById("authTitle");
  const nameField = document.getElementById("nameField");
  const signupFields = document.getElementById("signupFields");
  const roleField = document.getElementById("roleField");
  const orgSignupFields = document.getElementById("orgSignupFields");

  if (preferredRole) {
    roleField.value = preferredRole;
  }

  title.textContent = mode === "signup" ? "Create Account" : "Login";
  nameField.classList.toggle("hidden", mode !== "signup");
  nameField.required = mode === "signup";
  signupFields.classList.toggle("hidden", mode !== "signup");
  orgSignupFields.classList.toggle("hidden", mode !== "signup" || roleField.value !== "organizer");

  toggleModal("authModal", true);
}

function renderProfile() {
  const role = document.getElementById("profileRole");
  const hint = document.getElementById("profileHint");
  const form = document.getElementById("profileForm");
  const orgOnly = document.getElementById("orgOnlyFields");

  if (!state.user) {
    role.textContent = "Guest";
    hint.textContent = "Login to manage your profile.";
    form.classList.add("hidden");
    return;
  }

  role.textContent = state.user.role;
  hint.textContent = state.user.isVerified
    ? `Verified account: ${state.user.email}`
    : `Email not verified: ${state.user.email}`;

  form.classList.remove("hidden");
  orgOnly.classList.toggle("hidden", state.user.role !== "organizer");

  form.name.value = state.user.name || "";
  form.phone.value = state.user.phone || "";
  form.institution.value = state.user.institution || "";
  form.city.value = state.user.city || "";
  form.country.value = state.user.country || "";
  form.linkedin.value = state.user.linkedin || "";
  form.companyName.value = state.user.companyName || "";
  form.companyWebsite.value = state.user.companyWebsite || "";
  form.designation.value = state.user.designation || "";
}

async function refreshUser() {
  if (!state.token) return;
  try {
    const data = await api("/api/auth/me");
    state.user = data.user;
    localStorage.setItem("auth_user", JSON.stringify(data.user));
  } catch (err) {
    logout();
  }
}

async function loadFeatured() {
  try {
    const data = await api("/api/events/featured");
    state.featured = data.events;
    renderFeatured();
  } catch (error) {
    toast(error.message, "error");
  }
}

async function loadEvents() {
  const q = document.getElementById("searchInput").value.trim();
  const category = document.getElementById("categoryFilter").value;
  const date = document.getElementById("dateFilter").value;
  const mode = document.getElementById("modeFilter").value;

  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (category) params.set("category", category);
  if (date) params.set("date", date);
  if (mode) params.set("mode", mode);
  params.set("status", "published");

  try {
    const data = await api(`/api/events?${params.toString()}`);
    state.events = data.events;
    renderEvents();
  } catch (error) {
    toast(error.message, "error");
  }
}

async function loadOrganizerView() {
  if (!state.token || !isOrganizer()) {
    organizerPanel.classList.add("hidden");
    organizerGate.classList.remove("hidden");
    return;
  }

  try {
    const [insights, mine] = await Promise.all([api("/api/events/insights"), api("/api/events/mine")]);
    organizerPanel.classList.remove("hidden");
    organizerGate.classList.add("hidden");

    document.getElementById("organizerMetrics").innerHTML = `
      <article><h3>${insights.metrics.totalEvents}</h3><p>Total Opportunities</p></article>
      <article><h3>${insights.metrics.totalRegistrations}</h3><p>Total Applications</p></article>
      <article><h3>${insights.metrics.totalCheckins}</h3><p>Check-ins</p></article>
      <article><h3>${insights.metrics.avgRating || 0}</h3><p>Avg Rating</p></article>
    `;

    const myEvents = document.getElementById("myEvents");
    myEvents.innerHTML = mine.events.length
      ? mine.events
          .map(
            (event) => `
        <article class="list-item">
          <div class="section-head">
            <h4>${event.title}</h4>
            <div class="chips">${getStatusChip(event.status)}<span class="chip">⭐ ${event.avg_rating || "New"}</span></div>
          </div>
          <p class="event-meta">${event.event_date} ${event.start_time}-${event.end_time} | ${event.location}</p>
          <p class="event-meta">${event.registrations_count}/${event.capacity} registered | Feedback: ${event.feedback_count || 0}</p>
          <div class="event-actions">
            <button class="btn ghost" onclick="loadAttendees(${event.id})">View Applicants</button>
            <button class="btn soft" onclick="setEventStatus(${event.id}, 'published')">Publish</button>
            <button class="btn soft" onclick="setEventStatus(${event.id}, 'draft')">Draft</button>
            <button class="btn soft" onclick="setEventStatus(${event.id}, 'closed')">Close</button>
          </div>
          <div id="attendees-${event.id}"></div>
        </article>`
          )
          .join("")
      : "<p class='event-meta'>No opportunities created yet.</p>";
  } catch (error) {
    toast(error.message, "error");
  }
}

async function loadMyRegistrations() {
  const caption = document.getElementById("myRegsCaption");
  const hint = document.getElementById("myRegsHint");
  const wrap = document.getElementById("myRegsList");

  if (!state.token || !isParticipant()) {
    caption.textContent = "Participant login required";
    hint.textContent = "Please login as participant to view your applied opportunities.";
    wrap.innerHTML = "";
    return;
  }

  try {
    const data = await api("/api/registrations/my");
    caption.textContent = `Logged in as ${state.user.email}`;
    hint.textContent = "";
    wrap.innerHTML = data.registrations.length
      ? data.registrations
          .map(
            (reg) => `
      <article class="list-item">
        <h4>${reg.title}</h4>
        <p class="event-meta">${formatDate(reg.event_date, reg.start_time, reg.end_time)} | ${reg.location} (${reg.mode})</p>
        <p class="event-meta">Category: ${reg.category} | Status: ${reg.status}</p>
        <p class="event-meta">Team: ${reg.team_name || "-"} (${reg.team_size || 1}) | ${reg.institute || "-"}</p>
      </article>`
          )
          .join("")
      : "<p class='event-meta'>No registrations yet.</p>";
  } catch (error) {
    wrap.innerHTML = "";
    hint.textContent = error.message;
  }
}

window.openRegister = (eventId) => {
  if (!state.token || !isParticipant()) {
    toast("Login as participant to apply", "error");
    openAuth("login", "participant");
    return;
  }
  registerForm.eventId.value = eventId;
  toggleModal("registerModal", true);
};

window.openFeedback = (eventId) => {
  feedbackForm.eventId.value = eventId;
  if (isParticipant() && state.user?.email) {
    feedbackForm.attendeeEmail.value = state.user.email;
  }
  toggleModal("feedbackModal", true);
};

window.toggleFavorite = (eventId) => {
  if (state.favorites.includes(eventId)) {
    state.favorites = state.favorites.filter((id) => id !== eventId);
  } else {
    state.favorites.push(eventId);
  }
  localStorage.setItem("favorite_events", JSON.stringify(state.favorites));
  renderEvents();
};

window.viewEvent = async (eventId) => {
  try {
    const data = await api(`/api/events/${eventId}`);
    const event = data.event;

    document.getElementById("eventDetailContent").innerHTML = `
      <div class="section-head">
        <div>
          <h2>${event.title}</h2>
          <p class="event-meta">by ${event.organizer_name}</p>
        </div>
        <div class="chips">
          <span class="chip">${event.category}</span>
          <span class="chip">${event.mode || "Offline"}</span>
          ${getStatusChip(event.status)}
        </div>
      </div>
      ${event.banner_url ? `<img src="${event.banner_url}" alt="banner" style="width:100%;max-height:260px;object-fit:cover;border-radius:12px;border:1px solid var(--line);">` : ""}
      <p>${event.description}</p>
      <div class="grid-2">
        <div class="list-item"><strong>Date/Time</strong><br>${formatDate(event.event_date, event.start_time, event.end_time)}</div>
        <div class="list-item"><strong>Location</strong><br>${event.location}</div>
        <div class="list-item"><strong>Prize Pool</strong><br>${event.prize_pool || "Certificate"}</div>
        <div class="list-item"><strong>Registration Fee</strong><br>${Number(event.fee || 0) > 0 ? `INR ${event.fee}` : "Free"}</div>
        <div class="list-item"><strong>Eligibility</strong><br>${event.eligibility || "Open"}</div>
        <div class="list-item"><strong>Team Size</strong><br>Up to ${event.max_team_size || 1}</div>
      </div>
      <div class="section-head" style="margin-top:0.8rem;"><h3>Feedback</h3><span>⭐ ${event.avg_rating || "New"} (${event.feedback_count || 0})</span></div>
      ${(data.feedbacks || []).length ? data.feedbacks.map((f) => `<div class="list-item"><strong>${f.attendee_email}</strong> <span class="rating">${"★".repeat(f.rating)}</span><br>${f.comment || "No comment"}</div>`).join("") : "<p class='event-meta'>No feedback yet.</p>"}
      <div class="event-actions" style="margin-top:0.8rem;">
        <button class="btn primary" onclick="openRegister(${event.id})">Apply</button>
        <button class="btn soft" onclick="openFeedback(${event.id})">Rate Event</button>
      </div>
    `;

    toggleModal("eventDetailModal", true);
  } catch (error) {
    toast(error.message, "error");
  }
};

window.loadAttendees = async (eventId) => {
  try {
    const data = await api(`/api/registrations/event/${eventId}`);
    const target = document.getElementById(`attendees-${eventId}`);
    target.innerHTML = data.registrations.length
      ? data.registrations
          .map(
            (r) => `<div class="list-item">${r.attendee_name} (${r.attendee_email}) | Team: ${r.team_name || "-"} (${r.team_size || 1}) | ${r.status}
              ${r.status !== "checked-in" ? `<button class="btn ghost" onclick="checkin(${r.id}, ${eventId})">Check-in</button>` : ""}
            </div>`
          )
          .join("")
      : "<p class='event-meta'>No applicants yet.</p>";
  } catch (error) {
    toast(error.message, "error");
  }
};

window.checkin = async (registrationId, eventId) => {
  try {
    await api(`/api/registrations/${registrationId}/checkin`, { method: "PATCH" });
    await loadAttendees(eventId);
    await loadOrganizerView();
    toast("Check-in marked");
  } catch (error) {
    toast(error.message, "error");
  }
};

window.setEventStatus = async (eventId, status) => {
  try {
    await api(`/api/events/${eventId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    toast(`Event moved to ${status}`);
    await Promise.all([loadOrganizerView(), loadEvents(), loadFeatured()]);
  } catch (error) {
    toast(error.message, "error");
  }
};

async function handleAuthSubmit(e) {
  e.preventDefault();
  const payload = Object.fromEntries(new FormData(e.target).entries());

  try {
    if (state.mode === "signup") {
      const data = await api("/api/auth/register", { method: "POST", body: JSON.stringify(payload) });
      toggleModal("authModal", false);
      toast(data.message || "Account created. Verify your email.");
      return;
    }

    const data = await api("/api/auth/login", { method: "POST", body: JSON.stringify(payload) });
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem("auth_token", data.token);
    localStorage.setItem("auth_user", JSON.stringify(data.user));

    toggleModal("authModal", false);
    updateTopActions();
    renderProfile();
    await Promise.all([loadOrganizerView(), loadMyRegistrations()]);
    if (isOrganizer()) {
      setActiveTab("organizer");
    }
    toast(`Welcome ${data.user.name}`);
  } catch (error) {
    toast(error.message, "error");
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const payload = Object.fromEntries(new FormData(e.target).entries());

  try {
    await api("/api/registrations", { method: "POST", body: JSON.stringify(payload) });
    toggleModal("registerModal", false);
    e.target.reset();
    await Promise.all([loadEvents(), loadFeatured(), loadMyRegistrations()]);
    toast("Application submitted");
  } catch (error) {
    toast(error.message, "error");
  }
}

async function handleFeedback(e) {
  e.preventDefault();
  const payload = Object.fromEntries(new FormData(e.target).entries());
  const eventId = payload.eventId;

  try {
    await api(`/api/events/${eventId}/feedback`, { method: "POST", body: JSON.stringify(payload) });
    toggleModal("feedbackModal", false);
    e.target.reset();
    await Promise.all([loadEvents(), loadFeatured()]);
    toast("Feedback saved");
  } catch (error) {
    toast(error.message, "error");
  }
}

async function handleCreateEvent(e) {
  e.preventDefault();
  if (!isOrganizer()) {
    toast("Only organizers can create opportunities", "error");
    return;
  }

  const payload = Object.fromEntries(new FormData(e.target).entries());

  try {
    await api("/api/events", { method: "POST", body: JSON.stringify(payload) });
    e.target.reset();
    await Promise.all([loadOrganizerView(), loadEvents(), loadFeatured()]);
    toast("Opportunity created");
  } catch (error) {
    toast(error.message, "error");
  }
}

async function handleProfileSave(e) {
  e.preventDefault();
  if (!state.token) {
    toast("Login required", "error");
    return;
  }

  const payload = Object.fromEntries(new FormData(e.target).entries());
  try {
    const data = await api("/api/auth/profile", { method: "PATCH", body: JSON.stringify(payload) });
    state.user = data.user;
    localStorage.setItem("auth_user", JSON.stringify(data.user));
    renderProfile();
    toast("Profile updated");
  } catch (error) {
    toast(error.message, "error");
  }
}

async function handleForgot(e) {
  e.preventDefault();
  const payload = Object.fromEntries(new FormData(e.target).entries());
  try {
    const data = await api("/api/auth/forgot-password", { method: "POST", body: JSON.stringify(payload) });
    toast(data.message || "Reset link sent");
    toggleModal("forgotModal", false);
    e.target.reset();
  } catch (error) {
    toast(error.message, "error");
  }
}

async function handleReset(e) {
  e.preventDefault();
  const payload = Object.fromEntries(new FormData(e.target).entries());
  try {
    const data = await api("/api/auth/reset-password", { method: "POST", body: JSON.stringify(payload) });
    toast(data.message || "Password updated");
    toggleModal("resetModal", false);
    e.target.reset();
    window.history.replaceState({}, "", "/");
  } catch (error) {
    toast(error.message, "error");
  }
}

function logout() {
  state.token = "";
  state.user = null;
  localStorage.removeItem("auth_token");
  localStorage.removeItem("auth_user");
  updateTopActions();
  renderProfile();
  loadOrganizerView();
  loadMyRegistrations();
}

document.querySelectorAll("[data-close]").forEach((btn) => {
  btn.addEventListener("click", () => toggleModal(btn.dataset.close, false));
});

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => setActiveTab(tab.dataset.tab));
});

["searchInput", "categoryFilter", "dateFilter", "modeFilter"].forEach((id) => {
  document.getElementById(id).addEventListener("input", loadEvents);
});

document.getElementById("clearFilters").addEventListener("click", () => {
  document.getElementById("searchInput").value = "";
  document.getElementById("categoryFilter").value = "all";
  document.getElementById("dateFilter").value = "";
  document.getElementById("modeFilter").value = "all";
  loadEvents();
});

document.getElementById("scrollToEvents").addEventListener("click", () => {
  document.getElementById("eventsStart").scrollIntoView({ behavior: "smooth" });
});

document.getElementById("openLoginHero").addEventListener("click", () => openAuth("login", "organizer"));
document.getElementById("openLoginStudio").addEventListener("click", () => openAuth("login", "organizer"));
document.getElementById("openSignupStudio").addEventListener("click", () => openAuth("signup", "organizer"));

document.getElementById("roleField").addEventListener("change", (e) => {
  const showOrg = e.target.value === "organizer" && state.mode === "signup";
  document.getElementById("orgSignupFields").classList.toggle("hidden", !showOrg);
});

document.getElementById("openForgot").addEventListener("click", () => toggleModal("forgotModal", true));
document.getElementById("resendVerification").addEventListener("click", async () => {
  const email = authForm.email.value.trim();
  if (!email) {
    toast("Enter your email first", "error");
    return;
  }
  try {
    const data = await api("/api/auth/resend-verification", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
    toast(data.message || "Verification email sent");
  } catch (error) {
    toast(error.message, "error");
  }
});
openLoginBtn.addEventListener("click", () => {
  if (state.user) {
    logout();
    return;
  }
  openAuth("login", "participant");
});
openSignupBtn.addEventListener("click", () => openAuth("signup", "participant"));

authForm.addEventListener("submit", handleAuthSubmit);
registerForm.addEventListener("submit", handleRegister);
feedbackForm.addEventListener("submit", handleFeedback);
createEventForm.addEventListener("submit", handleCreateEvent);
profileForm.addEventListener("submit", handleProfileSave);
forgotForm.addEventListener("submit", handleForgot);
resetForm.addEventListener("submit", handleReset);
document.getElementById("logoutOrganizer").addEventListener("click", logout);

(function bootstrapResetFlow() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("resetToken");
  if (token) {
    document.getElementById("resetTokenInput").value = token;
    toggleModal("resetModal", true);
  }
})();

(async function init() {
  await refreshUser();
  updateTopActions();
  renderProfile();
  await Promise.all([loadEvents(), loadFeatured(), loadOrganizerView(), loadMyRegistrations()]);
})();
