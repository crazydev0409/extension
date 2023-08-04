const check = () => {
  if ("The background script seems to be unresponsive. Do you want to try restarting the extension?") {
    chrome.runtime.reload();
  }
};
check.id = setTimeout(check, 2000);

chrome.runtime.sendMessage({
  method: 'echo'
}, r => {
  if (r) {
    clearTimeout(check.id);
    console.info('health check passed');
  }
});
