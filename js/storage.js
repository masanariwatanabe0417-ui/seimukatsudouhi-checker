// LocalStorage wrapper
const Storage = {
  _get(key, defaultValue) {
    try {
      const val = localStorage.getItem(key);
      return val !== null ? JSON.parse(val) : defaultValue;
    } catch {
      return defaultValue;
    }
  },

  _set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error('Storage error:', e);
      return false;
    }
  },

  getSettings() {
    return this._get('smc_settings', { apiKey: '', model: 'claude-sonnet-4-6' });
  },

  saveSettings(settings) {
    return this._set('smc_settings', settings);
  },

  getKnowledgeBase() {
    return this._get('smc_knowledge', { ordinance: '', rules: '', manual: '', precedents: '' });
  },

  saveKnowledgeBase(kb) {
    return this._set('smc_knowledge', kb);
  },

  getCases() {
    return this._get('smc_cases', []);
  },

  addCase(data) {
    const cases = this.getCases();
    const entry = {
      ...data,
      id: `case_${Date.now()}`,
      date: new Date().toLocaleDateString('ja-JP'),
    };
    cases.unshift(entry);
    if (cases.length > 200) cases.pop();
    const ok = this._set('smc_cases', cases);
    if (!ok) throw new Error('事例の保存に失敗しました。ストレージ容量が不足しています。古い事例を削除してください。');
    return ok;
  },

  deleteCase(id) {
    const cases = this.getCases().filter(c => c.id !== id);
    return this._set('smc_cases', cases);
  },

  clearCases() {
    return this._set('smc_cases', []);
  },
};