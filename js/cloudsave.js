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

function cloudSaveState() {
  var user = currentAuthUser();
  if (!user) return;

  db.collection("saves").doc(user.uid).set({
    data: JSON.stringify(state),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }).catch(function (err) {
    console.error("Cloud autosave failed", err);
  });
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
