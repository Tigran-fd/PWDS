interface UrlCheckResult {
  url: string;
  category: 'legitimate' | 'suspicious' | 'unknown';
  timestamp: number;
}

class DatabaseService {
  private baseUrl = 'http://localhost:5000/api';

  async checkUrlInDatabase(url: string): Promise<{category: 'legitimate' | 'suspicious' | 'unknown'}> {
    try {
      const response = await fetch(`${this.baseUrl}/check-url`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url })
      });

      if (response.ok) {
        const result = await response.json();
        console.log('✅ API Response:', result);
        return result;
      } else {
        console.error('❌ API error:', response.status);
        return { category: 'unknown' };
      }
    } catch (error) {
      console.error('❌ API request failed:', error);
      return { category: 'unknown' };
    }
  }
}

const dbService = new DatabaseService();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CHECK_URL') {
    console.log('📨 Received CHECK_URL message for:', message.url);

    dbService.checkUrlInDatabase(message.url)
      .then((result) => {
        const responseData: UrlCheckResult = {
          url: message.url,
          category: result.category,
          timestamp: Date.now()
        };
        console.log('📤 Sending response:', responseData);
        sendResponse(responseData);
      })
      .catch((error) => {
        console.error('❌ Error in check:', error);
        sendResponse({
          url: message.url,
          category: 'unknown',
          timestamp: Date.now(),
          error: error.message
        });
      });

    return true;
  }

  return false;
});

async function checkUrlInDatabase(url: string): Promise<UrlCheckResult> {
  console.log('🔍 Checking URL in database:', url);
  const dbCheck = await dbService.checkUrlInDatabase(url);

  const result = {
    url,
    category: dbCheck.category,
    timestamp: Date.now()
  };

  console.log('📊 Check result:', result);
  return result;
}

const pendingPermissions = new Map<string, {resolve: (value: boolean) => void, url: string, tabId?: number}>();

chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  if (details.frameId === 0) {
    console.log('🚀 Navigation started:', details.url);

    if (details.url.startsWith('chrome://') ||
        details.url.startsWith('chrome-extension://') ||
        details.url.startsWith('about:')) {
      return;
    }

    if (details.url.includes('google.com/search') ||
        details.url.includes('yandex.ru/search')) {
      console.log('🔍 Search query, skipping');
      return;
    }

    try {
      const result = await checkUrlInDatabase(details.url);
      console.log(`📊 URL ${details.url} category: ${result.category}`);

      if (result.category === 'suspicious') {
        console.log('🚫 Blocking suspicious site:', details.url);

        chrome.tabs.update(details.tabId, {
          url: chrome.runtime.getURL(`blocked.html?url=${encodeURIComponent(details.url)}`)
        });
      } else if (result.category === 'unknown') {
        console.log('❓ Asking permission for unknown site:', details.url);

        const proceed = await askUserPermissionWithNotification(details.url, details.tabId);

        if (!proceed) {
          console.log('👎 User denied access to:', details.url);
          chrome.tabs.update(details.tabId, {
            url: chrome.runtime.getURL(`blocked.html?url=${encodeURIComponent(details.url)}&reason=user_denied`)
          });
        } else {
          console.log('👍 User allowed access to:', details.url);
        }
      } else {
        console.log('✅ Allowing legitimate site:', details.url);
      }
    } catch (error) {
      console.error('❌ Error checking URL:', error);
    }
  }
});

function askUserPermissionWithNotification(url: string, tabId?: number): Promise<boolean> {
  return new Promise((resolve) => {
    const notificationId = `permission-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const domain = new URL(url).hostname;

    pendingPermissions.set(notificationId, { resolve, url, tabId });

    chrome.notifications.create(notificationId, {
      type: 'basic',
      iconUrl: 'icons/PWDS128.png',
      title: '⚠️ Unknown Website',
      message: `Do you want to visit ${domain}?`,
      contextMessage: 'This site is not in our verified database',
      priority: 2,
      buttons: [
        { title: '✅ Allow' },
        { title: '❌ Block' }
      ],
      requireInteraction: true,
      silent: false,
      eventTime: Date.now() + 20000
    });

    console.log(`📢 Created notification ${notificationId} for ${url}`);

    // Таймаут через 20 секунд
    setTimeout(() => {
      const pending = pendingPermissions.get(notificationId);
      if (pending) {
        console.log(`⏰ Notification ${notificationId} timeout, blocking site`);
        pending.resolve(false);
        pendingPermissions.delete(notificationId);
        chrome.notifications.clear(notificationId);
      }
    }, 20000);
  });
}

chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
  console.log(`🔄 Notification button clicked: ${notificationId}, button: ${buttonIndex}`);

  const pending = pendingPermissions.get(notificationId);
  if (pending) {
    const proceed = buttonIndex === 0; // 0 = Allow, 1 = Block

    console.log(`📢 User ${proceed ? 'allowed' : 'denied'} navigation for: ${pending.url}`);

    pending.resolve(proceed);

    if (!proceed && pending.tabId !== undefined) {
      chrome.tabs.update(pending.tabId, {
        url: chrome.runtime.getURL(`blocked.html?url=${encodeURIComponent(pending.url)}&reason=user_denied`)
      });
    }

    pendingPermissions.delete(notificationId);
    chrome.notifications.clear(notificationId);
  } else {
    console.log(`❌ No pending permission found for notification: ${notificationId}`);
  }
});

chrome.notifications.onClosed.addListener((notificationId, byUser) => {
  console.log(`❌ Notification ${notificationId} closed, byUser: ${byUser}`);

  const pending = pendingPermissions.get(notificationId);
  if (pending && byUser) {
    console.log(`👤 User closed notification, blocking site: ${pending.url}`);
    pending.resolve(false);

    // Если есть tabId, перенаправляем на страницу блокировки
    if (pending.tabId !== undefined) {
      chrome.tabs.update(pending.tabId, {
        url: chrome.runtime.getURL(`blocked.html?url=${encodeURIComponent(pending.url)}&reason=notification_closed`)
      });
    }

    pendingPermissions.delete(notificationId);
  }
});
