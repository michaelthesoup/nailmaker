"use strict";

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
  }
  updateDarkModeButtonLabel();
}

if (el.btnDarkMode) {
  el.btnDarkMode.addEventListener("click", function () {
    setDarkMode(!isDarkModeActive());
  });
  updateDarkModeButtonLabel();
}
