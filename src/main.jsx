import { render } from 'preact';
import { App } from './app.jsx';
import { createLocalStore } from './data/local.js';

const config = window.FAMILY_HUB_CONFIG || {};
const hasFirebase = config.firebase && config.firebase.apiKey && !String(config.firebase.apiKey).startsWith('PASTE');

async function start() {
  const store = hasFirebase
    ? (await import('./data/firebase.js')).createFirebaseStore(config.firebase)
    : createLocalStore();
  render(<App store={store} config={config} />, document.getElementById('app'));
}
start();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
