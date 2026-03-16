const state = {
  token: localStorage.getItem("admin_token") || "",
};

function toast(message, type = "ok") {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.style.background = type === "error" ? "#8f2f2f" : "#14283c";
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 2200);
}

async function api(url, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }

  const response = await fetch(url, { ...options, headers });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }
  return data;
}

function setVisibility(loggedIn) {
  document.getElementById("adminLogin").classList.toggle("hidden", loggedIn);
  document.getElementById("adminDashboard").classList.toggle("hidden", !loggedIn);
}

async function loginAdmin(e) {
  e.preventDefault();
  const payload = Object.fromEntries(new FormData(e.target).entries());
  try {
    const data = await api("/api/auth/admin/login", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    state.token = data.token;
    localStorage.setItem("admin_token", data.token);
    setVisibility(true);
    await loadDashboard();
    toast("Admin login successful");
  } catch (error) {
    toast(error.message, "error");
  }
}

function lineItem(text) {
  return `<div class="list-item">${text}</div>`;
}

async function loadDashboard() {
  try {
    const data = await api("/api/admin/dashboard");
    const totals = data.totals;

    document.getElementById("adminTotals").innerHTML = `
      <article><h3>${totals.organizers}</h3><p>Organizers</p></article>
      <article><h3>${totals.admins}</h3><p>Admins</p></article>
      <article><h3>${totals.events}</h3><p>Opportunities</p></article>
      <article><h3>${totals.registrations}</h3><p>Applications</p></article>
      <article><h3>${totals.checkins}</h3><p>Check-ins</p></article>
      <article><h3>${totals.avg_rating || 0}</h3><p>Avg Rating</p></article>
    `;

    document.getElementById("adminEvents").innerHTML = data.recentEvents.length
      ? data.recentEvents
          .map(
            (item) =>
              lineItem(`<strong>${item.title}</strong><br>${item.organizer_name} | ${item.category} | ${item.mode}<br>${item.event_date} | ${item.status} | ${item.registrations_count} apps | ⭐ ${item.avg_rating || "New"}`)
          )
          .join("")
      : "<p>No data</p>";

    document.getElementById("adminRegistrations").innerHTML = data.recentRegistrations.length
      ? data.recentRegistrations
          .map(
            (item) =>
              lineItem(`${item.attendee_name} (${item.attendee_email})<br><strong>${item.event_title}</strong> | ${item.status} | Team size: ${item.team_size || 1}`)
          )
          .join("")
      : "<p>No data</p>";

    document.getElementById("adminCategory").innerHTML = data.categoryStats.length
      ? data.categoryStats.map((c) => lineItem(`${c.category}: <strong>${c.count}</strong>`)).join("")
      : "<p>No data</p>";

    document.getElementById("adminStatus").innerHTML = data.statusStats.length
      ? data.statusStats.map((s) => lineItem(`${s.status}: <strong>${s.count}</strong>`)).join("")
      : "<p>No data</p>";

    document.getElementById("adminOrganizers").innerHTML = data.topOrganizers.length
      ? data.topOrganizers
          .map(
            (o) =>
              lineItem(`<strong>${o.name}</strong> (${o.email})<br>Events: ${o.events_count} | Applications: ${o.registrations_count}`)
          )
          .join("")
      : "<p>No data</p>";
  } catch (error) {
    state.token = "";
    localStorage.removeItem("admin_token");
    setVisibility(false);
    toast("Admin session expired", "error");
  }
}

function logoutAdmin() {
  state.token = "";
  localStorage.removeItem("admin_token");
  setVisibility(false);
}

document.getElementById("adminLoginForm").addEventListener("submit", loginAdmin);
document.getElementById("adminLogout").addEventListener("click", logoutAdmin);

if (state.token) {
  setVisibility(true);
  loadDashboard();
} else {
  setVisibility(false);
}