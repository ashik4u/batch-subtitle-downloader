// ==UserScript==
// @name         Subsource.net Batch Downloader
// @namespace    Subsource.net Downloader
// @version      1.1
// @description  Batch download subtitles from subsource.net
// @icon         https://www.google.com/s2/favicons?sz=64&domain=subsource.net
// @author       kylyte, reviewed/fixed by Codex
// @license      GPL-3.0
// @match        https://subsource.net/
// @match        https://subsource.net/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip/3.7.1/jszip.min.js
// @connect      api.subsource.net
// ==/UserScript==

(function () {
  'use strict';

  let selectedRows = new Set();
  let apiKey = GM_getValue('subsource_api_key', '');
  let activePageKey = getPageKey();
  let isDownloading = false;
  let refreshTimer = null;

  GM_registerMenuCommand('Set API Key', () => {
    const key = prompt('Enter your API Key:', apiKey);
    if (key !== null) {
      apiKey = key.trim();
      GM_setValue('subsource_api_key', apiKey);
      alert('API Key saved!');
    }
  });

  function shouldActivate(url) {
    const path = new URL(url).pathname;
    return /^\/subtitles\/[^/]+(?:\/season-\d+)?\/?$/.test(path);
  }

  function getPageKey() {
    return shouldActivate(location.href) ? new URL(location.href).pathname : '';
  }

  function resetSelectionIfPageChanged() {
    const pageKey = getPageKey();
    if (pageKey !== activePageKey) {
      activePageKey = pageKey;
      selectedRows.clear();
    }
  }

  function activate() {
    resetSelectionIfPageChanged();

    if (!shouldActivate(location.href)) {
      removeUI();
      return;
    }

    createCheckboxColumn();
  }

  function removeUI() {
    ['batch-download-btn', 'selected-counter', 'download-notifications'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.remove();
    });
  }

  function createCheckboxColumn() {
    const table = document.querySelector('table.w-full');
    if (!table) return;

    const thead = table.querySelector('thead tr');
    if (thead && !document.getElementById('select-all-subs')) {
      const selectAllTh = document.createElement('th');
      selectAllTh.className = 'px-2 py-3 text-center w-[3%]';

      const selectAll = document.createElement('input');
      selectAll.type = 'checkbox';
      selectAll.id = 'select-all-subs';
      selectAll.className = 'cursor-pointer w-4 h-4';

      selectAllTh.appendChild(selectAll);
      thead.insertBefore(selectAllTh, thead.firstChild);
    }

    const rows = table.querySelectorAll('tbody tr.subtitles-table-row');
    rows.forEach(row => {
      const existing = row.querySelector('.sub-checkbox');
      if (existing) {
        existing.checked = selectedRows.has(existing.dataset.id);
        return;
      }

      const linkElement = row.querySelector('a[href*="/subtitle/"]');
      if (!linkElement) return;

      const href = linkElement.getAttribute('href');
      const match = href.match(/\/(\d+)$/);
      if (!match) return;

      const id = match[1];
      const releaseName = row.querySelector('td:nth-child(4) a')?.textContent.trim() || 'Unknown';

      const checkboxTd = document.createElement('td');
      checkboxTd.className = 'px-2 py-3 text-center';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'sub-checkbox cursor-pointer w-4 h-4';
      checkbox.dataset.id = id;
      checkbox.dataset.name = releaseName;
      checkbox.checked = selectedRows.has(id);

      checkboxTd.appendChild(checkbox);
      row.insertBefore(checkboxTd, row.firstChild);
    });

    bindControls();
    createDownloadButton();
    createNotificationArea();
    createSelectedCounter();
    updateSelectedCount();
    updateSelectAllState();
  }

  function bindControls() {
    const selectAll = document.getElementById('select-all-subs');
    if (selectAll && !selectAll.dataset.bound) {
      selectAll.dataset.bound = 'true';
      selectAll.addEventListener('change', e => {
        const checkboxes = document.querySelectorAll('.sub-checkbox');
        checkboxes.forEach(cb => {
          cb.checked = e.target.checked;
          if (e.target.checked) selectedRows.add(cb.dataset.id);
          else selectedRows.delete(cb.dataset.id);
        });
        updateSelectedCount();
        updateSelectAllState();
      });
    }

    document.querySelectorAll('.sub-checkbox').forEach(cb => {
      if (cb.dataset.bound) return;
      cb.dataset.bound = 'true';
      cb.addEventListener('change', e => {
        const id = e.target.dataset.id;
        if (e.target.checked) selectedRows.add(id);
        else selectedRows.delete(id);
        updateSelectedCount();
        updateSelectAllState();
      });
    });
  }

  function createSelectedCounter() {
    if (document.getElementById('selected-counter')) return;
    const counter = document.createElement('div');
    counter.id = 'selected-counter';
    counter.style.cssText =
      'position: fixed; bottom: 80px; right: 20px; background: #3b82f6; color: white; padding: 10px 15px; border-radius: 8px; font-weight: bold; z-index: 9999; box-shadow: 0 4px 6px rgba(0,0,0,0.1);';
    document.body.appendChild(counter);
  }

  function updateSelectedCount() {
    const counter = document.getElementById('selected-counter');
    if (counter) counter.textContent = `Selected: ${selectedRows.size}`;
  }

  function updateSelectAllState() {
    const selectAll = document.getElementById('select-all-subs');
    if (!selectAll) return;

    const checkboxes = Array.from(document.querySelectorAll('.sub-checkbox'));
    const checkedCount = checkboxes.filter(cb => cb.checked).length;

    selectAll.checked = checkboxes.length > 0 && checkedCount === checkboxes.length;
    selectAll.indeterminate = checkedCount > 0 && checkedCount < checkboxes.length;
  }

  function createDownloadButton() {
    if (document.getElementById('batch-download-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'batch-download-btn';
    btn.type = 'button';
    btn.textContent = 'Download';
    btn.style.cssText =
      'position: fixed; bottom: 20px; right: 20px; background: #10b981; color: white; padding: 12px 24px; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; font-size: 16px; z-index: 9999; box-shadow: 0 4px 6px rgba(0,0,0,0.1);';
    btn.addEventListener('click', startBatchDownload);
    document.body.appendChild(btn);
  }

  function createNotificationArea() {
    if (document.getElementById('download-notifications')) return;
    const notifArea = document.createElement('div');
    notifArea.id = 'download-notifications';
    notifArea.style.cssText = 'position: fixed; top: 20px; right: 20px; z-index: 10000; max-width: 300px;';
    document.body.appendChild(notifArea);
  }

  function showNotification(message, isProgress = false) {
    const notifArea = document.getElementById('download-notifications');
    if (!notifArea) return null;

    const notif = document.createElement('div');
    notif.className = 'download-notif';
    notif.style.cssText =
      'background: white; border-left: 4px solid #3b82f6; padding: 12px; margin-bottom: 10px; border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.15); font-size: 14px;';
    notif.textContent = message;
    notifArea.appendChild(notif);
    if (!isProgress) setTimeout(() => notif.remove(), 3000);
    return notif;
  }

  async function downloadSubtitle(id, name) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: `https://api.subsource.net/api/v1/subtitles/${encodeURIComponent(id)}/download`,
        headers: { 'X-API-Key': apiKey },
        responseType: 'blob',
        timeout: 30000,
        onload: response => {
          if (response.status === 200) {
            resolve({ blob: response.response, name, id });
          } else {
            reject(new Error(`Status ${response.status}`));
          }
        },
        onerror: () => reject(new Error('Network error')),
        ontimeout: () => reject(new Error('Timeout')),
      });
    });
  }

  async function extractZipFlat(zipBlob, mainZip, item) {
    const zipData = await JSZip.loadAsync(zipBlob);

    for (const [fileName, fileObj] of Object.entries(zipData.files)) {
      if (!fileObj.dir) {
        const fileData = await fileObj.async('arraybuffer');
        const safeName = safeFilePart(fileName.split(/[\\/]+/).filter(Boolean).pop() || 'subtitle');
        mainZip.file(getUniqueZipName(mainZip, safeName), fileData);
      }
    }
  }

  function getUniqueZipName(zip, fileName) {
    if (!zip.file(fileName)) return fileName;

    const dotIndex = fileName.lastIndexOf('.');
    const base = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
    const ext = dotIndex > 0 ? fileName.slice(dotIndex) : '';
    let index = 2;
    let candidate = `${base}_${index}${ext}`;

    while (zip.file(candidate)) {
      index++;
      candidate = `${base}_${index}${ext}`;
    }

    return candidate;
  }

  function safeFilePart(value) {
    return String(value || 'unknown')
      .trim()
      .replace(/[^a-z0-9.\-_ ]/gi, '_')
      .replace(/\s+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 120) || 'unknown';
  }

  function downloadFile(blob, filename) {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    }, 100);
  }

  function getSafeNameFromURL() {
    const path = location.pathname.replace(/^\/subtitles\//, '').replace(/\/$/, '');
    const clean = path.replace(/\//g, '-').replace(/[^a-z0-9\-_]/gi, '');
    return clean || 'subsource';
  }

  function getSelectedDataFromPage() {
    return Array.from(document.querySelectorAll('.sub-checkbox:checked')).map(cb => ({
      id: cb.dataset.id,
      name: cb.dataset.name || 'Unknown',
    }));
  }

  function setDownloadButtonState(disabled) {
    const btn = document.getElementById('batch-download-btn');
    if (!btn) return;

    btn.disabled = disabled;
    btn.textContent = disabled ? 'Downloading...' : 'Download';
    btn.style.opacity = disabled ? '0.65' : '1';
    btn.style.cursor = disabled ? 'wait' : 'pointer';
  }

  async function startBatchDownload() {
    if (isDownloading) return;

    if (!apiKey) {
      alert('Please set your API Key first! Go to Tampermonkey menu > Set API Key');
      return;
    }

    const selectedData = getSelectedDataFromPage();
    if (selectedData.length === 0) {
      alert('Please select at least one subtitle to download');
      selectedRows.clear();
      updateSelectedCount();
      updateSelectAllState();
      return;
    }

    isDownloading = true;
    setDownloadButtonState(true);

    const progressNotif = showNotification(`Starting... (0/${selectedData.length})`, true);
    let completed = 0;
    const combinedZip = new JSZip();

    for (const item of selectedData) {
      try {
        if (progressNotif) progressNotif.textContent = `Downloading: ${item.name} (${completed + 1}/${selectedData.length})`;
        const result = await downloadSubtitle(item.id, item.name);
        await extractZipFlat(result.blob, combinedZip, item);
        completed++;
        if (progressNotif) progressNotif.textContent = `Extracted: ${completed}/${selectedData.length}`;
        await new Promise(resolve => setTimeout(resolve, 300));
      } catch (error) {
        console.error('Download error:', error);
        showNotification(`Failed: ${item.name.substring(0, 30)}...`);
      }
    }

    if (completed === 0) {
      if (progressNotif) progressNotif.remove();
      showNotification('No subtitles were downloaded successfully.');
      isDownloading = false;
      setDownloadButtonState(false);
      return;
    }

    if (progressNotif) progressNotif.textContent = `Creating final ZIP (${completed} sets)...`;

    try {
      const finalZipBlob = await combinedZip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      });

      const baseName = getSafeNameFromURL();
      const filename = `${baseName}.zip`;

      downloadFile(finalZipBlob, filename);

      setTimeout(() => {
        if (progressNotif) progressNotif.remove();
        showNotification(`Combined ${completed} ZIPs into ${filename}!`);
        selectedRows.clear();
        document.querySelectorAll('.sub-checkbox').forEach(cb => (cb.checked = false));
        updateSelectedCount();
        updateSelectAllState();
      }, 500);
    } catch (error) {
      console.error('ZIP creation error:', error);
      if (progressNotif) progressNotif.remove();
      showNotification('ZIP failed: ' + error.message);
    } finally {
      isDownloading = false;
      setDownloadButtonState(false);
    }
  }

  function scheduleActivate() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(activate, 150);
  }

  const observer = new MutationObserver(scheduleActivate);
  observer.observe(document.body, { childList: true, subtree: true });

  let lastUrl = location.href;
  new MutationObserver(() => {
    const current = location.href;
    if (current !== lastUrl) {
      lastUrl = current;
      setTimeout(activate, 500);
    }
  }).observe(document.body, { childList: true, subtree: true });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', activate);
  } else {
    activate();
  }
})();
