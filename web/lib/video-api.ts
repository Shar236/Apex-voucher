import { apiBase } from './api';

export interface VideoReel {
  _id: string;
  title: string;
  description?: string;
  category?: string;
  duration?: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  thumbnail?: string;
  badgeColor?: string;
  icon?: string;
  views?: number;
  viewsCount?: number;
  featured?: boolean;
  youtubeEmbed?: string;
  instagramUrl?: string;
  order?: number;
  displayOrder?: number;
}

export interface VideoListResponse {
  success: boolean;
  count: number;
  data: VideoReel[];
  settings: {
    videoSectionEnabled: boolean;
    movieReelModeEnabled: boolean;
  };
}

export async function listVideos(): Promise<VideoListResponse> {
  try {
    const res = await fetch(`${apiBase()}/api/reels`, {
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(3500),
    });
    if (!res.ok) return { success: false, count: 0, data: [], settings: { videoSectionEnabled: false, movieReelModeEnabled: false } };
    return (await res.json()) as VideoListResponse;
  } catch {
    return { success: false, count: 0, data: [], settings: { videoSectionEnabled: false, movieReelModeEnabled: false } };
  }
}