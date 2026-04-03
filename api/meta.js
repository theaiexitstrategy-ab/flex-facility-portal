import jwt from 'jsonwebtoken';
import supabase from '../lib/supabase.js';
import { encrypt, decrypt } from '../lib/crypto.js';

function requireAuth(req) {
  const cookie = req.headers.cookie || '';
  const match = cookie.match(/flex_session=([^;]+)/);
  if (!match) return false;
  try { jwt.verify(match[1], process.env.JWT_SECRET); return true; } catch { return false; }
}

const GRAPH_API = 'https://graph.facebook.com/v19.0';
const CLIENT_ID = 'flex-facility';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  const action = req.query.action;

  // ── CONNECT: redirect to Facebook OAuth ──
  if (action === 'connect') {
    if (!requireAuth(req)) return res.redirect('/login');
    const state = Buffer.from(JSON.stringify({ clientId: CLIENT_ID, ts: Date.now() })).toString('base64');
    const scopes = 'pages_read_engagement,pages_show_list,instagram_basic,instagram_manage_insights,public_profile';
    const url = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${process.env.META_APP_ID}&redirect_uri=${encodeURIComponent(process.env.META_REDIRECT_URI)}&scope=${scopes}&state=${state}`;
    return res.redirect(url);
  }

  // ── CALLBACK: exchange code for token ──
  if (action === 'callback') {
    try {
      const { code, state } = req.query;
      if (!code || !state) return res.redirect('/dashboard?error=missing_params');

      // Validate state (CSRF)
      try {
        const decoded = JSON.parse(Buffer.from(state, 'base64').toString());
        if (decoded.clientId !== CLIENT_ID || Date.now() - decoded.ts > 600000) {
          return res.redirect('/dashboard?error=invalid_state');
        }
      } catch { return res.redirect('/dashboard?error=invalid_state'); }

      // Exchange code for short-lived token
      const tokenUrl = `${GRAPH_API}/oauth/access_token?client_id=${process.env.META_APP_ID}&client_secret=${process.env.META_APP_SECRET}&redirect_uri=${encodeURIComponent(process.env.META_REDIRECT_URI)}&code=${code}`;
      const tokenRes = await fetch(tokenUrl);
      const tokenData = await tokenRes.json();
      if (tokenData.error) return res.redirect('/dashboard?error=token_exchange_failed');

      // Exchange for long-lived token
      const llUrl = `${GRAPH_API}/oauth/access_token?grant_type=fb_exchange_token&client_id=${process.env.META_APP_ID}&client_secret=${process.env.META_APP_SECRET}&fb_exchange_token=${tokenData.access_token}`;
      const llRes = await fetch(llUrl);
      const llData = await llRes.json();
      const longToken = llData.access_token || tokenData.access_token;
      const expiresIn = llData.expires_in || 5184000; // 60 days default

      // Fetch Facebook Pages
      const pagesRes = await fetch(`${GRAPH_API}/me/accounts?access_token=${longToken}`);
      const pagesData = await pagesRes.json();
      const page = pagesData.data?.[0];

      let igAccountId = null, igUsername = null;
      if (page) {
        // Get page token for better access
        const pageToken = page.access_token || longToken;

        // Fetch Instagram Business Account
        const igRes = await fetch(`${GRAPH_API}/${page.id}?fields=instagram_business_account&access_token=${pageToken}`);
        const igData = await igRes.json();
        igAccountId = igData.instagram_business_account?.id;

        if (igAccountId) {
          const igProfile = await fetch(`${GRAPH_API}/${igAccountId}?fields=username&access_token=${pageToken}`);
          const igProfileData = await igProfile.json();
          igUsername = igProfileData.username;
        }

        // Store Facebook connection
        const encryptedToken = encrypt(pageToken);
        const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
        await supabase.from('social_connections').upsert({
          client_id: CLIENT_ID, platform: 'facebook', access_token: encryptedToken,
          token_expires_at: expiresAt, page_id: page.id, page_name: page.name,
          ig_account_id: igAccountId, ig_username: igUsername,
          connected_at: new Date().toISOString(), is_active: true
        }, { onConflict: 'client_id,platform' });

        // Also store Instagram connection if available
        if (igAccountId) {
          await supabase.from('social_connections').upsert({
            client_id: CLIENT_ID, platform: 'instagram', access_token: encryptedToken,
            token_expires_at: expiresAt, page_id: page.id, page_name: page.name,
            ig_account_id: igAccountId, ig_username: igUsername,
            connected_at: new Date().toISOString(), is_active: true
          }, { onConflict: 'client_id,platform' });
        }
      }

      return res.redirect('/dashboard?connected=true');
    } catch (err) {
      console.error('Meta callback error:', err);
      return res.redirect('/dashboard?error=callback_failed');
    }
  }

  // All remaining actions require auth
  if (!requireAuth(req)) return res.status(401).json({ success: false, error: 'Unauthorized' });

  // ── DISCONNECT ──
  if (action === 'disconnect') {
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST only' });
    await supabase.from('social_connections').update({ is_active: false }).eq('client_id', CLIENT_ID);
    await supabase.from('social_metrics_cache').delete().eq('client_id', CLIENT_ID);
    return res.status(200).json({ success: true });
  }

  // ── STATUS: check connection ──
  if (action === 'status') {
    const { data } = await supabase.from('social_connections').select('platform, ig_username, page_name, is_active, connected_at, last_synced_at, token_expires_at').eq('client_id', CLIENT_ID).eq('is_active', true);
    return res.status(200).json({ success: true, connected: (data || []).length > 0, connections: data || [] });
  }

  // ── METRICS: get cached metrics ──
  if (action === 'metrics') {
    const today = new Date().toISOString().split('T')[0];
    const { data } = await supabase.from('social_metrics_cache').select('*').eq('client_id', CLIENT_ID).eq('metric_date', today);
    return res.status(200).json({ success: true, data: data || [] });
  }

  // ── SYNC-NOW: trigger immediate sync ──
  if (action === 'sync-now') {
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST only' });
    try {
      const { data: connections } = await supabase.from('social_connections').select('*').eq('client_id', CLIENT_ID).eq('is_active', true);
      if (!connections?.length) return res.status(200).json({ success: true, message: 'No active connections' });

      for (const conn of connections) {
        const token = decrypt(conn.access_token);
        let followers = 0, reach = 0, impressions = 0, profileViews = 0, linkClicks = 0, postCount = 0;
        let topPosts = [];

        if (conn.platform === 'instagram' && conn.ig_account_id) {
          const profileRes = await fetch(`${GRAPH_API}/${conn.ig_account_id}?fields=followers_count,media_count&access_token=${token}`);
          const profile = await profileRes.json();
          if (profile.error?.code === 190) {
            await supabase.from('social_connections').update({ is_active: false }).eq('id', conn.id);
            continue;
          }
          followers = profile.followers_count || 0;
          postCount = profile.media_count || 0;

          try {
            const insightsRes = await fetch(`${GRAPH_API}/${conn.ig_account_id}/insights?metric=reach,impressions,profile_views&period=day&access_token=${token}`);
            const insights = await insightsRes.json();
            if (insights.data) {
              for (const m of insights.data) {
                const val = m.values?.[0]?.value || 0;
                if (m.name === 'reach') reach = val;
                if (m.name === 'impressions') impressions = val;
                if (m.name === 'profile_views') profileViews = val;
              }
            }
          } catch {}

          try {
            const mediaRes = await fetch(`${GRAPH_API}/${conn.ig_account_id}/media?fields=id,caption,like_count,comments_count,timestamp,permalink,thumbnail_url,media_type&limit=10&access_token=${token}`);
            const media = await mediaRes.json();
            topPosts = (media.data || []).sort((a, b) => (b.like_count || 0) - (a.like_count || 0));
          } catch {}
        }

        if (conn.platform === 'facebook' && conn.page_id) {
          const pageRes = await fetch(`${GRAPH_API}/${conn.page_id}?fields=followers_count,fan_count&access_token=${token}`);
          const page = await pageRes.json();
          if (page.error?.code === 190) {
            await supabase.from('social_connections').update({ is_active: false }).eq('id', conn.id);
            continue;
          }
          followers = page.followers_count || page.fan_count || 0;

          try {
            const insightsRes = await fetch(`${GRAPH_API}/${conn.page_id}/insights?metric=page_impressions,page_reach,page_views_total,page_post_engagements&period=day&access_token=${token}`);
            const insights = await insightsRes.json();
            if (insights.data) {
              for (const m of insights.data) {
                const val = m.values?.[0]?.value || 0;
                if (m.name === 'page_impressions') impressions = val;
                if (m.name === 'page_reach') reach = val;
                if (m.name === 'page_views_total') profileViews = val;
                if (m.name === 'page_post_engagements') linkClicks = val;
              }
            }
          } catch {}
        }

        const today = new Date().toISOString().split('T')[0];
        await supabase.from('social_metrics_cache').upsert({
          client_id: conn.client_id, platform: conn.platform, metric_date: today,
          followers, profile_views: profileViews, reach, impressions,
          link_clicks: linkClicks, post_count: postCount,
          top_posts: topPosts, fetched_at: new Date().toISOString()
        }, { onConflict: 'client_id,platform,metric_date' });

        await supabase.from('social_connections').update({ last_synced_at: new Date().toISOString() }).eq('id', conn.id);
      }
      return res.status(200).json({ success: true });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // ── REFRESH-TOKEN ──
  if (action === 'refresh-token') {
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST only' });
    try {
      const { data: connections } = await supabase.from('social_connections').select('*').eq('client_id', CLIENT_ID).eq('is_active', true);
      for (const conn of connections || []) {
        const oldToken = decrypt(conn.access_token);
        const refreshUrl = `${GRAPH_API}/oauth/access_token?grant_type=fb_exchange_token&client_id=${process.env.META_APP_ID}&client_secret=${process.env.META_APP_SECRET}&fb_exchange_token=${oldToken}`;
        const refreshRes = await fetch(refreshUrl);
        const refreshData = await refreshRes.json();
        if (refreshData.access_token) {
          const newEncrypted = encrypt(refreshData.access_token);
          const expiresAt = new Date(Date.now() + (refreshData.expires_in || 5184000) * 1000).toISOString();
          await supabase.from('social_connections').update({ access_token: newEncrypted, token_expires_at: expiresAt }).eq('id', conn.id);
        }
      }
      return res.status(200).json({ success: true });
    } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
  }

  return res.status(400).json({ success: false, error: 'Unknown action' });
}
