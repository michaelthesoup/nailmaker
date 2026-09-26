"use strict";

// ----------------------------------------------------------------
// Dark mode toggle. The actual theme is applied synchronously in an
// inline <script> in <head> (before the page paints, to avoid a flash
// of the wrong theme) -- this file only handles the button that lets
// the player switch it, and keeps the preference in localStorage.
// ----------------------------------------------------------------

var DARK_MODE_STORAGE_KEY = "nailMakerTheme";

function isDarkModeActive() {
  return document.documentElement.getAttribute("data-theme") === "dark";
}

function updateDarkModeButtonLabel() {
  if (!el.btnDarkMode) return;
  el.btnDarkMode.textContent = isDarkModeActive() ? "light mode" : "dark mode";
}

function setDarkMode(enabled) {
  if (enabled) {
    document.documentElement.setAttribute("data-theme", "dark");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
  try {
    localStorage.setItem(DARK_MODE_STORAGE_KEY, enabled ? "dark" : "light");
  } catch (e) {
    // localStorage unavailable -- theme just won't persist across reloads, harmless
  }
  updateDarkModeButtonLabel();
}

if (el.btnDarkMode) {
  el.btnDarkMode.addEventListener("click", function () {
    setDarkMode(!isDarkModeActive());
  });
  updateDarkModeButtonLabel();
}
