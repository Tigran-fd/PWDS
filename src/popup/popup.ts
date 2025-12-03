document.addEventListener('DOMContentLoaded', () => {
  const urlInput = document.getElementById('urlInput') as HTMLInputElement;
  const checkButton = document.getElementById('checkButton') as HTMLButtonElement;
  const resultDiv = document.getElementById('result') as HTMLDivElement;

  // Set test URL
  urlInput.value = 'https://google.com';

  checkButton?.addEventListener('click', () => {
    const url = urlInput.value.trim();

    if (!url) {
      showResult('Please enter a valid URL', 'error');
      return;
    }

    console.log('Sending check request for:', url);

    // Send message with timeout
    chrome.runtime.sendMessage(
      { type: 'CHECK_URL', url: url },
      (response) => {
        console.log('Received response:', response);

        if (chrome.runtime.lastError) {
          console.error('Runtime error:', chrome.runtime.lastError);
          showResult(`Background error: ${chrome.runtime.lastError.message}`, 'error');
          return;
        }

        if (response && response.category) {
          showCheckResult(response);
        } else {
          showResult('Invalid response format received', 'error');
        }
      }
    );
  });

  function showCheckResult(result: any) {
    if (!resultDiv) return;

    resultDiv.style.display = 'block';

    let status = '';
    let color = '';
    let icon = '';

    switch (result.category) {
      case 'legitimate':
        status = 'Secure';
        color = '#4cd964';
        icon = '🛡️';
        break;
      case 'suspicious':
        status = 'Dangerous';
        color = '#ff3b30';
        icon = '⚠️';
        break;
      case 'unknown':
        status = 'Warning';
        color = '#ffcc00';
        icon = '❓';
        break;
      default:
        status = 'Analysis Error';
        color = '#8e8e93';
        icon = '⚙️';
    }

    resultDiv.innerHTML = `
      <h4 style="color: ${color}; margin-bottom: 12px;">${icon} ${status}</h4>
      <p><strong>URL Analyzed:</strong> ${result.url}</p>
      <p style="margin-top: 12px; font-size: 12px; color: #b8b5e0; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 8px;">
        Powered by PWDS Security System
      </p>
    `;
  }

  function showResult(message: string, type: string) {
    if (!resultDiv) return;

    const colors: {[key: string]: string} = {
      'error': '#ff3b30',
      'warning': '#ffcc00',
      'info': '#5ac8fa'
    };

    const color = colors[type] || '#8e8e93';

    resultDiv.style.display = 'block';
    resultDiv.innerHTML = `
      <p style="color: ${color}; font-weight: 500;">
        ${type === 'error' ? '❌' : type === 'warning' ? '⚠️' : 'ℹ️'} 
        ${message}
      </p>
    `;
  }
});