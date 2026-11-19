# Family Hub setup guide

About 30–40 minutes total, all free, no credit card. You'll do this once on a computer, then everyone installs it on their iPhone.

| Piece | What it does | Cost |
|---|---|---|
| **GitHub Pages** | Hosts the app at your own web address | Free |
| **Firebase** (Google) | Stores your family's data and syncs it live to every phone | Free "Spark" plan |
| **Cloudflare Workers** *(step 5, optional)* | Sends reminder notifications and feeds Apple Calendar | Free plan |

Steps 1–4 give you the full app with live sync. Step 5 adds reminders and Apple Calendar, and you can do it later.

---

## 1. Put the app on GitHub Pages

1. Sign in at **github.com**, click **+ › New repository**.
   - Name: `family-hub`
   - Visibility: **Public** (GitHub Pages is free for public repos. Only the app's code is public. Your family's data lives in Firebase, protected by your passcode.)
   - Click **Create repository**.
2. On the new repo page click **uploading an existing file**. Drag in **everything inside** the `family-hub` folder from the zip (the `docs`, `src`, `worker`, `public`, `tests` folders and the loose files). Do **not** upload `node_modules` if you have one. Click **Commit changes**.
3. Go to **Settings › Pages**. Under *Build and deployment*: Source **Deploy from a branch**, Branch **main**, folder **/docs**. Click **Save**.
4. After a minute the page shows your address, something like
   `https://YOUR-USERNAME.github.io/family-hub/`

Open it now. You'll see Family Hub in **demo mode**, which is a good way to click around. Next, connect it to Firebase so it syncs between phones.

## 2. Create your Firebase project

1. Go to **console.firebase.google.com** and sign in with a Google account. Click **Create a project**, name it `family-hub`. You can turn **off** Google Analytics. Click **Create**.
2. On the project home page, click the **`</>` (Web)** icon to add a web app. Nickname `Family Hub`, leave "Firebase Hosting" **unchecked**, and click **Register app**.
3. You'll see a block of code with `const firebaseConfig = { apiKey: "...", ... }`. Keep this page open.
4. In GitHub, open `docs/config.js`, click the ✏️ pencil to edit, and copy each value from Firebase into the matching line:
   ```js
   firebase: {
     apiKey: 'AIza...',
     authDomain: 'family-hub-xxxx.firebaseapp.com',
     projectId: 'family-hub-xxxx',
     storageBucket: 'family-hub-xxxx.firebasestorage.app',
     messagingSenderId: '1234567890',
     appId: '1:1234567890:web:abc123',
   },
   ```
   Click **Commit changes**. (These values aren't secret. Every website that uses Firebase has them in its page. What protects your data is the security rules in step 3.)

## 3. Turn on sign-in and the database

1. In Firebase: **Build › Authentication › Get started**. Under **Sign-in method**, click **Anonymous** and switch it **on**. Save.
2. Still in Authentication, open **Settings › Authorized domains › Add domain** and add `YOUR-USERNAME.github.io`.
3. **Build › Firestore Database › Create database**. Pick a location close to you (for California, `us-west2` or `nam5`). Choose **Start in production mode**. Create.
4. Open the **Rules** tab, delete everything there, paste the whole contents of `firestore.rules` from this project, and click **Publish**.

## 4. Set up your family and install on the iPhones

**Install first, then sign in.** On iPhone, the home-screen app keeps its own sign-in separate from Safari, so signing in inside Safari would mean doing it twice.

1. On **your iPhone**, open **Safari** and go to `https://YOUR-USERNAME.github.io/family-hub/`
   (If you still see the "Demo mode" bar, wait a minute for GitHub to update, then reload.)
2. Tap the **Share** button › **Add to Home Screen** › **Add**.
3. Open Family Hub **from the new home-screen icon** and tap **Set up a new family**:
   - Add everyone: you and your wife as **Parent**, your son as **Kid**. Each person gets a color.
   - **Family passcode**: typed **once per phone**, the first time. Use 8+ characters, e.g. a short phrase.
   - **Parent PIN**: only you and your wife use this. A **6-digit** PIN is better than 4.
4. On your wife's and son's iPhones: open the link in Safari › **Add to Home Screen**, open it from the icon, enter the family passcode **once**, and tap their name (your wife also enters the parent PIN).

**After that, each phone remembers who it belongs to** and opens straight into that person's account, with no passcode and no PIN. **More › Switch person** goes back to the "Who's using this phone?" picker without asking for the passcode; parents need the PIN there. **More › Sign out of this family** makes the phone forget everything.

**What each role can do**

| | Parents | Kids |
|---|---|---|
| See everything | ✅ | ✅ |
| Add events, recipes, meals, grocery items, to-dos | ✅ | ✅ |
| Check off grocery items and to-dos | ✅ | ✅ |
| Edit or delete anything | ✅ | ❌ |
| Fill an *empty* meal slot | ✅ | ✅ |
| Change a meal that's already planned | ✅ | ❌ |
| Manage family members, PIN, calendar link | ✅ | ❌ |

These limits are enforced by Firebase's security rules on Google's servers, so they hold even if someone pokes at the app.

## 5. Reminders and Apple Calendar (Cloudflare, free)

### 5a. Create the worker
1. Sign up at **dash.cloudflare.com** (free plan).
2. Go to **Workers & Pages › Create › Create Worker** (pick "Start with Hello World" if asked). Name it `family-hub` and click **Deploy**.
3. Click **Edit code**. Delete everything in the editor, paste the whole contents of `worker/worker.js` from this project, and click **Deploy**.

### 5b. Give it access to Firebase
1. In Firebase: ⚙️ **Project settings › Service accounts › Generate new private key** › **Generate key**. A `.json` file downloads.
   ⚠️ This file is a master key to your Firebase data. Don't upload it to GitHub or share it. Delete it from Downloads when you're done.
2. In Cloudflare, open your worker › **Settings › Variables and Secrets › Add**:
   - Type: **Secret**, Name: `FIREBASE_SERVICE_ACCOUNT`, Value: open the .json file in a text editor and paste **its entire contents**. Click **Deploy**.

### 5c. Create the notification keys
1. Visit `https://family-hub.YOUR-SUBDOMAIN.workers.dev/setup` (Cloudflare shows the worker's address on its overview page).
2. The page generates two keys. Add both as **Secrets** the same way as above: `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_JWK`. Copy them exactly. The keys change if you reload the page before saving them.
3. Optional: add a plain text variable `VAPID_SUBJECT` = `mailto:you@youremail.com`.

### 5d. Turn on the 5-minute timer
Worker › **Settings › Trigger Events** (sometimes labeled **Triggers**) › **Add › Cron Triggers** › enter `*/5 * * * *` › Add.

### 5e. Connect the app
1. Reload the `/setup` page. It should show ✅ for Firebase and for the keys, plus the two values you need.
2. In GitHub, edit `docs/config.js` again and fill in:
   ```js
   workerUrl: 'https://family-hub.YOUR-SUBDOMAIN.workers.dev',
   vapidPublicKey: 'B...the long VAPID_PUBLIC_KEY value...',
   ```
   Commit.

### 5f. Use it
- **Reminders:** on each iPhone, open Family Hub **from the home screen icon** › **More** › **Turn on reminders** › Allow › **Send a test**. Each person does this on their own phone. You'll get alerts for events you're part of (as an attendee or driver). Events set to "remind the whole family", and events with nobody selected, alert everyone.
- **Apple Calendar:** **More › Set up Apple Calendar sync** (parents). Then tap **Subscribe to the whole family**, or just your own events, and tap **Subscribe** in the iPhone prompt. Family Hub events show up in the Calendar app on that phone. To control how often it refreshes: iPhone **Settings › Calendar › Accounts › Subscribed Calendars**.

---

## Good to know

- **Needs iOS 16.4 or newer** for reminder notifications, and they only work when the app is opened from the home screen icon.
- **Updates**: when you change `docs/config.js` or upload new files, phones pick it up the next time the app is opened (sometimes it takes two opens).
- **Signing out / switching person**: More › Switch person.
- **Forgot the parent PIN?** Any phone already signed in as a parent can set a new one under **More › Change parent PIN**. It doesn't ask for the old PIN.
- **Free tier limits** are far beyond what a family uses (Firebase allows tens of thousands of reads/writes per day. Cloudflare allows 100,000 requests per day).

## Making changes to the app (optional, for developers)

```bash
npm install
npm test          # logic, calendar feed, push encryption and worker tests
npm run build     # rebuilds docs/ and worker/worker.js (keeps your docs/config.js)
```
Source is in `src/` (Preact + esbuild). The worker source is in `worker/src/`.
