chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'ASK_NAVIGATION_PERMISSION') {
    const proceed = confirm(
      `⚠️ ВНИМАНИЕ: Неизвестный сайт\n\n` +
      `Вы собираетесь перейти на сайт: ${message.url}\n` +
      `Этот сайт не проверен в нашей базе данных.\n\n` +
      `Вы уверены, что хотите продолжить?`
    );

    sendResponse({ proceed });
  }
  return true;
});

console.log('✅ Content script loaded (navigation only)');