/* Drakon dragon chat.
 *
 * POST { message, dragon, userId }
 *   -> reads the seller's profile from Supabase (user_profiles)
 *   -> runs the chosen dragon's persona on claude-sonnet-4-6
 *   -> saves anything new it learned back to the profile
 *   -> returns { reply, saved: [fields] }
 *
 * Env vars required (Netlify → Site settings → Environment variables):
 *   ANTHROPIC_API_KEY     - Claude API key
 *   SUPABASE_SERVICE_KEY  - Supabase service_role key (secret; bypasses RLS so
 *                           the function can read/write any user's profile row)
 */
const Anthropic = require("@anthropic-ai/sdk");

const SUPABASE_URL = "https://dvbkjzmhdsxswbarowbd.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment

// Fields a dragon is allowed to write to the profile.
const ALLOWED_FIELDS = [
  "business_model", "niche", "budget", "time_availability", "interests",
  "products", "store_style", "ad_copy", "social_plan", "notes",
];

const SHARED =
  "You are one of the six AI dragons in Drakon — an app that guides FIRST-TIME " +
  "ecommerce sellers from idea to a running store. Speak in plain, encouraging " +
  "language for a total beginner. Be concise and practical. Never claim you've " +
  "taken real actions you can't take (you can't publish a store or send real " +
  "emails) — produce the content/plan and explain how to use it. Stay in your lane.";

const DRAGONS = {
  vael: {
    name: "Vael",
    persona:
      "You are Vael: a serious, strategic mentor — calm, direct, big-picture. " +
      "Your job: help the seller choose a business MODEL (dropshipping, print on " +
      "demand, or another ecommerce model) and a NICHE. Ask about their budget, " +
      "available time, and interests, then give a clear recommendation. When they " +
      "decide, lock in business_model and niche (and capture budget, " +
      "time_availability, interests).",
  },
  cryo: {
    name: "Cryo",
    persona:
      "You are Cryo: energetic and data-obsessed — you LOVE trends and numbers. " +
      "Your job: based on the seller's niche, suggest about 10 strong product ideas, " +
      "each with a quick reason (demand, trend, or margin). Get excited. If you don't " +
      "know their niche yet, ask for it. Capture the product list in `products`.",
  },
  terra: {
    name: "Terra",
    persona:
      "You are Terra: warm and creative. Your job: using the seller's niche and " +
      "products, give specific Shopify store customization advice — theme vibe, " +
      "colors, fonts, layout, homepage sections — tailored to their style. Capture " +
      "the direction you land on in `store_style`.",
  },
  vexa: {
    name: "Vexa",
    persona:
      "You are Vexa: a confident, bold marketer. Your job: using the seller's store " +
      "style and products, write scroll-stopping ad copy (hooks, headlines, primary " +
      "text) for platforms like Meta and TikTok. Capture the copy in `ad_copy`.",
  },
  aurora: {
    name: "Aurora",
    persona:
      "You are Aurora: bubbly and obsessed with social media. Your job: using the " +
      "seller's ads, help them post and grow on Facebook, TikTok, and Instagram — " +
      "captions, hooks, posting cadence, hashtags. Capture the plan in `social_plan`.",
  },
  lyric: {
    name: "Lyric",
    persona:
      "You are Lyric: friendly and deeply empathetic. Your job: using everything " +
      "known about the seller and their store, write warm, professional customer " +
      "email/message responses. Capture anything useful in `notes`.",
  },
};

/* ---------- Supabase REST helpers (never fatal to the chat) ---------- */
async function readProfile(userId) {
  if (!userId) return {};
  try {
    const url =
      `${SUPABASE_URL}/rest/v1/user_profiles?user_id=eq.${encodeURIComponent(userId)}&select=*`;
    const res = await fetch(url, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    if (!res.ok) return {};
    const rows = await res.json();
    return Array.isArray(rows) && rows[0] ? rows[0] : {};
  } catch (_) {
    return {};
  }
}

async function saveProfile(userId, updates) {
  if (!userId || !updates || Object.keys(updates).length === 0) return [];
  try {
    const row = { user_id: userId, ...updates, updated_at: new Date().toISOString() };
    const url = `${SUPABASE_URL}/rest/v1/user_profiles?on_conflict=user_id`;
    await fetch(url, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify([row]),
    });
    return Object.keys(updates);
  } catch (_) {
    return [];
  }
}

/* Pull a JSON object out of the model's text, tolerating stray prose/fences. */
function parseModelJSON(text) {
  let t = (text || "").trim();
  if (t.startsWith("```")) t = t.replace(/^```(json)?/i, "").replace(/```\s*$/, "").trim();
  const a = t.indexOf("{");
  const b = t.lastIndexOf("}");
  if (a !== -1 && b !== -1 && b > a) t = t.slice(a, b + 1);
  try { return JSON.parse(t); } catch (_) { return null; }
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { message, dragon, userId } = JSON.parse(event.body || "{}");

    const persona = DRAGONS[dragon];
    if (!persona) return { statusCode: 400, body: JSON.stringify({ error: "Unknown dragon" }) };
    if (!message) return { statusCode: 400, body: JSON.stringify({ error: "No message" }) };

    // 1) Read what we already know about this seller.
    const profile = await readProfile(userId);

    // 2) Ask the dragon. Stable persona first (cacheable), volatile profile after.
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      system: [
        {
          type: "text",
          text: `${SHARED}\n\n${persona.persona}`,
          cache_control: { type: "ephemeral" },
        },
        {
          type: "text",
          text:
            `What we already know about this seller (saved profile):\n` +
            `${JSON.stringify(profile)}\n\n` +
            `Use this context. Reply to the seller's latest message in your personality.\n\n` +
            `Then capture anything NEW or CHANGED you learned this turn.\n\n` +
            `Return ONLY a single JSON object (no markdown, no extra text), exactly:\n` +
            `{"reply": "<your message to the seller>", "profile_updates": { ...only new/changed fields... }}\n\n` +
            `Valid profile_updates keys: ${ALLOWED_FIELDS.join(", ")}. ` +
            `Use string values. Use {} for profile_updates if you learned nothing new.`,
        },
      ],
      messages: [{ role: "user", content: message }],
    });

    const raw = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");

    // 3) Parse reply + updates (defensively).
    const parsed = parseModelJSON(raw);
    let reply;
    let updates = {};
    if (parsed && typeof parsed.reply === "string") {
      reply = parsed.reply;
      if (parsed.profile_updates && typeof parsed.profile_updates === "object") {
        updates = parsed.profile_updates;
      }
    } else {
      reply = raw; // model didn't return JSON — still show the seller something
    }

    // Keep only allowed, non-empty fields.
    const clean = {};
    for (const k of ALLOWED_FIELDS) {
      const v = updates[k];
      if (v != null && String(v).trim() !== "") clean[k] = v;
    }

    // 4) Save what the dragon learned.
    const saved = await saveProfile(userId, clean);

    return { statusCode: 200, body: JSON.stringify({ reply, saved }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
