// ============================================================
// Firebase config for the MoodTrack project (moodtrack-abde9)
// ============================================================
const firebaseConfig = {
  apiKey: "AIzaSyBGwQHeWDD9g_691nhKLlML7SKrvA6e578",
  authDomain: "moodtrack-abde9.firebaseapp.com",
  projectId: "moodtrack-abde9",
  storageBucket: "moodtrack-abde9.firebasestorage.app",
  messagingSenderId: "369036167167",
  appId: "1:369036167167:web:ab26ca835e238d09c689ca"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
db.enablePersistence({ synchronizeTabs: true }).catch(err => console.warn("Offline persistence not enabled:", err.code));