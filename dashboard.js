const dashboardHeading = document.getElementById("dashboard-heading");
const dashboardCopy = document.getElementById("dashboard-copy");
const dashboardAvatar = document.getElementById("dashboard-avatar");
const dashboardName = document.getElementById("dashboard-name");
const dashboardEmail = document.getElementById("dashboard-email");
const dashboardTotalSessions = document.getElementById("dashboard-total-sessions");
const dashboardTotalMinutes = document.getElementById("dashboard-total-minutes");
const dashboardStreak = document.getElementById("dashboard-streak");
const dashboardSessionList = document.getElementById("dashboard-session-list");
const dashboardSessionEmpty = document.getElementById("dashboard-session-empty");
const dashboardAdminLink = document.getElementById("dashboard-admin-link");
const dashboardLogoutButton = document.getElementById("dashboard-logout-button");
const netlifyHosted = window.location.hostname.endsWith("netlify.app");

let currentUser = null;

function getLocalSessionKey() {
  if (!currentUser || !currentUser.email) {
    return null;
  }

  return `vtn-local-sessions:${currentUser.email.toLowerCase()}`;
}

function getLocalSessions() {
  const key = getLocalSessionKey();
  if (!key) {
    return [];
  }

  try {
    const value = window.localStorage.getItem(key);
    const sessions = value ? JSON.parse(value) : [];
    return Array.isArray(sessions) ? sessions : [];
  } catch {
    return [];
  }
}

function calculateStats(sessions) {
  const totalSessions = sessions.length;
  const totalMinutes = sessions.reduce((sum, session) => sum + Math.round((session.completed || 0) / 60), 0);
  const uniqueDays = new Set(
    sessions.map((session) => new Date(session.finishedAt).toISOString().slice(0, 10))
  );

  return {
    totalSessions,
    totalMinutes,
    streak: uniqueDays.size,
  };
}

function renderStats(stats) {
  dashboardTotalSessions.textContent = String(stats.totalSessions || 0);
  dashboardTotalMinutes.textContent = String(stats.totalMinutes || 0);
  dashboardStreak.textContent = String(stats.streak || 0);
}

function renderSessions(sessions) {
  dashboardSessionList.innerHTML = "";

  if (!sessions.length) {
    dashboardSessionList.appendChild(dashboardSessionEmpty);
    dashboardSessionEmpty.style.display = "";
    return;
  }

  dashboardSessionEmpty.style.display = "none";

  sessions.forEach((session) => {
    const item = document.createElement("li");
    item.className = "dashboard-session-item";

    const date = new Date(session.finishedAt);
    const dateString = date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const timeString = date.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
    const completedMinutes = Math.round((session.completed || 0) / 60);

    item.innerHTML = `
      <span class="dashboard-session-date">${dateString} - ${timeString}</span>
      <span class="dashboard-session-detail">${session.duration} min session - ${completedMinutes} min completed</span>
    `;

    dashboardSessionList.appendChild(item);
  });
}

function renderUser(user) {
  currentUser = user;
  dashboardHeading.textContent = `Welcome back, ${user.name}.`;
  dashboardCopy.textContent = "Your account now has its own private meditation dashboard with recent sessions, totals, and a gentle rhythm tracker.";
  dashboardAvatar.src = user.picture || "https://www.gravatar.com/avatar/?d=mp";
  dashboardAvatar.alt = `${user.name} avatar`;
  dashboardName.textContent = user.name;
  dashboardEmail.textContent = user.email;
  dashboardAdminLink.style.display = user.role === "admin" ? "inline-flex" : "none";
}

async function loadUser() {
  const response = await fetch("/api/auth/me", { credentials: "include" });

  if (!response.ok) {
    window.location.href = "/login.html?mode=login";
    return null;
  }

  const { user } = await response.json();
  renderUser(user);
  return user;
}

async function loadStats() {
  try {
    const response = await fetch("/api/stats");
    if (!response.ok) {
      throw new Error("stats unavailable");
    }

    const stats = await response.json();
    renderStats(stats);
  } catch {
    if (netlifyHosted && currentUser) {
      renderStats(calculateStats(getLocalSessions()));
    }
  }
}

async function loadSessions() {
  try {
    const response = await fetch("/api/sessions");
    if (!response.ok) {
      throw new Error("sessions unavailable");
    }

    const data = await response.json();
    renderSessions(data.sessions || []);
  } catch {
    if (netlifyHosted && currentUser) {
      renderSessions(getLocalSessions());
      return;
    }

    renderSessions([]);
  }
}

async function logout() {
  try {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
  } finally {
    window.location.href = "/login.html?mode=login";
  }
}

dashboardLogoutButton.addEventListener("click", logout);

async function initializeDashboard() {
  const user = await loadUser();
  if (!user) {
    return;
  }

  await loadStats();
  await loadSessions();
}

initializeDashboard();
