"use strict";

var CLOUD_AUTOSAVE_INTERVAL_MS = 30000;
var cloudAutosaveTimer = null;
var suppressNextCloudAutosave = false;

function deleteAllSaves() {
  localStorage.removeItem("nailMakerSave");

  var user = currentAuthUser();
  if (user) {
    db.collection("saves").doc(user.uid).delete().catch(function (err) {
      console.error("Failed to delete cloud save", err);
    });
  }
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
        suppressNextCloudAutosave = true;
        render();
        flashButton(el.btnAuthToggle, "cloud save loaded!");
      }
      startCloudAutosave();
    });
  } else {
    stopCloudAutosave();
  }
});

window.addEventListener("beforeunload", function () {
  if (currentAuthUser()) cloudSaveState();
});
