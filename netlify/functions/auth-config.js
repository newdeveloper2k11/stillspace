exports.handler = async function handler() {
  const googleClientId = process.env.GOOGLE_CLIENT_ID || "";

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify({ googleClientId }),
  };
};
