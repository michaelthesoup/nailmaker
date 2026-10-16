"use strict";

// ----------------------------------------------------------------
// Global chat: a third tab in the leaderboard panel. Only logged-in players
// can read or write it. Messages live in chat/{id} as
//   { uid, name, text, createdAt }
// and the panel shows the latest CHAT_HISTORY of them. While signed in, a
// lightweight listener also tracks new messages for the unread tab count.
//
// Plain text only, CHAT_MAX_LEN characters, one message per CHAT_COOLDOWN_MS.
// The admin account sees a delete and a kick button on every message, plus
// "clear shown". Players kicked off the leaderboards (admin.js) are banned from
// chat too: the Firestore rules refuse their messages.
// ----------------------------------------------------------------

var CHAT_MAX_LEN = 200;
var CHAT_COOLDOWN_MS = 3000;
var CHAT_HISTORY = 50;

var chatUnsub = null;
var chatLastSent = 0;
var chatShown = []; // [{ id, uid, name, text, ms }] oldest first, as drawn
var chatHintTimer = null;
var chatUnreadCount = 0;
var chatSeenMessageIds = Object.create(null);

function chatUpdateUnreadLabel() {
  if (!el.btnLbChat) return;
  el.btnLbChat.textContent = chatUnreadCount === 0
    ? "chat"
    : "chat (" + (chatUnreadCount > 9 ? "9+" : chatUnreadCount) + ")";
}

function chatMarkRead() {
  chatUnreadCount = 0;
  chatUpdateUnreadLabel();
}

function chatIsAdmin() {
  return typeof isCheatAllowed === "function" && isCheatAllowed();
}

function chatSetHint(text, keepMs) {
  if (!el.chatHint) return;
  el.chatHint.textContent = text || "";
  clearTimeout(chatHintTimer);
  if (text) chatHintTimer = setTimeout(function () { el.chatHint.textContent = ""; }, keepMs || 3500);
}

function chatTime(ms) {
  if (!ms) return "";
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function chatRender() {
  var box = el.chatList;
  var stick = box.scrollTop + box.clientHeight >= box.scrollHeight - 24; // keep following if you were at the bottom
  box.innerHTML = "";
  var admin = chatIsAdmin();

  if (chatShown.length === 0) {
    var empty = document.createElement("div");
    empty.className = "hint";
    empty.textContent = "no messages yet \u2014 say hello";
    box.appendChild(empty);
  }

  chatShown.forEach(function (m) {
    var row = document.createElement("div");
    row.className = "chat-msg";

    var time = document.createElement("span");
    time.className = "chat-time";
    time.textContent = chatTime(m.ms);
    row.appendChild(time);

    var name = document.createElement("span");
    name.className = "chat-name lb-name-link";
    name.textContent = m.name;
    name.title = "view profile";
    name.addEventListener("click", function () { if (typeof openProfile === "function") openProfile(m.uid, { name: m.name, uid: m.uid }); });
    row.appendChild(name);
    if (typeof presenceDot === "function" && typeof isPlayerOnline === "function" && isPlayerOnline(m.uid)) row.appendChild(presenceDot());

    row.appendChild(document.createTextNode(": "));
    var text = document.createElement("span");
    text.textContent = m.text; // textContent only: nothing a player types is ever treated as HTML
    row.appendChild(text);

    if (admin) {
      var del = document.createElement("button");
      del.className = "chat-admin-btn";
      del.textContent = "delete";
      del.addEventListener("click", function () { chatDelete(m.id); });
      row.appendChild(del);
      var kick = document.createElement("button");
      kick.className = "chat-admin-btn";
      kick.textContent = "kick";
      kick.addEventListener("click", function () { chatKick(m); });
      row.appendChild(kick);
    }
    box.appendChild(row);
  });

  if (el.chatAdmin) el.chatAdmin.style.display = admin ? "" : "none";
  if (stick) box.scrollTop = box.scrollHeight;
}

// ---------------- live listener ----------------

function chatOpen() {
  if (chatUnsub || typeof db === "undefined" || !currentAuthUser()) return;
  chatSeenMessageIds = Object.create(null);
  var initialSnapshot = true;
  chatUnsub = db.collection("chat").orderBy("createdAt", "desc").limit(CHAT_HISTORY).onSnapshot(function (snap) {
    var user = currentAuthUser();
    var countUnread = !initialSnapshot && leaderboardTab !== "chat" && !!user;
    snap.docChanges().forEach(function (change) {
      if (change.type !== "added" || chatSeenMessageIds[change.doc.id]) return;
      chatSeenMessageIds[change.doc.id] = true;
      if (countUnread && change.doc.data().uid !== user.uid) chatUnreadCount++;
    });
    initialSnapshot = false;

    var list = [];
    snap.forEach(function (doc) {
      var d = doc.data({ serverTimestamps: "estimate" }); // a message you just sent has no time yet
      chatSeenMessageIds[doc.id] = true;
      list.push({ id: doc.id, uid: d.uid, name: String(d.name || "player"), text: String(d.text || ""), ms: d.createdAt && d.createdAt.toMillis ? d.createdAt.toMillis() : 0 });
    });
    chatShown = list.reverse(); // newest was first; draw oldest first
    chatUpdateUnreadLabel();
    chatRender();
  }, function (err) {
    console.error("Chat listener failed", err);
    chatUnsub = null;
    chatSeenMessageIds = Object.create(null);
    chatSetHint("couldn't load chat -- check the Firestore rules for 'chat'", 8000);
  });
}

function chatClose() {
  if (chatUnsub) { chatUnsub(); chatUnsub = null; }
  chatSeenMessageIds = Object.create(null);
  chatMarkRead();
}

// ---------------- sending ----------------

function chatSend() {
  var user = currentAuthUser();
  if (!user) return;
  var text = el.chatInput.value.replace(/\s+/g, " ").trim();
  if (!text) return;
  if (text.length > CHAT_MAX_LEN) text = text.slice(0, CHAT_MAX_LEN);

  var wait = CHAT_COOLDOWN_MS - (Date.now() - chatLastSent);
  if (wait > 0) { chatSetHint("slow down \u2014 wait " + Math.ceil(wait / 1000) + "s"); return; }
  chatLastSent = Date.now();

  el.chatInput.value = "";
  db.collection("chat").add({
    uid: user.uid,
    name: (user.displayName || "player").slice(0, 30),
    text: text,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  }).catch(function (err) {
    console.error("Chat send failed", err);
    chatLastSent = 0;
    el.chatInput.value = text; // give them their words back
    chatSetHint("couldn't send \u2014 you may be muted, or the chat rules aren't published", 6000);
  });
}

// ---------------- admin tools ----------------

function chatDelete(id) {
  if (!chatIsAdmin()) return;
  db.collection("chat").doc(id).delete().catch(function (err) {
    console.error(err);
    chatSetHint("couldn't delete \u2014 check the Firestore rules for 'chat'");
  });
}

function chatKick(m) {
  if (!chatIsAdmin() || typeof adminKickPlayer !== "function") return;
  // adminKickPlayer reports through a status node's textContent; here that is the chat hint line.
  var status = { set textContent(v) { chatSetHint(v, 6000); } };
  adminKickPlayer(m.uid, m.name, status);
}

function chatClearShown() {
  if (!chatIsAdmin() || chatShown.length === 0) return;
  if (!window.confirm("Delete the " + chatShown.length + " messages shown?")) return;
  var batch = db.batch();
  chatShown.forEach(function (m) { batch.delete(db.collection("chat").doc(m.id)); });
  batch.commit().catch(function (err) {
    console.error(err);
    chatSetHint("couldn't clear \u2014 check the Firestore rules for 'chat'");
  });
}

el.btnChatSend.addEventListener("click", chatSend);
el.chatInput.addEventListener("keydown", function (e) { if (e.key === "Enter") chatSend(); });
if (el.btnChatClear) el.btnChatClear.addEventListener("click", chatClearShown);
if (el.btnLbChat) el.btnLbChat.addEventListener("click", function () { setLeaderboardTab("chat"); });
