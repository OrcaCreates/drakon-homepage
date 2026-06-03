/* Returns the admin dashboard payload: aggregated visit stats + locations from
 * Netlify Blobs, and waitlist signups from EmailOctopus.
 *
 * Authorization: requires the x-admin-token header to match ADMIN_TOKEN
 * (the same token admin-login.js hands out on a successful login).
 *
 * Env vars required:
 *   ADMIN_TOKEN            - shared secret gating this endpoint
 *   EMAILOCTOPUS_API_KEY   - to read the contact list
 */
const { getStore } = require("@netlify/blobs");

const LIST_ID = "c7d13ede-4d81-11f1-b5bd-03a9b8e421f4";

exports.handler = async function (event) {
  // ---- Auth ----
  const token = event.headers["x-admin-token"];
  if (!token || token !== (process.env.ADMIN_TOKEN || "ok")) {
    return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
  }

  try {
    const visits = await readVisits();
    const signups = await readSignups();

    // ---- Aggregate visit stats ----
    const now = Date.now();
    const FIVE_MIN = 5 * 60 * 1000;

    const countrySet = new Set();
    const referrerCounts = {};
    let durationSum = 0;
    let durationCount = 0;
    let liveNow = 0;

    visits.forEach(function (v) {
      if (v.country) countrySet.add(v.country);
      if (v.duration) { durationSum += v.duration; durationCount++; }
      if (now - v.ts < FIVE_MIN) liveNow++;
      const src = referrerSource(v.referrer);
      referrerCounts[src] = (referrerCounts[src] || 0) + 1;
    });

    // Most recent visits → live feed + globe points.
    const sorted = visits.slice().sort((a, b) => b.ts - a.ts);
    const feed = sorted.slice(0, 12).map((v) => ({
      city: v.city,
      country: v.country,
      ago: timeAgo(now - v.ts),
    }));
    const locations = sorted
      .filter((v) => v.lat != null && v.lng != null)
      .slice(0, 200)
      .map((v) => ({ city: v.city, country: v.country, lat: v.lat, lng: v.lng }));

    const referrers = Object.entries(referrerCounts)
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    return {
      statusCode: 200,
      body: JSON.stringify({
        totalVisitors: visits.length,
        liveNow,
        totalSignups: signups.length,
        countries: countrySet.size,
        avgTime: durationCount ? Math.round(durationSum / durationCount) : null,
        locations,
        feed,
        signups,
        referrers,
      }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

/* Read all visit records from the blob store. */
async function readVisits() {
  const store = getStore("drakon-visits");
  const { blobs } = await store.list();
  const out = [];
  for (const b of blobs) {
    const rec = await store.get(b.key, { type: "json" });
    if (rec) out.push(rec);
  }
  return out;
}

/* Read contacts from EmailOctopus (first page, up to 100). */
async function readSignups() {
  const key = process.env.EMAILOCTOPUS_API_KEY;
  if (!key) return [];
  const url =
    "https://emailoctopus.com/api/1.6/lists/" + LIST_ID +
    "/contacts?api_key=" + encodeURIComponent(key) + "&limit=100";
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok || !Array.isArray(data.data)) return [];
  return data.data.map(function (c) {
    return {
      name: (c.fields && c.fields.FirstName) || "",
      email: c.email_address || "",
      joined: c.created_at ? new Date(c.created_at).toLocaleDateString() : "",
    };
  });
}

function referrerSource(ref) {
  if (!ref) return "Direct";
  try {
    return new URL(ref).hostname.replace(/^www\./, "");
  } catch (_) {
    return "Direct";
  }
}

function timeAgo(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 60) return s + "s ago";
  const m = Math.floor(s / 60);
  if (m < 60) return m + "m ago";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h ago";
  return Math.floor(h / 24) + "d ago";
}
