// Family Hub settings. Paste your values here (see SETUP.md).
// While the Firebase settings are blank, the app runs in DEMO MODE (data saved only on that device).
window.FAMILY_HUB_CONFIG = {
  // Step 2: from Firebase console › Project settings › Your apps › SDK setup and configuration › Config
  firebase: {
    apiKey: 'PASTE_API_KEY',
    authDomain: '',
    projectId: '',
    storageBucket: '',
    messagingSenderId: '',
    appId: '',
  },

  // Step 5 (optional, for reminders + Apple Calendar): your Cloudflare worker URL, e.g. https://family-hub.yourname.workers.dev
  workerUrl: '',
  // Step 5: the "VAPID_PUBLIC_KEY" value shown by your worker's /setup page
  vapidPublicKey: '',
};
