import { siteConfig } from './config';

/**
 * Single source of truth for "which media does this reel actually play?".
 *
 * Priority (never deviates — see the homepage Reels requirements):
 *   1. Cloudinary video  (reel has a cloudinaryPublicId, or a res.cloudinary.com video URL)
 *   2. An explicit direct video file URL (.mp4/.webm/.ogg/.mov)
 *   3. An explicit YouTube URL — ONLY if 1 and 2 are absent
 *   4. An explicit Instagram URL — ONLY if 1–3 are absent
 *   5. Nothing playable → an "unavailable" state
 *
 * A `youtubeEmbed` value NEVER wins over a Cloudinary/direct video, and a
 * `youtubeEmbed` that is not actually a YouTube link (stale/garbage data) is
 * ignored rather than played.
 */

export interface ReelInput {
  _id: string;
  title: string;
  description?: string;
  category?: string;
  duration?: string;
  videoUrl?: string;
  cloudinaryPublicId?: string;
  cloudinaryResourceType?: string;
  thumbnailUrl?: string;
  thumbnail?: string;
  youtubeEmbed?: string;
  instagramUrl?: string;
  views?: number;
  viewsCount?: number;
  icon?: string;
}

export type ReelMedia =
  | { kind: 'cloudinary'; src: string; fallbackSrc?: string }
  | { kind: 'file'; src: string }
  | { kind: 'youtube'; embedSrc: string; watchUrl: string }
  | { kind: 'instagram'; url: string }
  | { kind: 'none' };

const sanitizeCloud = (name = ''): string => {
  const clean = name.trim().replace(/^['"]|['"]$/g, '');
  if (clean === 'nbcbpuqlm') return 'nbcbpuql';
  return clean || 'nbcbpuql';
};

const CLOUD = sanitizeCloud(siteConfig.cloudinaryCloudName);

export const isYouTubeUrl = (url = '') => /(?:youtube\.com|youtu\.be)/i.test(url);
export const isInstagramUrl = (url = '') => /(?:instagram\.com|instagr\.am)/i.test(url);

const isCloudinaryVideoUrl = (url = '') =>
  /res\.cloudinary\.com\/.+\/video\/upload\//i.test(url) ||
  (/res\.cloudinary\.com\//i.test(url) && /\.(mp4|webm|ogg|mov|m3u8)(\?.*)?$/i.test(url));

const isDirectVideoFileUrl = (url = '') => {
  if (!url || isYouTubeUrl(url) || isInstagramUrl(url)) return false;
  return /\.(mp4|webm|ogg|mov|m3u8)(\?.*)?$/i.test(url) || /res\.cloudinary\.com\//i.test(url);
};

export const extractCloudNameFromUrl = (url = ''): string => {
  const m = url.match(/res\.cloudinary\.com\/([^/]+)\//i);
  return m ? sanitizeCloud(m[1]) : '';
};

/** Bare public id (e.g. "v3" or "apex_reels/abc") → full Cloudinary MP4 delivery URL. */
export const buildCloudinaryVideoUrl = (publicId: string, cloudName?: string) => {
  const cloud = sanitizeCloud(cloudName || CLOUD);
  const id = String(publicId).trim().replace(/^\/+/, '').replace(/\.(mp4|webm|mov|ogg)$/i, '');
  return `https://res.cloudinary.com/${cloud}/video/upload/f_auto:video,q_auto/${id}.mp4`;
};

/** First-frame poster for a Cloudinary video public id. */
export const buildCloudinaryVideoPoster = (publicId: string, cloudName?: string) => {
  const cloud = sanitizeCloud(cloudName || CLOUD);
  const id = String(publicId).trim().replace(/^\/+/, '').replace(/\.(mp4|webm|mov|ogg)$/i, '');
  return `https://res.cloudinary.com/${cloud}/video/upload/so_0,f_auto,q_auto/${id}.jpg`;
};

const extractPublicIdFromUrl = (url: string) => {
  // https://res.cloudinary.com/<cloud>/video/upload/(<transforms>/)?<publicId>.<ext>
  const m = url.match(/\/video\/upload\/(?:[^/]+\/)*([^/]+?)\.(?:mp4|webm|mov|ogg|m3u8)(?:\?.*)?$/i);
  return m ? m[1] : '';
};

const toYouTubeEmbed = (rawUrl = ''): { embedSrc: string; watchUrl: string } | null => {
  if (!rawUrl || !isYouTubeUrl(rawUrl)) return null;
  let id = '';
  if (rawUrl.includes('youtube.com/embed/')) id = rawUrl.split('youtube.com/embed/')[1]?.split(/[?/]/)[0] || '';
  else if (rawUrl.includes('youtu.be/')) id = rawUrl.split('youtu.be/')[1]?.split(/[?/]/)[0] || '';
  else if (rawUrl.includes('youtube.com/watch')) {
    try {
      id = new URL(rawUrl).searchParams.get('v') || '';
    } catch {
      id = '';
    }
  } else if (rawUrl.includes('youtube.com/shorts/')) id = rawUrl.split('youtube.com/shorts/')[1]?.split(/[?/]/)[0] || '';
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return null;
  return {
    embedSrc: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1`,
    watchUrl: `https://www.youtube.com/watch?v=${id}`,
  };
};

export const resolveReelMedia = (reel: ReelInput): ReelMedia => {
  const publicId = (reel.cloudinaryPublicId || '').trim();
  const videoUrl = (reel.videoUrl || '').trim();
  const cloudFromUrl = extractCloudNameFromUrl(videoUrl);
  const cloud = cloudFromUrl || CLOUD;
  const fallbackSrc = isDirectVideoFileUrl(videoUrl) || isCloudinaryVideoUrl(videoUrl) ? videoUrl : undefined;

  // 1 — Cloudinary video (public id, or a cloudinary video URL we can normalise)
  if (publicId && !isYouTubeUrl(publicId) && !isInstagramUrl(publicId)) {
    return { kind: 'cloudinary', src: buildCloudinaryVideoUrl(publicId, cloud), fallbackSrc };
  }
  if (isCloudinaryVideoUrl(videoUrl)) {
    const fromUrl = extractPublicIdFromUrl(videoUrl);
    return { kind: 'cloudinary', src: fromUrl ? buildCloudinaryVideoUrl(fromUrl, cloud) : videoUrl, fallbackSrc };
  }

  // 2 — explicit direct video file
  if (isDirectVideoFileUrl(videoUrl)) {
    return { kind: 'file', src: videoUrl };
  }

  // 3 — explicit YouTube (embed field first, then a youtube videoUrl)
  const yt = toYouTubeEmbed(reel.youtubeEmbed || '') || toYouTubeEmbed(videoUrl);
  if (yt) return { kind: 'youtube', ...yt };

  // 4 — explicit Instagram
  const insta = [reel.instagramUrl, videoUrl].find((u) => isInstagramUrl(u || ''));
  if (insta) return { kind: 'instagram', url: insta };

  // 5 — nothing playable
  return { kind: 'none' };
};

/** Poster/thumbnail for any reel, independent of playback kind. */
export const reelPoster = (reel: ReelInput): string => {
  const t = (reel.thumbnailUrl || reel.thumbnail || '').trim();
  if (t) return t;
  const videoUrl = (reel.videoUrl || '').trim();
  const cloud = extractCloudNameFromUrl(videoUrl) || CLOUD;
  const publicId = (reel.cloudinaryPublicId || '').trim();
  if (publicId && !isYouTubeUrl(publicId) && !isInstagramUrl(publicId)) return buildCloudinaryVideoPoster(publicId, cloud);
  if (isCloudinaryVideoUrl(videoUrl)) {
    const id = extractPublicIdFromUrl(videoUrl);
    if (id) return buildCloudinaryVideoPoster(id, cloud);
  }
  return '';
};

export const formatViews = (reel: ReelInput): string | null => {
  const n = Number(reel.viewsCount ?? reel.views ?? 0);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K views`;
  return `${n} views`;
};
