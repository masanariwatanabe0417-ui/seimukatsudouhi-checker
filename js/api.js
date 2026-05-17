// Claude API client with prompt caching
const API = {
  URL: 'https://api.anthropic.com/v1/messages',

  buildSystem(kb, cases) {
    const content = [];

    content.push({
      type: 'text',
      text: `あなたは横須賀市議会の政務活動費審査の専門家です。\n申請内容が横須賀市の条例・規則・運用マニュアルに照らして適正かどうかを厳密に審査してください。\n\n必ず以下のJSON形式のみで返答してください（説明文や前置きは不要）:\n{\n  "overall": "適正" または "不適正" または "条件付き適正" または "要確認",\n  "overallReason": "総合判断の理由（1〜2文）",\n  "items": [\n    {\n      "item": "審査項目の説明",\n      "judgment": "適正" または "不適正" または "要確認",\n      "reason": "判断根拠",\n      "relatedRules": ["根拠条文・規則名"],\n      "recommendation": "改善提案または確認事項（不適正・要確認の場合のみ）"\n    }\n  ],\n  "summary": "審査総評（2〜3文）",\n  "questions": ["議員への確認事項（あれば）"]\n}`
    });

    const kbEntries = [
      { key: 'ordinance',  label: '横須賀市政務活動費条例' },
      { key: 'rules',      label: '施行規則' },
      { key: 'manual',     label: '運用マニュアル' },
      { key: 'precedents', label: '参考判例' },
    ];

    for (const { key, label } of kbEntries) {
      if (kb[key] && kb[key].trim().length > 0) {
        content.push({
          type: 'text',
          text: `【${label}】\n${kb[key]}`,
          cache_control: { type: 'ephemeral' },
        });
      }
    }

    if (cases && cases.length > 0) {
      const examples = cases.slice(0, 30).map(c =>
        `・${c.date} ${c.expenseType || '費目不明'}` +
        (c.amount ? ` ¥${Number(c.amount).toLocaleString()}` : '') +
        ` → ${c.judgment}` +
        (c.result?.overallReason ? `\n  理由: ${c.result.overallReason}` : '') +
        (c.notes ? `\n  備考: ${c.notes}` : '')
      ).join('\n\n');

      content.push({
        type: 'text',
        text: `【過去の審査事例（参考・一貫性確保のため）】\n${examples}`,
      });
    }

    return content;
  },

  buildUserContent(images, csvText) {
    const content = [];

    content.push({
      type: 'text',
      text: '以下の申請書類を審査してください。画像はセムカンの申請画面および添付領収書です。',
    });

    for (const img of images) {
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: img.mediaType, data: img.data },
      });
    }

    if (csvText) {
      content.push({
        type: 'text',
        text: `【収支明細CSV】\n${csvText}`,
      });
    }

    content.push({
      type: 'text',
      text: '知識ベースの条例・規則・マニュアルおよび過去事例に基づいて詳細に審査し、指定のJSON形式のみで返答してください。',
    });

    return content;
  },

  async call({ images, csvText, knowledgeBase, cases, settings }) {
    const { apiKey, model } = settings;

    if (!apiKey) throw new Error('APIキーが設定されていません。右上の「設定」から入力してください。');
    if (images.length === 0 && !csvText) throw new Error('画像またはCSVをアップロードしてください。');

    const systemContent = this.buildSystem(knowledgeBase, cases);
    const userContent = this.buildUserContent(images, csvText);

    const res = await fetch(this.URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'anthropic-beta': 'prompt-caching-2024-07-31',
      },
      body: JSON.stringify({
        model: model || 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: systemContent,
        messages: [{ role: 'user', content: userContent }],
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `APIエラー (HTTP ${res.status})`);
    }

    const data = await res.json();
    const rawText = data.content?.[0]?.text || '';
    const usage = data.usage || {};

    let result = null;
    try {
      const match = rawText.match(/\{[\s\S]*\}/);
      if (match) result = JSON.parse(match[0]);
    } catch {
      result = null;
    }

    return {
      result,
      rawText,
      cacheStats: {
        inputTokens: usage.input_tokens || 0,
        cacheWriteTokens: usage.cache_creation_input_tokens || 0,
        cacheReadTokens: usage.cache_read_input_tokens || 0,
        outputTokens: usage.output_tokens || 0,
      },
    };
  },
};