const { TwitterApi } = require('twitter-api-v2');
const { createRestAPIClient } = require('masto');
const fetch = require('node-fetch');

class SocialPoster {
  constructor(credentials) {
    this.credentials = credentials || {};
  }

  buildShareText(post, postUrl) {
    const tags = (post.tags || []).slice(0, 3).map(t => `#${t.replace(/\s+/g, '')}`).join(' ');
    let text = post.title;
    if (post.subtitle) text += ` - ${post.subtitle}`;
    if (tags) text += `\n\n${tags}`;
    text += `\n\n${postUrl}`;
    return text;
  }

  async postToTwitter(post, postUrl) {
    const cfg = this.credentials.twitter || {};
    if (!cfg.enabled || !cfg.appKey || !cfg.appSecret || !cfg.accessToken || !cfg.accessSecret) {
      return { platform: 'twitter', skipped: true, reason: 'not_configured' };
    }
    try {
      const client = new TwitterApi({
        appKey: cfg.appKey,
        appSecret: cfg.appSecret,
        accessToken: cfg.accessToken,
        accessSecret: cfg.accessSecret,
      });
      const text = this.buildShareText(post, postUrl);
      const truncated = text.length > 280 ? text.slice(0, 277) + '...' : text;
      const { data } = await client.v2.tweet(truncated);
      return { platform: 'twitter', success: true, tweetId: data.id };
    } catch (err) {
      console.error('Twitter post failed:', err.message);
      return { platform: 'twitter', success: false, error: err.message };
    }
  }

  async postToLinkedIn(post, postUrl) {
    const cfg = this.credentials.linkedin || {};
    if (!cfg.enabled || !cfg.accessToken || !cfg.personUrn) {
      return { platform: 'linkedin', skipped: true, reason: 'not_configured' };
    }
    try {
      const text = this.buildShareText(post, postUrl);
      const payload = {
        author: cfg.personUrn,
        commentary: text,
        visibility: 'PUBLIC',
        distribution: {
          feedDistribution: 'MAIN_FEED',
          targetEntities: [],
          thirdPartyDistributionChannels: [],
        },
        lifecycleState: 'PUBLISHED',
        isReshareDisabledByAuthor: false,
      };
      const res = await fetch('https://api.linkedin.com/rest/posts', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cfg.accessToken}`,
          'Content-Type': 'application/json',
          'LinkedIn-Version': '202504',
          'X-Restli-Protocol-Version': '2.0.0',
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`LinkedIn API ${res.status}: ${body}`);
      }
      const postId = res.headers.get('x-restli-id');
      return { platform: 'linkedin', success: true, postId };
    } catch (err) {
      console.error('LinkedIn post failed:', err.message);
      return { platform: 'linkedin', success: false, error: err.message };
    }
  }

  async postToFacebook(post, postUrl) {
    const cfg = this.credentials.facebook || {};
    if (!cfg.enabled || !cfg.accessToken || !cfg.pageId) {
      return { platform: 'facebook', skipped: true, reason: 'not_configured' };
    }
    try {
      const text = this.buildShareText(post, postUrl);
      const res = await fetch(
        `https://graph.facebook.com/v21.0/${cfg.pageId}/feed`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: text,
            link: postUrl,
            access_token: cfg.accessToken,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error?.message || `Facebook API ${res.status}`);
      }
      return { platform: 'facebook', success: true, postId: data.id };
    } catch (err) {
      console.error('Facebook post failed:', err.message);
      return { platform: 'facebook', success: false, error: err.message };
    }
  }

  async postToMastodon(post, postUrl) {
    const cfg = this.credentials.mastodon || {};
    if (!cfg.enabled || !cfg.url || !cfg.accessToken) {
      return { platform: 'mastodon', skipped: true, reason: 'not_configured' };
    }
    try {
      const client = createRestAPIClient({
        url: cfg.url,
        accessToken: cfg.accessToken,
      });
      const text = this.buildShareText(post, postUrl);
      const truncated = text.length > 500 ? text.slice(0, 497) + '...' : text;
      const status = await client.v1.statuses.create({
        status: truncated,
        visibility: 'public',
      });
      return { platform: 'mastodon', success: true, postUrl: status.url };
    } catch (err) {
      console.error('Mastodon post failed:', err.message);
      return { platform: 'mastodon', success: false, error: err.message };
    }
  }

  async postToAll(post, postUrl) {
    const results = await Promise.allSettled([
      this.postToTwitter(post, postUrl),
      this.postToLinkedIn(post, postUrl),
      this.postToFacebook(post, postUrl),
      this.postToMastodon(post, postUrl),
    ]);
    return results.map(r => r.status === 'fulfilled' ? r.value : {
      platform: 'unknown',
      success: false,
      error: r.reason?.message || 'Unknown error',
    });
  }
}

module.exports = SocialPoster;
