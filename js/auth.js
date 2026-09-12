"use strict";

// ----------------------------------------------------------------
// Auth. Firebase's password auth wants an email, not a bare username --
// so behind the scenes we turn "someuser" into "someuser@nailmaker.local"
// before ever talking to Firebase. The player only ever sees "username."
// The real display name (what shows on the leaderboard) is stored as
// the Firebase user's displayName.
// ----------------------------------------------------------------

var AUTH_EMAIL_DOMAIN = "@nailmaker.local";
var authMode = "login"; // or "signup"

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

  if (username.length < 3) {
    el.authError.textContent = "username must be at least 3 characters";
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
        .then(function (cred) { return cred.user.updateProfile({ displayName: username }); })
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

// Firebase's raw error messages mention "email" and Firebase-specific
// codes -- reworded here since the player only ever sees "username."
function friendlyAuthError(err) {
  switch (err.code) {
    case "auth/email-already-in-use": return "that username is already taken";
    case "auth/user-not-found": return "no account with that username";
    case "auth/wrong-password": return "wrong password";
    case "auth/weak-password": return "password must be at least 6 characters";
    case "auth/invalid-email": return "that username has characters it can't use -- letters and numbers work best";
    default: return err.message;
  }
}

el.btnAuthSubmit.addEventListener("click", submitAuthForm);
el.authPassword.addEventListener("keydown", function (e) {
  if (e.key === "Enter") submitAuthForm();
});

firebase.auth().onAuthStateChanged(function (user) {
  el.btnAuthToggle.textContent = user ? "log out (" + (user.displayName || "player") + ")" : "log in / sign up";
  if (typeof renderLeaderboard === "function") renderLeaderboard();
});
