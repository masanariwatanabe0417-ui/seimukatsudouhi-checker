// Main application
const state = {
  images: [],
  csvText: null,
  lastResult: null,
};

document.addEventListener('DOMContentLoaded', init);

function init() {
  loadSettingsToForm();
  loadKnowledgeBaseToForm();
  setupDropZones();
  setupModals();
  setupButtons();
  updateAuditButton();
}

function setupDropZones() {
  setupImageZone();
  setupDropZone('csvDropZone', 'csvInput', handleCSV);
}

function setupImageZone() {
  const zone  = document.getElementById('imageDropZone');
  const input = document.getElementById('imageInput');

  zone.addEventListener('dragover', e => {
    e.preventDefault();
    zone.classList.add('dragover');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('dragover');
    handleImages(e.dataTransfer.files);
  });

  document.getElementById('imageSelectBtn').addEventListener('click', e => {
    e.stopPropagation();
    input.click();
  });
  input.addEventListener('change', e => {
    handleImages(e.target.files);
    e.target.value = '';
  });

  document.addEventListener('paste', e => {
    const items = Array.from(e.clipboardData?.items || []);
    const imageItems = items.filter(item => item.type.startsWith('image/'));
    if (imageItems.length === 0) return;

    e.preventDefault();
    imageItems.forEach((item, idx) => {
      const file = item.getAsFile();
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        state.images.push({
          mediaType: file.type || 'image/png',
          data: ev.target.result.split(',')[1],
          name: `スクリーンショット_${Date.now()}_${idx + 1}.png`,
          preview: ev.target.result,
        });
        renderImagePreviews();
        updateAuditButton();
        flashPasteZone();
      };
      reader.readAsDataURL(file);
    });
  });
}

function flashPasteZone() {
  const zone = document.getElementById('imageDropZone');
  zone.classList.add('paste-flash');
  setTimeout(() => zone.classList.remove('paste-flash'), 600);
}

function setupDropZone(zoneId, inputId, handler) {
  const zone  = document.getElementById(zoneId);
  const input = document.getElementById(inputId);

  zone.addEventListener('dragover', e => {
    e.preventDefault();
    zone.classList.add('dragover');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('dragover');
    handler(e.dataTransfer.files);
  });
  input.addEventListener('change', e => {
    handler(e.target.files);
    e.target.value = '';
  });
}

function handleImages(files) {
  Array.from(files)
    .filter(f => f.type.startsWith('image/'))
    .forEach(file => {
      const reader = new FileReader();
      reader.onload = e => {
        state.images.push({
          mediaType: file.type,
          data: e.target.result.split(',')[1],
          name: file.name,
          preview: e.target.result,
        });
        renderImagePreviews();
        updateAuditButton();
      };
      reader.readAsDataURL(file);
    });
}

function renderImagePreviews() {
  document.getElementById('imagePreview').innerHTML = state.images
    .map((img, i) => `
      <div class="image-thumb">
        <img src="${img.preview}" alt="${esc(img.name)}">
        <button class="thumb-remove" onclick="removeImage(${i})">×</button>
        <p class="thumb-name">${esc(img.name)}</p>
      </div>
    `).join('');
}

function removeImage(i) {
  state.images.splice(i, 1);
  renderImagePreviews();
  updateAuditButton();
}

function handleCSV(files) {
  const file = Array.from(files).find(f => f.name.endsWith('.csv') || f.type === 'text/csv');
  if (!file) return;

  const reader = new FileReader();
  reader.onload = e => {
    const text = e.target.result;
    if (text.includes('�')) {
      const reader2 = new FileReader();
      reader2.onload = e2 => {
        state.csvText = e2.target.result;
        renderCSVPreview(state.csvText, file.name);
        updateAuditButton();
      };
      reader2.readAsText(file, 'Shift_JIS');
    } else {
      state.csvText = text;
      renderCSVPreview(state.csvText, file.name);
      updateAuditButton();
    }
  };
  reader.readAsText(file, 'UTF-8');
}

function renderCSVPreview(csvText, fileName) {
  const lines = csvText.split('\n').slice(0, 5);
  const totalLines = csvText.split('\n').length;
  const preview = document.getElementById('csvPreview');
  preview.classList.remove('hidden');
  preview.innerHTML = `
    <div class="csv-header">
      <span>📊 ${esc(fileName)}</span>
      <button class="btn-text-danger" onclick="clearCSV()">削除</button>
    </div>
    <div class="csv-table-wrap">
      <table class="csv-table">
        ${lines.map(row => `<tr>${row.split(',').map(cell => `<td>${esc(cell)}</td>`).join('')}</tr>`).join('')}
      </table>
    </div>
    <p class="csv-note">${totalLines}行のデータ（最初の5行を表示）</p>
  `;
}

function clearCSV() {
  state.csvText = null;
  document.getElementById('csvPreview').classList.add('hidden');
  updateAuditButton();
}

function updateAuditButton() {
  const settings = Storage.getSettings();
  const hasContent = state.images.length > 0 || !!state.csvText;
  const hasKey = !!settings.apiKey;

  document.getElementById('btnAudit').disabled = !hasContent;
  document.getElementById('auditWarning').classList.toggle('hidden', hasKey);
}

async function runAudit() {
  const settings = Storage.getSettings();
  if (!settings.apiKey) { openModal('modalSettings'); return; }

  const btn     = document.getElementById('btnAudit');
  const btnIcon = document.getElementById('auditBtnIcon');
  const btnText = document.getElementById('auditBtnText');

  btn.disabled = true;
  btnIcon.textContent = '⏳';
  btnText.textContent = '審査中...';
  document.getElementById('resultsSection').classList.add('hidden');

  try {
    const { result, rawText, cacheStats } = await API.call({
      images: state.images,
      csvText: state.csvText,
      knowledgeBase: Storage.getKnowledgeBase(),
      cases: Storage.getCases(),
      settings,
    });

    state.lastResult = result;
    renderResults(result, rawText, cacheStats);

  } catch (err) {
    renderError(err.message);
  } finally {
    btn.disabled = false;
    btnIcon.textContent = '🔍';
    btnText.textContent = '審査する';
    updateAuditButton();
  }
}

const JUDGMENT_STYLE = {
  '適正':       { cls: 'judgment-ok',          icon: '✅' },
  '不適正':     { cls: 'judgment-ng',          icon: '❌' },
  '条件付き適正': { cls: 'judgment-conditional', icon: '⚠️' },
  '要確認':     { cls: 'judgment-check',       icon: '❓' },
};

const ITEM_CLS  = { '適正': 'item-ok', '不適正': 'item-ng', '要確認': 'item-check' };
const BADGE_CLS = { '適正': 'badge-ok', '不適正': 'badge-ng', '要確認': 'badge-check', '条件付き適正': 'badge-conditional' };

function renderResults(result, rawText, cacheStats) {
  const section = document.getElementById('resultsSection');

  if (!result) {
    section.innerHTML = `
      <div class="results-card">
        <h2 style="margin-bottom:12px;color:#1e3a5f">審査結果</h2>
        <p class="result-parse-error">⚠ JSON解析に失敗しました。以下がAIの回答です：</p>
        <pre>${esc(rawText)}</pre>
        ${renderCacheStats(cacheStats)}
      </div>`;
    section.classList.remove('hidden');
    section.scrollIntoView({ behavior: 'smooth' });
    return;
  }

  const style = JUDGMENT_STYLE[result.overall] || JUDGMENT_STYLE['要確認'];

  section.innerHTML = `
    <div class="results-card">
      <div class="results-header">
        <h2>審査結果</h2>
        <button class="btn-save-case" onclick="openSaveCaseModal()">💾 事例として保存</button>
      </div>
      <div class="overall-judgment ${style.cls}">
        <span class="judgment-icon">${style.icon}</span>
        <div class="judgment-content">
          <h3 class="judgment-label">${esc(result.overall)}</h3>
          <p class="judgment-reason">${esc(result.overallReason || '')}</p>
        </div>
      </div>
      ${renderItems(result.items)}
      ${result.summary ? `<div class="result-summary"><h3>審査総評</h3><p>${esc(result.summary)}</p></div>` : ''}
      ${result.questions && result.questions.length > 0 ? `<div class="result-questions"><h3>❓ 議員への確認事項</h3><ul>${result.questions.map(q => `<li>${esc(q)}</li>`).join('')}</ul></div>` : ''}
      ${renderCacheStats(cacheStats)}
    </div>`;

  section.classList.remove('hidden');
  section.scrollIntoView({ behavior: 'smooth' });
}

function renderItems(items) {
  if (!items || items.length === 0) return '';
  return `
    <div class="result-items">
      <h3>項目別審査</h3>
      ${items.map(item => `
        <div class="result-item ${ITEM_CLS[item.judgment] || 'item-check'}">
          <div class="item-header">
            <span class="item-judgment-badge ${BADGE_CLS[item.judgment] || 'badge-check'}">${esc(item.judgment)}</span>
            <span class="item-name">${esc(item.item)}</span>
          </div>
          <p class="item-reason">${esc(item.reason || '')}</p>
          ${item.relatedRules && item.relatedRules.length > 0 ? `<div class="item-rules"><span class="rules-label">根拠：</span>${item.relatedRules.map(r => `<span class="rule-tag">${esc(r)}</span>`).join('')}</div>` : ''}
          ${item.recommendation ? `<div class="item-recommendation"><span>💡</span> ${esc(item.recommendation)}</div>` : ''}
        </div>
      `).join('')}
    </div>`;
}

function renderCacheStats(stats) {
  if (!stats) return '';
  const hit = stats.cacheReadTokens > 0;
  return `
    <div class="cache-stats">
      <div class="cache-status ${hit ? 'cache-hit' : 'cache-miss'}">
        ${hit ? '⚡ キャッシュ有効（マニュアル読込コスト約1/10）' : '📝 初回読込（次回からキャッシュ有効）'}
      </div>
      <div class="cache-details">
        <span>入力: ${stats.inputTokens.toLocaleString()}tok</span>
        ${stats.cacheWriteTokens > 0 ? `<span>書込: ${stats.cacheWriteTokens.toLocaleString()}tok</span>` : ''}
        ${stats.cacheReadTokens > 0 ? `<span class="cache-read">キャッシュ読込: ${stats.cacheReadTokens.toLocaleString()}tok</span>` : ''}
        <span>出力: ${stats.outputTokens.toLocaleString()}tok</span>
      </div>
    </div>`;
}

function renderError(msg) {
  const section = document.getElementById('resultsSection');
  section.innerHTML = `
    <div class="results-card">
      <div class="error-message">
        <span class="error-icon">❌</span>
        <div>
          <h3>エラーが発生しました</h3>
          <p>${esc(msg)}</p>
        </div>
      </div>
    </div>`;
  section.classList.remove('hidden');
  section.scrollIntoView({ behavior: 'smooth' });
}

function setupModals() {
  document.getElementById('btnSettings').addEventListener('click', () => openModal('modalSettings'));
  document.getElementById('btnKnowledge').addEventListener('click', () => openModal('modalKnowledge'));
  document.getElementById('btnCases').addEventListener('click', () => {
    renderCasesList();
    openModal('modalCases');
  });
  document.querySelectorAll('[data-close]').forEach(el => {
    el.addEventListener('click', () => closeModal(el.dataset.close));
  });
}

function openModal(id) {
  document.getElementById(id).classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
  document.body.style.overflow = '';
}

function loadSettingsToForm() {
  const s = Storage.getSettings();
  document.getElementById('apiKey').value = s.apiKey || '';
  document.getElementById('modelSelect').value = s.model || 'claude-sonnet-4-6';
}

function setupButtons() {
  document.getElementById('saveSettings').addEventListener('click', saveSettings);
  document.getElementById('saveKnowledge').addEventListener('click', saveKnowledgeBase);
  document.getElementById('exportCases').addEventListener('click', exportCases);
  document.getElementById('clearCases').addEventListener('click', confirmClearCases);
  document.getElementById('btnAudit').addEventListener('click', runAudit);
  document.getElementById('confirmSaveCase').addEventListener('click', confirmSaveCase);
  document.getElementById('cancelSaveCase').addEventListener('click', () => closeModal('modalSaveCase'));
  document.querySelectorAll('.kb-file-input').forEach(input => {
    input.addEventListener('change', handleKBFile);
  });
}

function saveSettings() {
  const apiKey = document.getElementById('apiKey').value.trim();
  const model  = document.getElementById('modelSelect').value;
  Storage.saveSettings({ apiKey, model });
  closeModal('modalSettings');
  updateAuditButton();
  const btn = document.getElementById('saveSettings');
  btn.textContent = '✓ 保存しました';
  setTimeout(() => btn.textContent = '💾 保存', 1500);
}

function loadKnowledgeBaseToForm() {
  const kb = Storage.getKnowledgeBase();
  ['ordinance', 'rules', 'manual', 'precedents'].forEach(key => {
    const el = document.getElementById(`kb-${key}`);
    if (el && kb[key]) {
      el.value = kb[key];
      if (kb[key].trim()) setKBStatus(key, kb[key].length);
    }
  });
}

async function handleKBFile(e) {
  const file = e.target.files[0];
  const type = e.target.dataset.type;
  if (!file) return;
  e.target.value = '';

  if (file.name.toLowerCase().endsWith('.pdf')) {
    await handleKBPDF(file, type);
    return;
  }

  const reader = new FileReader();
  reader.onload = ev => {
    document.getElementById(`kb-${type}`).value = ev.target.result;
    setKBStatus(type, ev.target.result.length);
  };
  reader.readAsText(file, 'UTF-8');
}

async function handleKBPDF(file, type) {
  const settings = Storage.getSettings();
  if (!settings.apiKey) {
    alert('PDFの読み込みにはAPIキーが必要です。先に「設定」からClaude APIキーを入力して保存してください。');
    return;
  }

  const statusEl = document.getElementById(`kb-${type}-status`);
  statusEl.textContent = '⏳ PDF処理中... テキストを抽出しています（数秒かかります）';
  statusEl.className = 'kb-status';

  try {
    const base64 = await readFileAsBase64(file);
    const text   = await extractPDFText(base64, settings);
    document.getElementById(`kb-${type}`).value = text;
    setKBStatus(type, text.length);
  } catch (err) {
    statusEl.textContent = `❌ PDF読み込みエラー: ${err.message}`;
    statusEl.className = 'kb-status';
    console.error('PDF extract error:', err);
  }
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const result = e.target.result;
      if (!result || typeof result !== 'string') { reject(new Error('ファイルの読み込みに失敗しました')); return; }
      const base64 = result.split(',')[1];
      if (!base64) { reject(new Error('Base64変換に失敗しました')); return; }
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('ファイル読み込みエラー: ' + (reader.error?.message || '不明')));
    reader.onabort = () => reject(new Error('ファイル読み込みが中断されました'));
    reader.readAsDataURL(file);
  });
}

async function extractPDFText(base64Data, settings) {
  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), 60000);

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'x-api-key': settings.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'pdfs-2024-09-25',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 32000,
        messages: [{
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64Data } },
            { type: 'text', text: 'このPDFに含まれる全てのテキストを正確に抽出してください。前置き・説明・コメントは一切不要です。テキストの内容のみを出力してください。' },
          ],
        }],
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `APIエラー HTTP ${res.status}`);
    }

    const data = await res.json();
    return data.content?.[0]?.text || '';

  } catch (err) {
    if (err.name === 'AbortError') throw new Error('タイムアウト（60秒）しました。PDFが大きすぎる可能性があります');
    if (err.message === 'Failed to fetch') throw new Error('通信エラー。インターネット接続とAPIキーを確認してください');
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

function setKBStatus(type, charCount) {
  const el = document.getElementById(`kb-${type}-status`);
  if (!el) return;
  el.textContent = `✓ ${(charCount / 1000).toFixed(1)}KB 読み込み済み`;
  el.className = 'kb-status kb-status-ok';
}

function saveKnowledgeBase() {
  const kb = {
    ordinance:  document.getElementById('kb-ordinance').value,
    rules:      document.getElementById('kb-rules').value,
    manual:     document.getElementById('kb-manual').value,
    precedents: document.getElementById('kb-precedents').value,
  };
  const ok = Storage.saveKnowledgeBase(kb);
  const status = document.getElementById('kbSaveStatus');
  status.textContent = ok ? '✓ 保存しました。次回審査からキャッシュが有効になります。' : '⚠ 保存に失敗しました（容量超過の可能性があります）';
  status.style.color = ok ? '#155724' : '#721c24';
  setTimeout(() => status.textContent = '', 4000);
}

function renderCasesList() {
  const cases = Storage.getCases();
  document.getElementById('casesCount').textContent = cases.length > 0 ? `${cases.length}件の事例が蓄積されています` : '';
  const listEl = document.getElementById('casesList');
  if (cases.length === 0) {
    listEl.innerHTML = '<p class="empty-state">まだ事例がありません。審査後に「事例として保存」を押すと蓄積されます。</p>';
    return;
  }
  listEl.innerHTML = cases.map(c => `
    <div class="case-item">
      <div class="case-header">
        <span class="item-judgment-badge ${BADGE_CLS[c.judgment] || 'badge-check'}">${esc(c.judgment)}</span>
        <span class="case-meta">${esc(c.date)} ／ ${esc(c.expenseType || '費目不明')}${c.amount ? ' ／ ¥' + Number(c.amount).toLocaleString() : ''}</span>
        <button class="btn-delete-case" onclick="deleteCase('${esc(c.id)}')">削除</button>
      </div>
      ${c.result?.overallReason ? `<p class="case-reason">${esc(c.result.overallReason)}</p>` : ''}
      ${c.notes ? `<p class="case-notes">📝 ${esc(c.notes)}</p>` : ''}
    </div>
  `).join('');
}

function deleteCase(id) {
  if (!confirm('この事例を削除しますか？')) return;
  Storage.deleteCase(id);
  renderCasesList();
}

function exportCases() {
  const cases = Storage.getCases();
  const blob = new Blob([JSON.stringify(cases, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `seimukatsudouhi_cases_${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function confirmClearCases() {
  if (!confirm('全ての事例を削除しますか？この操作は元に戻せません。')) return;
  Storage.clearCases();
  renderCasesList();
}

function openSaveCaseModal() {
  document.getElementById('saveCaseType').value   = '';
  document.getElementById('saveCaseAmount').value = '';
  document.getElementById('saveCaseNotes').value  = '';
  openModal('modalSaveCase');
}

function confirmSaveCase() {
  if (!state.lastResult) { alert('保存する審査結果がありません。'); return; }
  try {
    Storage.addCase({
      expenseType: document.getElementById('saveCaseType').value,
      amount:      document.getElementById('saveCaseAmount').value || null,
      notes:       document.getElementById('saveCaseNotes').value,
      judgment:    state.lastResult.overall,
      result:      state.lastResult,
    });
  } catch (err) {
    alert(err.message);
    return;
  }
  closeModal('modalSaveCase');
  const btn = document.querySelector('.btn-save-case');
  if (btn) {
    btn.textContent = '✓ 保存しました';
    btn.disabled = true;
    setTimeout(() => { btn.textContent = '💾 事例として保存'; btn.disabled = false; }, 2000);
  }
}

function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}