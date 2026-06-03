/* Records a single page visit for the admin dashboard.
 *
 * Called by a small beacon on the homepage. We read the visitor's approximate
 * location from Netlify's geo header (no extra IP-lookup service needed) and
 * store one record per visit in a Netlify Blobs store.
 *
 * Netlify Blobs is available to functions at runtime with no extra config when
 * deployed on Netlify. Locally (without `netlify dev`) this won't run — that's
 * expected; the dashboard falls back to demo data.
 */
const { getStore } = require("@netlify/blobs");

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const body = event.body ? JSON.parse(event.body) : {};

    // Netlify provides geo as a base64-encoded JSON in the x-nf-geo header.
    let geo = {};
    const geoHeader = event.headers["x-nf-geo"];
    if (geoHeader) {
      try {
        geo = JSON.parse(Buffer.from(geoHeader, "base64").toString("utf8"));
      } catch (_) {}
    }

    const now = Date.now();
    const id = now + "-" + Math.random().toString(36).slice(2, 8);

    const record = {
      id,
      ts: now,
      path: body.path || "/",
      referrer: body.referrer || "",
      duration: Number(body.duration) || 0,
      city: geo.city || "",
      country: (geo.country && (geo.country.name || geo.country.code)) || "",
      lat: geo.latitude != null ? geo.latitude : null,
      lng: geo.longitude != null ? geo.longitude : null,
    };

    const store = getStore("drakon-visits");
    await store.setJSON(id, record);

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
