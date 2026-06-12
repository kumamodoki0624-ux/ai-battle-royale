const express = require('express');
const app = express();

app.use(express.json());
app.use(express.static(__dirname));

// ══════════════════════════════════════
//  共通：Claude APIストリーミング呼び出し
// ══════════════════════════════════════
async function callClaude(res, prompt, maxTokens = 2000) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.CLAUDE_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: maxTokens,
      stream: true,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || 'API error');
  }

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
}

// ══════════════════════════════════════
//  バトルロワイヤル API
// ══════════════════════════════════════
app.post('/api/battle', async (req, res) => {
  const { players } = req.body;
  if (!players || players.length < 2) return res.status(400).json({ error: 'プレイヤーが足りません' });

  const charInfo = players.map((p, i) =>
    `【キャラ${i+1}】プレイヤー名：${p.name}\nキャラクター名：${p.charName}\n特徴：${p.charDesc}`
  ).join('\n\n');

  const minChars = 600 + (players.length - 2) * 300;
  const maxChars = minChars + 400;

  const prompt = `あなたはバトルロワイヤルのナレーターです。以下の${players.length}人のキャラクターが戦います。

${charInfo}

このキャラクターたちが戦うバトルロワイヤルを日本語で描写してください。

【ルール】
- バトルの流れを臨場感たっぷりに描写する（${minChars}〜${maxChars}字程度）
- 各キャラクターの特徴・能力を必ず活かした戦い方にする
- 全員が見せ場を持つように描写する
- 誰がどう脱落していくかを段階的に丁寧に描写する
- 必殺技・固有スキルは具体的な演出で描写する
- 最後に必ず「【最終順位】」という見出しを書き、以下のJSON形式で出力する

【最終順位】
\`\`\`json
[
  {"rank":1,"name":"キャラクター名","player":"プレイヤー名","comment":"一言コメント"},
  {"rank":2,"name":"キャラクター名","player":"プレイヤー名","comment":"一言コメント"}
]
\`\`\``;

  try { await callClaude(res, prompt, 4000); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════
//  ダンジョン探索 API
// ══════════════════════════════════════

// シナリオ生成
app.post('/api/dungeon/start', async (req, res) => {
  const { players } = req.body;
  if (!players || players.length < 1) return res.status(400).json({ error: 'プレイヤーが足りません' });

  const partyInfo = players.map(p =>
    `・${p.name}（${p.job}）：${p.skill}`
  ).join('\n');

  const prompt = `あなたはダンジョン探索ゲームのダンジョンマスターです。
以下のパーティーがダンジョンに挑みます。

【パーティー】
${partyInfo}

ダンジョン探索を開始してください。

【ルール】
- 冒頭でダンジョンの雰囲気・背景を100字程度で描写する
- 最初の状況を描写して、パーティーが直面する選択肢を3つ提示する
- 選択肢は必ず以下のJSON形式で出力する（描写の後に続けて出力）
- 選択肢はそれぞれ異なる戦略・リスクを持つものにする

\`\`\`json
{
  "choices": [
    {"id":1,"text":"選択肢の内容（20字以内）"},
    {"id":2,"text":"選択肢の内容（20字以内）"},
    {"id":3,"text":"選択肢の内容（20字以内）"}
  ],
  "turn": 1
}
\`\`\``;

  try { await callClaude(res, prompt, 1000); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ターン進行
app.post('/api/dungeon/turn', async (req, res) => {
  const { players, history, actions, turn } = req.body;

  const partyInfo = players.map(p => `・${p.name}（${p.job}）`).join('\n');
  const historyText = history.join('\n\n---\n\n');
  const actionText = actions.map(a => `${a.playerName}：「${a.action}」`).join('\n');
  const isFinal = turn >= 4;

  const prompt = `あなたはダンジョン探索ゲームのダンジョンマスターです。

【パーティー】
${partyInfo}

【これまでの経緯】
${historyText}

【今回の全員の行動】
${actionText}

${isFinal ? `
これは最終ターンです。ボスとの決戦を描写し、パーティーの勝敗とエンディングを描写してください。
全員の活躍を描写した後、以下のJSON形式で結果を出力してください。

\`\`\`json
{
  "ending": true,
  "result": "victory" または "defeat",
  "mvp": "最も活躍したプレイヤー名",
  "comment": "締めの一言（30字以内）"
}
\`\`\`` : `
全員の行動を受けて、その結果を臨場感たっぷりに描写してください（200〜300字）。
各プレイヤーの職業・スキルを活かした描写にしてください。
描写の後、次の選択肢を3つ提示してください。

\`\`\`json
{
  "choices": [
    {"id":1,"text":"選択肢の内容（20字以内）"},
    {"id":2,"text":"選択肢の内容（20字以内）"},
    {"id":3,"text":"選択肢の内容（20字以内）"}
  ],
  "turn": ${turn + 1}
}
\`\`\``}`;

  try { await callClaude(res, prompt, 1500); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
