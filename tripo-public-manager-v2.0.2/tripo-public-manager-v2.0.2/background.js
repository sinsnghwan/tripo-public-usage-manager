chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "TRIPO_OPEN_OPTIONS") return false;

  chrome.runtime.openOptionsPage()
    .then(() => sendResponse({ ok: true }))
    .catch((error) => sendResponse({
      ok: false,
      message: error instanceof Error ? error.message : String(error)
    }));

  return true;
});
