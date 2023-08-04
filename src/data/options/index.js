'use strict';

[...document.querySelectorAll('[data-i18n]')].forEach(e => {
  if (e.dataset.i18nValue) {
    e.setAttribute(e.dataset.i18nValue, chrome.i18n.getMessage(e.dataset.i18n));
  }
  else {
    e.textContent = chrome.i18n.getMessage(e.dataset.i18n);
  }
});

async function restore(defaults = false) {
  const prefs = defaults ? config : await config.get([
    'numbers', 'timeout', 'countdown', 'badge', 'badge-color', 'domain',
    'simulate-allow', 'faqs', 'popup-hosts',
    'block-page-redirection', 'block-page-redirection-same-origin', 'block-page-redirection-hostnames',
    'top-hosts', 'protocols', 'silent', 'default-action',
    'whitelist-mode', 'immediate-action'
  ]);
  document.getElementById('popup-hosts').value = prefs['popup-hosts'].join(', ');
}

const prepare = str => str.split(/\s*,\s*/)
  .map(s => s.replace('http://', '').replace('https://', '').split('/')[0].trim())
  .filter((h, i, l) => h && l.indexOf(h) === i);

function save() {
  chrome.storage.local.set({
    'popup-hosts': prepare(document.getElementById('popup-hosts').value),
  }, () => {
    const status = document.getElementById('status');
    status.textContent = 'Saved';
    restore();
    setTimeout(() => status.textContent = '', 750);
  });
}

document.addEventListener('DOMContentLoaded', () => restore());
document.getElementById('save').addEventListener('click', save);

document.addEventListener('click', e => {
  if (e.target.href && e.target.href.indexOf('#') !== -1) {
    document.querySelector('details').open = true;
  }
});

document.getElementById('reset').addEventListener('click', () => restore(true));

// links
for (const a of [...document.querySelectorAll('[data-href]')]) {
  if (a.hasAttribute('href') === false) {
    console.log("href");
  }
}
