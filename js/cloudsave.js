"use strict";

// ----------------------------------------------------------------
// Cloud save -- only active while logged in. Reuses the exact same
// JSON.stringify(state) format as the local save button, just stored
// in Firestore under the player's own user id instead of localStorage,
// so progress follows their account across devices/browsers.
// ----------------------------------------------------------------

var CLOUD_AUTOSAVE_INTERVAL_MS = 30000; // every 30s while logged in
var cloudAutosaveTimer = null;
var suppressNextCloudAutosave = false; // avoid immediately re-saving what we just loaded

// Wipes any way back to the old run: the local save and, if logged in,
// the cloud save too. Called from "end run" and reincarnation so a
// player can't just hit "load" to undo either one.
function deleteAllSaves() {
  localStorage.removeItem("nailMakerSave");

  var user = currentAuthUser();
  if (user) {
    db.collection("saves").doc(user.uid).delete().catch(function (err) {
      console.error("Failed to delete cloud save", err);
    });
  }
}

// The land you live in is public (profiles.region, shown on the map screen). It is written from here,
// with the save, because by now the live game is the real one: right after logging in on a new device the
// game is still blank until the cloud save has loaded, and a blank game must not overwrite your land.
// Only written when it differs from what this session last wrote.
var lastSyncedRegion = null;

function syncRegionToProfile(user) {
  var region = state.region || "";
  if (region === lastSyncedRegion) return;
  lastSyncedRegion = region;
  db.collection("profiles").doc(user.uid).set({ region: region }, { merge: true }).catch(function (err) {
    lastSyncedRegion = null; // try again next time
    console.warn("Couldn't save your land to your profile", err);
  });
}

function cloudSaveState() {
  var user = currentAuthUser();
  if (!user) return;

  db.collection("saves").doc(user.uid).set({
    data: JSON.stringify(state),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }).catch(function (err) {
    console.error("Cloud autosave failed", err);
  });
  syncRegionToProfile(user);
}

function cloudLoadState(uid) {
  return db.collection("saves").doc(uid).get().then(function (doc) {
    if (!doc.exists) return null;
    try {
      return JSON.parse(doc.data().data);
    } catch (e) {
      console.error("Cloud save was unreadable", e);
      return null;
    }
  });
}

function startCloudAutosave() {
  if (cloudAutosaveTimer) return;
  cloudAutosaveTimer = setInterval(function () {
    if (suppressNextCloudAutosave) {
      suppressNextCloudAutosave = false;
      return;
    }
    cloudSaveState();
  }, CLOUD_AUTOSAVE_INTERVAL_MS);
}

function stopCloudAutosave() {
  if (cloudAutosaveTimer) {
    clearInterval(cloudAutosaveTimer);
    cloudAutosaveTimer = null;
  }
}

firebase.auth().onAuthStateChanged(function (user) {
  lastSyncedRegion = null; // a different account, or a fresh login: write the land again
  if (user) {
    cloudLoadState(user.uid).then(function (data) {
      if (data) {
        state = Object.assign(defaultState(), data);
        migrateLoadedState();
        suppressNextCloudAutosave = true; // don't immediately write back what we just read
        render();
        flashButton(el.btnAuthToggle, "cloud save loaded!");
      }
      startCloudAutosave();
    });
  } else {
    stopCloudAutosave();
  }
});

// Catch the tab closing/reloading so the last few seconds of progress
// aren't lost waiting for the next 30s tick.
window.addEventListener("beforeunload", function () {
  if (currentAuthUser()) cloudSaveState();
});
