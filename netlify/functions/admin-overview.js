const { json, getSessionUser } = require("./_auth-helpers");

exports.handler = async function handler(event) {
  if (event.httpMethod !== "GET") {
    return json(405, { error: "Method not allowed" });
  }

  const user = getSessionUser(event);
  if (!user) {
    return json(401, { error: "Not authenticated" });
  }

  if (user.role !== "admin") {
    return json(403, { error: "Admin access required" });
  }

  return json(200, {
    totalUsers: 1,
    totalAdmins: 1,
    totalSessions: 0,
    totalMinutes: 0,
    todaySessions: 0,
    recentUsers: [
      {
        name: user.name,
        email: user.email,
        role: user.role,
        lastLoginAt: new Date().toISOString(),
      },
    ],
    recentSessions: [],
  });
};
