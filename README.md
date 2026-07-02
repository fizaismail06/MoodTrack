# MoodTrack — Setup Guide

## What you're deploying
6 files: `index.html`, `app.js`, `firebase-config.js`, `manifest.json`, `service-worker.js`, `firestore.rules`, plus an `icons/` folder with 2 placeholder icons (swap these for your own later if you like).

---

## STEP 1 — Create the GitHub repo
1. Go to github.com → **New repository** → name it `moodtrack` → Create.
2. Click **Code → Codespaces → Create codespace on main**. Wait for it to load.
3. In the Codespace file explorer, upload all 6 files (and the `icons` folder) I've given you — drag them into the file tree, or use the terminal:
   ```
   mkdir icons
   ```
   then drag `icon-192.png` and `icon-512.png` into that `icons` folder.

## STEP 2 — Create your Firebase project
1. Go to console.firebase.google.com → **Add project** → name it (e.g. `moodtrack-fiza`) → Create.
2. In the left sidebar: **Build → Authentication → Get started**. Click the **Email/Password** provider → Enable → Save.
3. **Build → Firestore Database → Create database** → Start in **production mode** → choose a region close to Malaysia (e.g. `asia-southeast1`) → Enable.
4. **Project settings (gear icon) → General → scroll to "Your apps"** → click the **</> (Web)** icon → nickname it `moodtrack` → Register app. Firebase shows you a `firebaseConfig` object.
5. Copy that config and paste it into `firebase-config.js` in your Codespace, replacing the placeholder values (apiKey, authDomain, projectId, etc.). Save the file (Ctrl+S).

## STEP 3 — Set your Firestore security rules
1. Firebase Console → **Firestore Database → Rules** tab.
2. Delete what's there and paste in the contents of `firestore.rules` (the file I gave you).
3. Click **Publish**.

## STEP 4 — Deploy to Firebase Hosting
In your Codespace terminal, run:
```bash
npm install -g firebase-tools
firebase login --no-localhost
```
Follow the link it prints, sign in with the same Google account as your Firebase project, and paste the code back into the terminal.

```bash
firebase init hosting
```
When prompted:
- "Use an existing project" → select the project you just created
- "What do you want to use as your public directory?" → type `.` (a single dot, meaning the current folder)
- "Configure as a single-page app?" → **No**
- "Set up automatic builds with GitHub?" → No
- It may ask to overwrite `index.html` — say **No** (keep yours)

Then deploy:
```bash
firebase deploy
```
It will print a URL like `https://moodtrack-fiza.web.app` — that's your live app. Open it on your phone and **Add to Home Screen** to install it as an app.

## STEP 5 — Push to GitHub (so your code is backed up)
```bash
git add .
git commit -m "Initial MoodTrack app"
git push
```

## STEP 6 — First use
1. Open your deployed URL → **Create Account** with your email + a password.
2. Go to **Settings** → set your PIN, turn on the daily reminder and pick a time, set your average cycle/period length.
3. Go to **Log** tab and save your first entry.

---

## Notes & limitations
- **Reminders are best-effort.** Browsers can't guarantee a notification fires at an exact time while the app is fully closed for a long stretch. It'll fire reliably while the app is open or recently backgrounded, and will "catch up" with a notification when you reopen the app if you missed the time and haven't logged an entry that day yet.
- **PIN lock** is a quick local lock layer on top of your Firebase account login — it syncs across devices since it's stored with your account, but it's not bank-grade security (there's no PIN attempt lockout). Good enough for keeping a casual glance-over from seeing your journal.
- To reuse this Firebase project for future apps (like you've done before), you can, but I'd recommend a dedicated project for MoodTrack since Firestore security rules here are scoped per-user and separate from your other apps.
- If you ever want to redeploy after edits, just run `firebase deploy` again from the Codespace terminal.

## If something looks off after deploying
Send me a screenshot the same way you always do — I'll walk you through the fix step by step.
