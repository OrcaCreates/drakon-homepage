/* Drakon auth — Supabase login / signup / remember-me.
 *
 * The publishable key is meant to be used in client-side code (it's the public
 * anon-style key; protect your data with Row Level Security in Supabase).
 * Requires the Supabase JS library loaded before this file:
 *   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
 */
const SUPABASE_URL = "https://dvbkjzmhdsxswbarowbd.supabase.co";
const SUPABASE_KEY = "sb_publishable_-aWKAdaPM7wyGBa5vVf-lQ_py0wF5Mw";

const REMEMBER_KEY = "drakon_remember";
const REMEMBER_EMAIL = "drakon_remember_email";

/* Remember me controls WHERE the session is stored:
 *   remembered  -> localStorage  (survives closing the browser)
 *   not         -> sessionStorage (cleared when the tab/app closes)
 * We read the saved preference at load so protected pages use the same store
 * the session was written to. Default is "remember". */
function rememberPref() {
  return localStorage.getItem(REMEMBER_KEY) !== "false";
}

function makeClient(remember) {
  return window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storage: remember ? window.localStorage : window.sessionStorage,
    },
  });
}

let client = makeClient(rememberPref());

const DrakonAuth = {
  get client() { return client; },

  async login(email, password, remember) {
    localStorage.setItem(REMEMBER_KEY, remember ? "true" : "false");
    // Rebuild the client so the new session lands in the chosen storage.
    client = makeClient(remember);
    if (remember) localStorage.setItem(REMEMBER_EMAIL, email);
    else localStorage.removeItem(REMEMBER_EMAIL);
    return client.auth.signInWithPassword({ email, password });
  },

  async signup(email, password) {
    return client.auth.signUp({ email, password });
  },

  async logout() {
    await client.auth.signOut();
    location.href = "index.html";
  },

  async getSession() {
    const { data } = await client.auth.getSession();
    return data.session;
  },

  /* Call on protected pages — redirects to the login page if signed out. */
  async requireAuth() {
    const session = await DrakonAuth.getSession();
    if (!session) {
      location.href = "index.html";
      return null;
    }
    return session;
  },

  rememberedEmail() {
    return localStorage.getItem(REMEMBER_EMAIL) || "";
  },
};

window.DrakonAuth = DrakonAuth;

/* ---- Auto-wire the login/signup form when present (index.html) ---- */
document.addEventListener("DOMContentLoaded", function () {
  const form = document.getElementById("auth-form");
  if (!form) return;

  const emailEl = document.getElementById("email");
  const passEl = document.getElementById("password");
  const rememberEl = document.getElementById("remember");
  const msgEl = document.getElementById("auth-msg");
  const loginBtn = document.getElementById("login-btn");
  const signupBtn = document.getElementById("signup-btn");

  // Prefill a remembered email.
  emailEl.value = DrakonAuth.rememberedEmail();
  if (emailEl.value) rememberEl.checked = true;

  function setMsg(text, type) {
    msgEl.textContent = text || "";
    msgEl.className = "auth-msg" + (type ? " " + type : "");
  }

  function busy(on) {
    loginBtn.disabled = on;
    signupBtn.disabled = on;
  }

  async function handle(mode) {
    const email = emailEl.value.trim();
    const password = passEl.value;
    if (!email || !password) {
      setMsg("Enter your email and password.", "error");
      return;
    }
    busy(true);
    setMsg(mode === "login" ? "Logging in…" : "Creating your account…");
    try {
      if (mode === "login") {
        const { error } = await DrakonAuth.login(email, password, rememberEl.checked);
        if (error) throw error;
        location.href = "dashboard.html";
      } else {
        const { data, error } = await DrakonAuth.signup(email, password);
        if (error) throw error;
        if (data.session) {
          // Auto-confirmed → straight into the app.
          location.href = "dashboard.html";
        } else {
          // Email confirmation required by the project settings.
          setMsg("Account created! Check your email to confirm, then log in.", "success");
        }
      }
    } catch (err) {
      setMsg(err.message || "Something went wrong.", "error");
    } finally {
      busy(false);
    }
  }

  // Login is the form's default submit (Enter key).
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    handle("login");
  });
  signupBtn.addEventListener("click", function (e) {
    e.preventDefault();
    handle("signup");
  });
});
