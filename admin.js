/* Drakon admin dashboard.
 *
 * Auth: the login form posts to /.netlify/functions/admin-login, which checks
 * the credentials server-side (against env vars) and returns a token. We keep
 * the token in sessionStorage and send it with data requests. The password is
 * never stored in this file, so it isn't readable in the page source.
 *
 * Data: /.netlify/functions/admin-data returns live stats, signups, and
 * visitor locations. When that endpoint isn't available (e.g. running on a
 * plain local server with no Netlify functions), we fall back to clearly
 * labeled DEMO data so the dashboard and globe still render.
 */

const TOKEN_KEY = "drakon_admin_token";

const loginScreen = document.getElementById("login-screen");
const dashboard = document.getElementById("dashboard");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");

let globe = null;
let refreshTimer = null;

/* ---------- Auth ---------- */
loginForm.addEventListener("submit", async function (e) {
  e.preventDefault();
  loginError.hidden = true;

  const username = document.getElementById("login-username").value.trim();
  const password = document.getElementById("login-password").value;

  try {
    const res = await fetch("/.netlify/functions/admin-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    if (res.ok) {
      const { token } = await res.json();
      sessionStorage.setItem(TOKEN_KEY, token || "ok");
      showDashboard();
      return;
    }

    // 401 → bad credentials. Anything else (e.g. 404 locally) → demo login.
    if (res.status === 401) {
      loginError.hidden = false;
      return;
    }
    throw new Error("login endpoint unavailable");
  } catch (err) {
    // No functions available locally — allow a demo session so you can preview.
    console.warn("Login endpoint unavailable, starting DEMO session:", err.message);
    sessionStorage.setItem(TOKEN_KEY, "demo");
    showDashboard();
  }
});

document.getElementById("logout-btn").addEventListener("click", function () {
  sessionStorage.removeItem(TOKEN_KEY);
  if (refreshTimer) clearInterval(refreshTimer);
  dashboard.hidden = true;
  loginScreen.hidden = false;
});

/* If a token is already present (page reload during a session), skip login. */
if (sessionStorage.getItem(TOKEN_KEY)) {
  showDashboard();
}

function showDashboard() {
  loginScreen.hidden = true;
  dashboard.hidden = false;
  initQR(); // QR first, and isolate the globe so a globe error can't block it
  try { initGlobe(); } catch (e) { console.warn("Globe init failed:", e); }
  loadData();
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(loadData, 15000); // refresh every 15s
}

/* ---------- Data ---------- */
async function loadData() {
  const token = sessionStorage.getItem(TOKEN_KEY) || "";
  let data, isDemo = false;

  try {
    const res = await fetch("/.netlify/functions/admin-data", {
      headers: { "x-admin-token": token },
    });
    if (!res.ok) throw new Error("data endpoint returned " + res.status);
    data = await res.json();
  } catch (err) {
    console.warn("Using DEMO data:", err.message);
    data = demoData();
    isDemo = true;
  }

  document.getElementById("dash-mode").textContent = isDemo
    ? "DEMO DATA (deploy to Netlify for live data)"
    : "Live data";

  renderStats(data);
  renderFeed(data.feed || []);
  renderSignups(data.signups || []);
  renderReferrers(data.referrers || []);
  renderGlobe(data.locations || []);
}

function renderStats(d) {
  setText("stat-visitors", d.totalVisitors);
  setText("stat-live", d.liveNow);
  setText("stat-signups", d.totalSignups);
  setText("stat-countries", d.countries);
  setText("stat-avgtime", d.avgTime != null ? d.avgTime + "s" : "—");
}

function renderFeed(feed) {
  const ul = document.getElementById("feed-list");
  ul.innerHTML = "";
  if (!feed.length) {
    ul.innerHTML = '<li class="feed-item" style="color:rgba(255,255,255,0.4)">No recent activity.</li>';
    return;
  }
  feed.forEach(function (f) {
    const li = document.createElement("li");
    li.className = "feed-item";
    li.innerHTML =
      '<span class="feed-dot"></span>' +
      '<span class="feed-where">' + esc(f.city || "Unknown") +
      (f.country ? ", " + esc(f.country) : "") + "</span>" +
      '<span class="feed-meta">' + esc(f.ago || "") + "</span>";
    ul.appendChild(li);
  });
}

function renderSignups(rows) {
  const body = document.getElementById("signups-body");
  body.innerHTML = "";
  if (!rows.length) {
    body.innerHTML = '<tr class="empty-row"><td colspan="3">No signups yet.</td></tr>';
    return;
  }
  rows.forEach(function (r) {
    const tr = document.createElement("tr");
    tr.innerHTML =
      "<td>" + esc(r.name || "—") + "</td>" +
      "<td>" + esc(r.email || "—") + "</td>" +
      "<td>" + esc(r.joined || "—") + "</td>";
    body.appendChild(tr);
  });
}

function renderReferrers(rows) {
  const body = document.getElementById("referrers-body");
  body.innerHTML = "";
  if (!rows.length) {
    body.innerHTML = '<tr class="empty-row"><td colspan="2">No referrer data yet.</td></tr>';
    return;
  }
  rows.forEach(function (r) {
    const tr = document.createElement("tr");
    tr.innerHTML = "<td>" + esc(r.source) + "</td><td>" + esc(r.count) + "</td>";
    body.appendChild(tr);
  });
}

/* ---------- Globe ---------- */
function initGlobe() {
  if (globe || typeof Globe === "undefined") return;
  const el = document.getElementById("globe");
  globe = Globe()(el)
    .globeImageUrl("https://unpkg.com/three-globe@2.31.0/example/img/earth-night.jpg")
    .backgroundColor("rgba(0,0,0,0)")
    .showAtmosphere(true)
    .atmosphereColor("#4A9EFF")
    .atmosphereAltitude(0.18)
    .pointColor(() => "#4A9EFF")
    .pointAltitude(0.01)
    .pointRadius(0.4)
    .ringColor(() => (t) => `rgba(74,158,255,${1 - t})`)
    .ringMaxRadius(4)
    .ringPropagationSpeed(2)
    .ringRepeatPeriod(800);

  sizeGlobe();
  window.addEventListener("resize", sizeGlobe);
  // Gentle auto-rotation.
  globe.controls().autoRotate = true;
  globe.controls().autoRotateSpeed = 0.6;
}

function sizeGlobe() {
  if (!globe) return;
  const el = document.getElementById("globe");
  globe.width(el.clientWidth).height(el.clientHeight);
}

function renderGlobe(locations) {
  if (!globe) return;
  const pts = locations.filter((l) => l.lat != null && l.lng != null);
  globe.pointsData(pts).ringsData(pts);
}

/* ---------- App QR code ---------- */
const QR_URL_KEY = "drakon_app_url";
let qrReady = false;

// The QR points at the Drakon homepage by default — scanning it opens the site,
// where the PWA can be installed ("Add to Home Screen").
function homepageUrl() {
  return location.origin + "/";
}

function initQR() {
  if (qrReady) return; // wire up listeners once
  qrReady = true;

  const urlInput = document.getElementById("qr-url");
  const saved = localStorage.getItem(QR_URL_KEY);
  urlInput.value = saved || homepageUrl();

  document.getElementById("qr-update").addEventListener("click", function () {
    const v = urlInput.value.trim();
    localStorage.setItem(QR_URL_KEY, v);
    renderQR(v);
  });

  document.getElementById("qr-download").addEventListener("click", downloadQR);

  // Copy the link to the clipboard.
  document.getElementById("qr-copy").addEventListener("click", function () {
    const v = urlInput.value.trim() || homepageUrl();
    const btn = document.getElementById("qr-copy");
    const done = function () {
      btn.textContent = "Copied!";
      setTimeout(function () { btn.textContent = "Copy link"; }, 1500);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(v).then(done).catch(done);
    } else {
      urlInput.select();
      document.execCommand("copy");
      done();
    }
  });

  renderQR(urlInput.value.trim());
}

// Keep the visible/clickable link in sync with the QR's URL.
function setLink(url) {
  const a = document.getElementById("qr-link");
  if (!a) return;
  a.href = url;
  a.textContent = url;
}

function renderQR(url) {
  setLink(url || homepageUrl());
  const el = document.getElementById("qr-canvas");
  if (!el) return;

  // The vendored library may not have parsed yet — retry briefly, then show a
  // visible error instead of a silent blank-white box.
  if (typeof QRCode === "undefined") {
    renderQR._tries = (renderQR._tries || 0) + 1;
    if (renderQR._tries <= 20) {
      setTimeout(function () { renderQR(url); }, 150);
      return;
    }
    el.innerHTML =
      '<div style="color:#1A1033;font-size:12px;padding:24px;text-align:center">' +
      "QR library failed to load.<br>Check vendor/qrcode.min.js</div>";
    return;
  }
  renderQR._tries = 0;

  el.innerHTML = ""; // clear any previous render
  // qrcodejs renders a canvas (+ fallback img) into the element.
  new QRCode(el, {
    text: url || homepageUrl(),
    width: 220,
    height: 220,
    colorDark: "#1A1033",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.M,
  });
}

function downloadQR() {
  if (typeof QRCode === "undefined") return;
  const url = document.getElementById("qr-url").value.trim() || homepageUrl();
  // Render a large copy off-screen for a crisp, printable PNG.
  const tmp = document.createElement("div");
  new QRCode(tmp, {
    text: url,
    width: 1024,
    height: 1024,
    colorDark: "#1A1033",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.M,
  });
  const canvas = tmp.querySelector("canvas");
  const img = tmp.querySelector("img");
  const dataUrl = canvas ? canvas.toDataURL("image/png") : img ? img.src : null;
  if (!dataUrl) return;
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = "drakon-app-qr.png";
  a.click();
}

/* ---------- Helpers ---------- */
function setText(id, v) {
  document.getElementById(id).textContent = v != null ? v : "—";
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

/* ---------- Demo data (local preview only) ---------- */
function demoData() {
  const cities = [
    { city: "Austin", country: "USA", lat: 30.27, lng: -97.74 },
    { city: "London", country: "UK", lat: 51.51, lng: -0.13 },
    { city: "Tokyo", country: "Japan", lat: 35.68, lng: 139.69 },
    { city: "São Paulo", country: "Brazil", lat: -23.55, lng: -46.63 },
    { city: "Sydney", country: "Australia", lat: -33.87, lng: 151.21 },
    { city: "Berlin", country: "Germany", lat: 52.52, lng: 13.41 },
    { city: "Toronto", country: "Canada", lat: 43.65, lng: -79.38 },
    { city: "Mumbai", country: "India", lat: 19.08, lng: 72.88 },
  ];
  return {
    totalVisitors: 1284,
    liveNow: 7,
    totalSignups: 96,
    countries: 23,
    avgTime: 48,
    locations: cities,
    feed: cities.slice(0, 6).map((c, i) => ({ city: c.city, country: c.country, ago: i + "m ago" })),
    signups: [
      { name: "Duncan", email: "duncan@example.com", joined: "Jun 2, 2026" },
      { name: "Jane S.", email: "jane@example.com", joined: "Jun 2, 2026" },
      { name: "Marco", email: "marco@example.com", joined: "Jun 1, 2026" },
    ],
    referrers: [
      { source: "Direct", count: 612 },
      { source: "tiktok.com", count: 284 },
      { source: "instagram.com", count: 201 },
      { source: "google.com", count: 187 },
    ],
  };
}
