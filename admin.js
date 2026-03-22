const adminLogoutButton = document.getElementById("admin-logout-button");
const adminWelcomeCopy = document.getElementById("admin-welcome-copy");
const totalUsers = document.getElementById("admin-total-users");
const totalAdmins = document.getElementById("admin-total-admins");
const totalSessions = document.getElementById("admin-total-sessions");
const totalMinutes = document.getElementById("admin-total-minutes");
const todaySessions = document.getElementById("admin-today-sessions");
const adminUserList = document.getElementById("admin-user-list");
const adminSessionList = document.getElementById("admin-session-list");

function formatDate(dateValue) {
  return new Date(dateValue).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderUsers(users) {
  adminUserList.innerHTML = "";

  if (!users.length) {
    adminUserList.innerHTML = '<div class="admin-list-card"><strong>No members yet.</strong><span class="admin-meta">User accounts will appear here after Google sign-in.</span></div>';
    return;
  }

  users.forEach((user) => {
    const card = document.createElement("article");
    card.className = "admin-list-card";
    card.innerHTML = `
      <strong>${user.name}${user.role === "admin" ? '<span class="admin-pill">Admin</span>' : ""}</strong>
      <div class="admin-meta">${user.email}</div>
      <div class="admin-meta">Last login: ${formatDate(user.lastLoginAt)}</div>
    `;
    adminUserList.appendChild(card);
  });
}

function renderSessions(sessions) {
  adminSessionList.innerHTML = "";

  if (!sessions.length) {
    adminSessionList.innerHTML = '<div class="admin-list-card"><strong>No sessions yet.</strong><span class="admin-meta">Completed meditation sessions will appear here.</span></div>';
    return;
  }

  sessions.forEach((session) => {
    const completedMinutes = Math.round(session.completed / 60);
    const card = document.createElement("article");
    card.className = "admin-list-card";
    card.innerHTML = `
      <strong>${session.user ? session.user.name : "Unknown member"}</strong>
      <div class="admin-meta">${session.duration} min session - ${completedMinutes} min completed</div>
      <div class="admin-meta">${formatDate(session.finishedAt)}</div>
    `;
    adminSessionList.appendChild(card);
  });
}

function renderFallbackOverview(user) {
  totalUsers.textContent = "1";
  totalAdmins.textContent = user.role === "admin" ? "1" : "0";
  totalSessions.textContent = "0";
  totalMinutes.textContent = "0";
  todaySessions.textContent = "0";
  renderUsers([{ ...user, lastLoginAt: new Date().toISOString() }]);
  renderSessions([]);
}

async function loadDashboard() {
  const meResponse = await fetch("/api/auth/me");

  if (!meResponse.ok) {
    window.location.href = "/login.html?mode=login";
    return;
  }

  const { user } = await meResponse.json();

  if (user.role !== "admin") {
    window.location.href = "/";
    return;
  }

  adminWelcomeCopy.textContent = `Welcome back, ${user.name}. Review members, recent sessions, and overall meditation activity from one protected dashboard.`;

  const overviewResponse = await fetch("/api/admin/overview");

  if (!overviewResponse.ok) {
    renderFallbackOverview(user);
    adminWelcomeCopy.textContent = `Welcome back, ${user.name}. You are in the deployed dashboard view, so account access is working even if full shared analytics are not available on this host.`;
    return;
  }

  const overview = await overviewResponse.json();
  totalUsers.textContent = overview.totalUsers;
  totalAdmins.textContent = overview.totalAdmins;
  totalSessions.textContent = overview.totalSessions;
  totalMinutes.textContent = overview.totalMinutes;
  todaySessions.textContent = overview.todaySessions;
  renderUsers(overview.recentUsers || []);
  renderSessions(overview.recentSessions || []);
}

async function logout() {
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } finally {
    window.location.href = "/login.html?mode=login";
  }
}

adminLogoutButton.addEventListener("click", logout);
loadDashboard();
