"use strict";

var AUTH_EMAIL_DOMAIN = "@nailmaker.local";
var authMode = "login";
var AUTH_NAME_MIN = 3;
var AUTH_NAME_MAX = 20;
var AUTH_NAME_PATTERN = /^[A-Za-z0-9_.\-]+$/;
var AUTH_SIGNUP_COOLDOWN_MS = 30 * 60 * 1000;
var AUTH_SIGNUP_KEY = "nailMakerLastSignup";

function authSignupWaitMs() {
  try {
    var last = Number(localStorage.getItem(AUTH_SIGNUP_KEY)) || 0;
    return Math.max(0, last + AUTH_SIGNUP_COOLDOWN_MS - Date.now());
  } catch (e) { return 0; }
}

function authNoteSignup() {
  try { localStorage.setItem(AUTH_SIGNUP_KEY, String(Date.now())); } catch (e) { }
}

function usernameToEmail(username) {
  var clean = username.trim().toLowerCase().replace(/[^a-z0-9_\-\.]/g, "");
  return clean + AUTH_EMAIL_DOMAIN;
}

function showAuthOverlay(mode) {
  authMode = mode;
  el.authTitle.textContent = mode === "signup" ? "sign up" : "log in";
  el.btnAuthSubmit.textContent = mode === "signup" ? "create account" : "log in";
  el.linkAuthSwitch.textContent = mode === "signup" ? "have an account? log in" : "need an account? sign up";
  el.authError.textContent = "";
  el.authUsername.value = "";
  el.authPassword.value = "";
  el.authUsername.maxLength = mode === "signup" ? AUTH_NAME_MAX : 64;
  el.authOverlay.style.display = "flex";
  el.authUsername.focus();
}

function hideAuthOverlay() {
  el.authOverlay.style.display = "none";
}

el.btnAuthClose.addEventListener("click", hideAuthOverlay);

el.linkAuthSwitch.addEventListener("click", function (e) {
  e.preventDefault();
  showAuthOverlay(authMode === "signup" ? "login" : "signup");
});

el.btnAuthToggle.addEventListener("click", function () {
  var user = currentAuthUser();
  if (user) {
    firebase.auth().signOut();
  } else {
    showAuthOverlay("login");
  }
});

function submitAuthForm() {
  var username = el.authUsername.value.trim();
  var password = el.authPassword.value;
  el.authError.textContent = "";

  if (authMode === "signup") {
    if (username.length < AUTH_NAME_MIN || username.length > AUTH_NAME_MAX) {
      el.authError.textContent = "username must be " + AUTH_NAME_MIN + " to " + AUTH_NAME_MAX + " characters";
      return;
    }
    if (!AUTH_NAME_PATTERN.test(username)) {
      el.authError.textContent = "username can only use letters, numbers, _ . and -, no spaces";
      return;
    }
    var wait = authSignupWaitMs();
    if (wait > 0) {
      el.authError.textContent = "you just made an account -- try again in " + Math.ceil(wait / 60000) + " min";
      return;
    }
  } else if (username.length < 1) {
    el.authError.textContent = "enter your username";
    return;
  }
  if (password.length < 6) {
    el.authError.textContent = "password must be at least 6 characters";
    return;
  }

  var email = usernameToEmail(username);
  el.btnAuthSubmit.disabled = true;

  var request = authMode === "signup"
    ? firebase.auth().createUserWithEmailAndPassword(email, password)
        .then(function (cred) { authNoteSignup(); return cred.user.updateProfile({ displayName: username }); })
        .then(function () { if (typeof cloudSaveLifetime === "function") cloudSaveLifetime(); })
    : firebase.auth().signInWithEmailAndPassword(email, password);

  request
    .then(function () {
      el.btnAuthSubmit.disabled = false;
      hideAuthOverlay();
    })
    .catch(function (err) {
      el.btnAuthSubmit.disabled = false;
      el.authError.textContent = friendlyAuthError(err);
    });
}

function friendlyAuthError(err) {
  switch (err.code) {
    case "auth/email-already-in-use": return "that username is already taken";
    case "auth/user-not-found": return "no account with that username";
    case "auth/wrong-password": return "wrong password";
    case "auth/invalid-credential":
    case "auth/invalid-login-credentials": return authMode === "signup" ? "could not create that account" : "wrong username or password";
    case "auth/too-many-requests": return "too many tries -- wait a few minutes and try again";
    case "auth/network-request-failed": return "no connection -- check your internet and try again";
    case "auth/user-disabled": return "that account has been disabled";
    case "auth/weak-password": return "password must be at least 6 characters";
    case "auth/invalid-email": return "that username has characters it can't use -- letters and numbers work best";
    default: return "could not log in (" + (err.code || "unknown error") + ")";
  }
}

el.authUsername.addEventListener("input", function () {
  if (authMode === "signup") el.authUsername.value = el.authUsername.value.replace(/[^A-Za-z0-9_.\-]/g, "").slice(0, AUTH_NAME_MAX);
});

el.btnAuthSubmit.addEventListener("click", submitAuthForm);
el.authPassword.addEventListener("keydown", function (e) {
  if (e.key === "Enter") submitAuthForm();
});

firebase.auth().onAuthStateChanged(function (user) {
  el.btnAuthToggle.textContent = user ? "log out (" + (user.displayName || "player") + ")" : "log in / sign up";
  if (typeof renderLeaderboard === "function") renderLeaderboard();
});

firebase.auth().onAuthStateChanged(function (user) {
  if (!user || typeof db === "undefined") return;
  db.collection("banned").doc(user.uid).get().then(function (doc) {
    if (!doc.exists || !doc.data().destroyed) return;
    return firebase.auth().signOut().then(function () {
      showAuthOverlay("login");
      el.authError.textContent = "no account with that username";
    });
  }).catch(function () { });
});
