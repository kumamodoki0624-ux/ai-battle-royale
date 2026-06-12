const express = require('express');
const app = express();

app.use(express.json());
app.use(express.static(__dirname));

// Claude API をサーバー側で呼び出す（APIキーを隠すため）
app.post('/api/battle', async (req, res) => {
  const { players } = req.body;
  if (!players || players.length < 2) {
    return res.status(400).json({ error: 'プレイヤーが足りません' });
  }

  const charInfo = players.map((p, i) =>
    `【キャラ${i+1}】プレイヤー名：${p.name}\nキャラクター名：${p.charName}\n特徴：${p.charDesc}`
  ).join('\n\n');

  const prompt = `あなたはバトルロワイヤルのナレーターです。以下の${players.length}人のキャラクターが戦います。

${charInfo}

このキャラクターたちが戦うバトルロワイヤルを日本語で描写してください。

【ルール】
- バトルの流れを臨場感たっぷりに描写する（600〜900字程度）
- 各キャラクターの特徴・能力を活かした戦い方にする
- 誰がどう脱落していくかを段階的に描写する
- 最後に必ず「【最終順位】」という見出しを書き、以下のJSON形式で出力する

【最終順位】
\`\`\`json
[
  {"rank":1,"name":"キャラクター名","player":"プレイヤー名","comment":"一言コメント"},
  {"rank":2,"name":"キャラクター名","player":"プレイヤー名","comment":"一言コメント"}
]
\`\`\``;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 2000,
        stream: true,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      const err = await response.json();
      return res.status(500).json({ error: err.error?.message || 'API error' });
    }

    // ストリーミングをそのままクライアントに転送
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(decoder.decode(value));
    }
    res.end();

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
