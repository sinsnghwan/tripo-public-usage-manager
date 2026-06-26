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


chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "TRIPO_SHOW_UPDATE_NOTIFICATION") return false;

  const version = String(message.version || "").trim();
  const required = message.required === true;
  const body = String(
    message.message ||
    (required
      ? "필수 업데이트가 있습니다. GitHub에서 최신 ZIP을 다시 받은 뒤 기존 확장 프로그램 폴더를 교체하고 새로고침해주세요."
      : "새 버전이 있습니다. GitHub에서 최신 ZIP을 다시 받은 뒤 기존 확장 프로그램 폴더를 교체하고 새로고침해주세요.")
  );

  const notificationId = `tripo-update-${version || "latest"}`;

  chrome.notifications.create(
    notificationId,
    {
      type: "basic",
      iconUrl: "icon-128.png",
      title: required
        ? `Tripo 필수 업데이트 ${version}`
        : `Tripo 새 버전 ${version}`,
      message: body,
      priority: required ? 2 : 1
    },
    () => {
      if (chrome.runtime.lastError) {
        console.warn(
          "[Tripo Manager] notification failed",
          chrome.runtime.lastError.message
        );
        sendResponse({
          ok: false,
          message: chrome.runtime.lastError.message
        });
        return;
      }

      sendResponse({ ok: true, notificationId });
    }
  );

  return true;
});
