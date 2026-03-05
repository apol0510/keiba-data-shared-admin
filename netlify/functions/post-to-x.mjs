/**
 * Netlify Function: X（旧Twitter）への投稿
 *
 * 機能:
 * - OAuth 1.0a認証でX API v2を使用
 * - 南関競馬結果を自動投稿
 *
 * 環境変数:
 * - X_API_KEY: X API Key (Consumer Key)
 * - X_API_SECRET: X API Secret (Consumer Secret)
 * - X_ACCESS_TOKEN: Access Token
 * - X_ACCESS_TOKEN_SECRET: Access Token Secret
 */

import crypto from 'crypto';

export default async (req, context) => {
  // CORSヘッダー設定
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // OPTIONSリクエスト対応（CORS preflight）
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  // POSTリクエストのみ許可
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method Not Allowed' }),
      { status: 405, headers }
    );
  }

  try {
    // リクエストボディをパース
    const body = await req.json();
    const { text, date, venue, totalRaces } = body;

    console.log('[post-to-x] リクエスト受信:', { text, date, venue, totalRaces });

    if (!text) {
      return new Response(
        JSON.stringify({ error: 'Missing required field: text' }),
        { status: 400, headers }
      );
    }

    // 環境変数チェック
    const X_API_KEY = process.env.X_API_KEY;
    const X_API_SECRET = process.env.X_API_SECRET;
    const X_ACCESS_TOKEN = process.env.X_ACCESS_TOKEN;
    const X_ACCESS_TOKEN_SECRET = process.env.X_ACCESS_TOKEN_SECRET;

    if (!X_API_KEY || !X_API_SECRET || !X_ACCESS_TOKEN || !X_ACCESS_TOKEN_SECRET) {
      return new Response(
        JSON.stringify({
          error: 'X API credentials not configured',
          hint: 'Netlify環境変数を設定してください'
        }),
        { status: 500, headers }
      );
    }

    // X API v2: ツイート投稿エンドポイント
    const url = 'https://api.twitter.com/2/tweets';
    const method = 'POST';

    // OAuth 1.0a署名生成
    const oauth = {
      oauth_consumer_key: X_API_KEY,
      oauth_token: X_ACCESS_TOKEN,
      oauth_signature_method: 'HMAC-SHA1',
      oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
      oauth_nonce: crypto.randomBytes(16).toString('hex'),
      oauth_version: '1.0'
    };

    // 署名ベース文字列を生成
    const parameterString = Object.keys(oauth)
      .sort()
      .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(oauth[key])}`)
      .join('&');

    const signatureBaseString = [
      method,
      encodeURIComponent(url),
      encodeURIComponent(parameterString)
    ].join('&');

    // 署名キーを生成
    const signingKey = `${encodeURIComponent(X_API_SECRET)}&${encodeURIComponent(X_ACCESS_TOKEN_SECRET)}`;

    // HMAC-SHA1署名を生成
    const signature = crypto
      .createHmac('sha1', signingKey)
      .update(signatureBaseString)
      .digest('base64');

    oauth.oauth_signature = signature;

    // Authorizationヘッダーを生成
    const authHeader = 'OAuth ' + Object.keys(oauth)
      .sort()
      .map(key => `${encodeURIComponent(key)}="${encodeURIComponent(oauth[key])}"`)
      .join(', ');

    // X API v2にPOSTリクエスト
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
        'User-Agent': 'KeibaDataSharedBot/1.0'
      },
      body: JSON.stringify({ text })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('X API Error:', errorData);
      return new Response(
        JSON.stringify({
          error: 'Failed to post to X',
          details: errorData,
          status: response.status
        }),
        { status: response.status, headers }
      );
    }

    const result = await response.json();
    console.log('[post-to-x] 投稿成功:', result);

    // 成功レスポンス
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Xに投稿しました',
        tweetId: result.data?.id,
        tweetUrl: result.data?.id ? `https://x.com/KeibaDataShared/status/${result.data.id}` : null,
        text: text
      }),
      { status: 200, headers }
    );

  } catch (error) {
    console.error('Post to X Error:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal Server Error',
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      }),
      { status: 500, headers }
    );
  }
};
