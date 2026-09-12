"use strict";

// ----------------------------------------------------------------
// Firebase project config -- these keys are meant to be public (they
// identify your project, they don't grant access on their own; actual
// access control lives in the Firestore security rules set up in the
// Firebase console, not in this file).
// ----------------------------------------------------------------

var firebaseConfig = {
  apiKey: "AIzaSyCirvyNJKQDwMPyYspxivTLvYp3cSaZ73o",
  authDomain: "nailmaker-68af3.firebaseapp.com",
  projectId: "nailmaker-68af3",
  storageBucket: "nailmaker-68af3.firebasestorage.app",
  messagingSenderId: "701465156313",
  appId: "1:701465156313:web:86e2b196314d084495fcc8",
  measurementId: "G-939W3G4S0M"
};

firebase.initializeApp(firebaseConfig);

var db = firebase.firestore();
