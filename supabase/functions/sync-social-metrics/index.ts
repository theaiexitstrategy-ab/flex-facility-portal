import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GRAPH_API = 'https://graph.facebook.com/v19.0';

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const { data: connections } = await supabase
    .from('social_connections')
    .select('*')
    .eq('is_active', true);

  if (!connections?.length) {
    return new Response(JSON.stringify({ message: 'No active connections' }), { status: 200 });
  }

  for (const conn of connections) {
    // Decrypt token
    const key = new TextEncoder().encode(Deno.env.get('ENCRYPTION_KEY')!).slice(0, 32);
    const [ivHex, encrypted] = conn.access_token.split(':');
    const iv = new Uint8Array(ivHex.match(/.{2}/g)!.map((b: string) => parseInt(b, 16)));
    const encData = new Uint8Array(encrypted.match(/.{2}/g)!.map((b: string) => parseInt(b, 16)));
    const cryptoKey = await crypto.subtle.importKey('raw', key, 'AES-CBC', false, ['decrypt']);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, cryptoKey, encData);
    const token = new TextDecoder().decode(decrypted);

    try {
      let followers = 0, reach = 0, impressions = 0, profileViews = 0, linkClicks = 0, postCount = 0;
      let topPosts: any[] = [];

      if (conn.platform === 'instagram' && conn.ig_account_id) {
        const profileRes = await fetch(`${GRAPH_API}/${conn.ig_account_id}?fields=followers_count,media_count&access_token=${token}`);
        const profile = await profileRes.json();
        if (profile.error?.code === 190) {
          await supabase.from('social_connections').update({ is_active: false }).eq('id', conn.id);
          continue;
        }
        followers = profile.followers_count || 0;
        postCount = profile.media_count || 0;

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

        const mediaRes = await fetch(`${GRAPH_API}/${conn.ig_account_id}/media?fields=id,caption,like_count,comments_count,timestamp,permalink,thumbnail_url,media_type&limit=10&access_token=${token}`);
        const media = await mediaRes.json();
        topPosts = (media.data || []).sort((a: any, b: any) => (b.like_count || 0) - (a.like_count || 0));
      }

      if (conn.platform === 'facebook' && conn.page_id) {
        const pageRes = await fetch(`${GRAPH_API}/${conn.page_id}?fields=followers_count,fan_count&access_token=${token}`);
        const page = await pageRes.json();
        if (page.error?.code === 190) {
          await supabase.from('social_connections').update({ is_active: false }).eq('id', conn.id);
          continue;
        }
        followers = page.followers_count || page.fan_count || 0;

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
      }

      const today = new Date().toISOString().split('T')[0];
      await supabase.from('social_metrics_cache').upsert({
        client_id: conn.client_id,
        platform: conn.platform,
        metric_date: today,
        followers, profile_views: profileViews, reach, impressions,
        link_clicks: linkClicks, post_count: postCount,
        top_posts: topPosts, fetched_at: new Date().toISOString()
      }, { onConflict: 'client_id,platform,metric_date' });

      await supabase.from('social_connections').update({ last_synced_at: new Date().toISOString() }).eq('id', conn.id);
    } catch (err) {
      console.error('Sync error for', conn.platform, ':', err);
    }
  }

  return new Response(JSON.stringify({ success: true }), { status: 200 });
});
