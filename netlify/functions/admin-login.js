/* Verifies admin credentials server-side so the password is never exposed in
 * client code. Set these in Netlify → Site settings → Environment variables:
 *   ADMIN_USERNAME   - the admin username
 *   ADMIN_PASSWORD   - the admin password
 *   ADMIN_TOKEN      - a long random string; returned on success and required
 *                      by admin-data.js to authorize data requests.
 */
exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { username, password } = JSON.parse(event.body || "{}");

    const okUser = username === process.env.ADMIN_USERNAME;
    const okPass = password === process.env.ADMIN_PASSWORD;

    if (okUser && okPass) {
      return {
        statusCode: 200,
        body: JSON.stringify({ token: process.env.ADMIN_TOKEN || "ok" }),
      };
    }

    return { statusCode: 401, body: JSON.stringify({ error: "Invalid credentials" }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
