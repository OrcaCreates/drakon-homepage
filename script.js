console.log("Drakon loaded.");

// Register the service worker so the homepage is installable as a PWA.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("sw.js").catch(function (e) {
      console.warn("Service worker registration failed:", e.message);
    });
  });
}

document.addEventListener("DOMContentLoaded", function () {
  const dropdown = document.getElementById("dragons-dropdown");
  const toggle = document.getElementById("dragons-toggle");

  // Detect touch / non-hover devices. On hover-capable devices the CSS
  // @media (hover: hover) rule handles opening, so JS stays out of the way.
  const isHoverDevice = window.matchMedia("(hover: hover)").matches;

  if (!isHoverDevice && toggle && dropdown) {
    // Tap to open/close the dropdown.
    toggle.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      const isOpen = dropdown.classList.toggle("open");
      toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });

    // Tap outside closes it.
    document.addEventListener("click", function (e) {
      if (!dropdown.contains(e.target)) {
        dropdown.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  // Mobile hamburger menu.
  const navToggle = document.getElementById("nav-toggle");
  const mobileMenu = document.getElementById("mobile-menu");
  if (navToggle && mobileMenu) {
    function setMenu(open) {
      mobileMenu.classList.toggle("open", open);
      navToggle.classList.toggle("open", open);
      navToggle.setAttribute("aria-expanded", open ? "true" : "false");
    }
    navToggle.addEventListener("click", function (e) {
      e.stopPropagation();
      setMenu(!mobileMenu.classList.contains("open"));
    });
    // Tapping a link closes the menu.
    mobileMenu.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () { setMenu(false); });
    });
    // Tapping outside closes it.
    document.addEventListener("click", function (e) {
      if (mobileMenu.classList.contains("open") &&
          !mobileMenu.contains(e.target) && !navToggle.contains(e.target)) {
        setMenu(false);
      }
    });
    // Mobile "Login" placeholder.
    const mobileLogin = document.getElementById("mobile-login");
    if (mobileLogin) {
      mobileLogin.addEventListener("click", function (e) {
        e.preventDefault();
        alert("Login coming soon");
      });
    }
  }

  // Login placeholder.
  const login = document.getElementById("login");
  if (login) {
    login.addEventListener("click", function (e) {
      e.preventDefault();
      alert("Login coming soon");
    });
  }

  // Waitlist form. The browser handles "required" validation natively; this
  // only runs once both fields are valid. On success it opens the modal and
  // swaps the form for an "Already signed up" confirmation. No network call yet.
  const waitlistForm = document.getElementById("waitlist-form");
  const modal = document.getElementById("waitlist-modal");

  function closeModal() {
    if (!modal) return;
    modal.hidden = true;
    document.body.style.overflow = ""; // restore scrolling
  }

  if (waitlistForm) {
    waitlistForm.addEventListener("submit", async function (e) {
      // Let the browser show its native "please fill out this field" message
      // if anything required is empty/invalid.
      if (!waitlistForm.checkValidity()) return;

      e.preventDefault();
      // Send to EmailOctopus API
      const nameField = waitlistForm.querySelector('input[type="text"], input[name="name"]');
      const emailField = waitlistForm.querySelector('input[type="email"], input[name="email"]');
      const name = nameField ? nameField.value.trim() : '';
      const email = emailField ? emailField.value.trim() : '';

      try {
        const response = await fetch("/.netlify/functions/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, name }),
        });
        const data = await response.json();
        if (!response.ok && data.error?.code !== "MEMBER_EXISTS_WITH_EMAIL_ADDRESS") {
          console.error("Signup error:", data);
        }
      } catch (err) {
        console.error('Network error:', err);
      }

      // Swap the form area for the confirmation state.
      waitlistForm.hidden = true;
      const note = document.getElementById("waitlist-note");
      if (note) note.hidden = true;
      const confirm = document.getElementById("waitlist-confirm");
      if (confirm) confirm.hidden = false;

      // Open the centered modal and lock body scroll.
      if (modal) {
        modal.hidden = false;
        document.body.style.overflow = "hidden";
      }
    });
  }

  if (modal) {
    // Close via the X button.
    const closeBtn = document.getElementById("modal-close");
    if (closeBtn) closeBtn.addEventListener("click", closeModal);

    // Close when clicking the dark overlay (but not the modal box itself).
    modal.addEventListener("click", function (e) {
      if (e.target === modal) closeModal();
    });

    // Close on Escape.
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !modal.hidden) closeModal();
    });
  }

  // FAQ accordion — single-open. Clicking a closed question closes any other
  // open item first, then opens this one; clicking an open question closes it.
  // CSS handles the smooth animation via the .open class.
  const faqItems = document.querySelectorAll(".faq-item");
  faqItems.forEach(function (item) {
    const question = item.querySelector(".faq-question");
    if (!question) return;
    question.addEventListener("click", function () {
      const isOpen = item.classList.contains("open");
      // Close everything first.
      faqItems.forEach(function (other) {
        other.classList.remove("open");
      });
      // If this item wasn't already open, open it now.
      if (!isOpen) {
        item.classList.add("open");
      }
    });
  });

  // Smooth scroll for in-page anchor links (logo, Pricing, Get Started).
  // CSS scroll-behavior: smooth handles most of this; this fallback ensures
  // anchors with href="#..." scroll smoothly even if that isn't honored.
  document.querySelectorAll('a[href^="#"]').forEach(function (link) {
    link.addEventListener("click", function (e) {
      const targetId = link.getAttribute("href");
      if (targetId === "#") return; // dragon placeholder rows
      const target = document.querySelector(targetId);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  });
});
