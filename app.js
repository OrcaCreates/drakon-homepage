/* Drakon PWA — dragon picker + chat.
 *
 * Picking a dragon opens a chat. Each message POSTs the full conversation to
 * /.netlify/functions/chat, which runs Claude with that dragon's persona.
 * If the function isn't reachable (e.g. previewing on a plain local server),
 * we fall back to a clearly-labeled demo reply so the UI still works.
 */

const DRAGONS = [
  { key: "vexa",   name: "Vexa",   role: "Writes your ads",          color: "#FF4D2E", img: "images/Vexahead.png",
    greeting: "Hey, I'm Vexa. Tell me what you're selling and who it's for, and I'll write ads that stop the scroll." },
  { key: "aurora", name: "Aurora", role: "Makes your social posts",  color: "#E91E63", img: "images/Aurorahead.png",
    greeting: "Hi! I'm Aurora. What are we posting about today — TikTok, Instagram, X? Tell me your vibe." },
  { key: "terra",  name: "Terra",  role: "Builds your store",        color: "#7CB342", img: "images/Terrahead.png",
    greeting: "I'm Terra. Give me a product and I'll write descriptions and store pages that actually convert." },
  { key: "lyric",  name: "Lyric",  role: "Handles your customers",   color: "#26C6DA", img: "images/Lyrichead.png",
    greeting: "Hey, I'm Lyric. Paste a customer message and I'll draft a friendly, on-brand reply." },
  { key: "cryo",   name: "Cryo",   role: "Tracks what's working",    color: "#90CAF9", img: "images/Cryohead.png",
    greeting: "I'm Cryo. Paste your sales or ad numbers and I'll tell you what to scale and what to cut." },
  { key: "vael",   name: "Vael",   role: "Plans your next move",     color: "#7E57C2", img: "images/Vaelhead.png",
    greeting: "I'm Vael. Tell me where your store is at and I'll map out the smartest next move." },
];

const picker = document.getElementById("picker");
const pickerGrid = document.getElementById("picker-grid");
const chat = document.getElementById("chat");
const messagesEl = document.getElementById("messages");
const composer = document.getElementById("composer");
const input = document.getElementById("composer-input");
const sendBtn = document.getElementById("send-btn");

let current = null;       // active dragon object
let history = [];         // [{ role: "user"|"assistant", content: string }]
let sending = false;

/* ---------- Picker ---------- */
DRAGONS.forEach(function (d) {
  const card = document.createElement("button");
  card.className = "dragon-pick";
  card.style.borderColor = d.color;
  card.style.boxShadow = "0 0 24px " + hexA(d.color, 0.25);
  card.innerHTML =
    '<img src="' + d.img + '" alt="' + d.name + '">' +
    '<span class="pick-name">' + d.name + "</span>" +
    '<span class="pick-role">' + d.role + "</span>";
  card.addEventListener("click", () => openChat(d));
  pickerGrid.appendChild(card);
});

/* ---------- Chat open/close ---------- */
function openChat(d) {
  current = d;
  history = [];
  messagesEl.innerHTML = "";

  document.getElementById("chat-avatar").src = d.img;
  document.getElementById("chat-name").textContent = d.name;
  document.getElementById("chat-role").textContent = d.role;

  picker.hidden = true;
  chat.hidden = false;

  addBubble("dragon", d.greeting); // greeting is display-only, not sent to the API
  input.focus();
}

document.getElementById("back-btn").addEventListener("click", function () {
  chat.hidden = true;
  picker.hidden = false;
  current = null;
});

/* ---------- Sending ---------- */
composer.addEventListener("submit", function (e) {
  e.preventDefault();
  send();
});

// Enter sends; Shift+Enter makes a newline.
input.addEventListener("keydown", function (e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    send();
  }
});

// Auto-grow the textarea.
input.addEventListener("input", function () {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 140) + "px";
});

async function send() {
  if (sending || !current) return;
  const text = input.value.trim();
  if (!text) return;

  addBubble("user", text);
  history.push({ role: "user", content: text });
  input.value = "";
  input.style.height = "auto";

  sending = true;
  sendBtn.disabled = true;
  const typing = addBubble("dragon typing", current.name + " is thinking…");

  try {
    const res = await fetch("/.netlify/functions/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dragon: current.key, messages: history }),
    });
    if (!res.ok) throw new Error("chat endpoint returned " + res.status);
    const data = await res.json();
    typing.remove();
    const reply = data.reply || "(no reply)";
    addBubble("dragon", reply);
    history.push({ role: "assistant", content: reply });
  } catch (err) {
    typing.remove();
    // Local preview / offline: the function isn't available.
    addBubble(
      "dragon error",
      "⚠️ Demo mode — the AI backend isn't reachable here. Deploy to Netlify with an ANTHROPIC_API_KEY set and " +
        current.name + " will reply for real. (" + err.message + ")"
    );
  } finally {
    sending = false;
    sendBtn.disabled = false;
    input.focus();
  }
}

/* ---------- Helpers ---------- */
function addBubble(cls, text) {
  const el = document.createElement("div");
  el.className = "msg " + cls;
  el.textContent = text;
  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return el;
}

function hexA(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + alpha + ")";
}

/* ---------- Service worker (PWA install + offline) ---------- */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("sw.js").catch(function (e) {
      console.warn("Service worker registration failed:", e.message);
    });
  });
}
