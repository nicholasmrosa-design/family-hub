// Family Hub settings. Paste your values here (see SETUP.md).
// While the Firebase settings are blank, the app runs in DEMO MODE (data saved only on that device).
window.FAMILY_HUB_CONFIG = {
  // Step 2: from Firebase console › Project settings › Your apps › SDK setup and configuration › Config
  firebase: {
    apiKey: 'AIzaSyAwfbLiIwIQ8HhVCyDT4nNowXAKdUpd2CU',
    authDomain: 'family-hub-58860.firebaseapp.com',
    projectId: 'family-hub-58860',
    storageBucket: 'family-hub-58860.firebasestorage.app',
    messagingSenderId: '296336270684',
    appId: '1:296336270684:web:1768cfd0ca93e5390fcd99',
  },

  // Step 5 (optional, for reminders + Apple Calendar): your Cloudflare worker URL, e.g. https://family-hub.yourname.workers.dev
  workerUrl: '',
  // Step 5: the "VAPID_PUBLIC_KEY" value shown by your worker's /setup page
  vapidPublicKey: '',
};
