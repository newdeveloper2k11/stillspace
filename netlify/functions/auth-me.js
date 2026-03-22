const { json, getSessionUser } = require("./_auth-helpers");

exports.handler = async function handler(event) {
  if (event.httpMethod !== "GET") {
    return json(405, { error: "Method not allowed" });
  }

  const user = getSessionUser(event);
  if (!user) {
    return json(401, { error: "Not authenticated" });
  }

  return json(200, { user });
};
