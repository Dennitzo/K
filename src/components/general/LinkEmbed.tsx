import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useKaspaPostsApi } from '@/hooks/useKaspaPostsApi';
import { type Post } from '@/models/types';

type EmbedType = 'youtube' | 'github' | 'x' | 'wikipedia' | 'lightshot' | 'image' | 'internal' | 'generic';

interface EmbedData {
  type: EmbedType;
  url: string;
  postId?: string;
  siteLabel: string;
  title: string;
  description?: string;
  thumbnailUrl?: string;
  accentClass: string;
}

const normalizeUrl = (raw: string): URL | null => {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url;
  } catch {
    return null;
  }
};

const extractInternalPostId = (url: URL): string | null => {
  const pathMatch = url.pathname.match(/\/post\/([^/?#]+)/);
  if (pathMatch?.[1]) return pathMatch[1];
  const hashMatch = url.hash.match(/\/post\/([^/?#]+)/);
  if (hashMatch?.[1]) return hashMatch[1];
  return null;
};

const parseYouTubeId = (url: URL): string | null => {
  const host = url.hostname.toLowerCase();
  if (host === 'youtu.be') {
    return url.pathname.split('/').filter(Boolean)[0] || null;
  }
  if (host.endsWith('youtube.com')) {
    const pathParts = url.pathname.split('/').filter(Boolean);
    if (url.pathname.startsWith('/watch')) {
      return url.searchParams.get('v');
    }
    if (pathParts[0] === 'shorts' || pathParts[0] === 'embed') {
      return pathParts[1] || null;
    }
  }
  return null;
};

const getEmbedData = (raw: string): EmbedData | null => {
  const url = normalizeUrl(raw);
  if (!url) return null;

  const host = url.hostname.toLowerCase();
  if (typeof window !== 'undefined' && host === window.location.host) {
    const postId = extractInternalPostId(url);
    if (postId) {
      return {
        type: 'internal',
        url: url.toString(),
        postId,
        siteLabel: 'Post',
        title: 'Post',
        accentClass: 'bg-[#70C7BA]'
      };
    }
  }
  const imageExtMatch = url.pathname.match(/\.(png|jpe?g|gif|webp|avif)$/i);
  if (imageExtMatch) {
    const filename = url.pathname.split('/').filter(Boolean).pop() || 'Image';
    return {
      type: 'image',
      url: url.toString(),
      siteLabel: host,
      title: filename,
      thumbnailUrl: url.toString(),
      accentClass: 'bg-[#70C7BA]'
    };
  }

  if (host === 'youtu.be' || host.endsWith('youtube.com')) {
    const videoId = parseYouTubeId(url);
    if (!videoId) return null;
    return {
      type: 'youtube',
      url: url.toString(),
      siteLabel: 'YouTube',
      title: 'YouTube video',
      thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      accentClass: 'bg-[#70C7BA]'
    };
  }

  if (host === 'github.com') {
    const parts = url.pathname.split('/').filter(Boolean);
    const repoLabel = parts.length >= 2 ? `${parts[0]}/${parts[1]}` : 'GitHub repository';
    return {
      type: 'github',
      url: url.toString(),
      siteLabel: 'GitHub',
      title: repoLabel,
      description: parts.slice(2).join('/') || undefined,
      accentClass: 'bg-[#70C7BA]'
    };
  }

  if (host === 'x.com' || host === 'www.x.com' || host === 'twitter.com' || host === 'www.twitter.com') {
    const pathLabel = url.pathname.split('/').filter(Boolean).slice(0, 2).join('/') || 'X post';
    return {
      type: 'x',
      url: url.toString(),
      siteLabel: 'X',
      title: pathLabel,
      accentClass: 'bg-[#70C7BA]'
    };
  }

  if (host.endsWith('.wikipedia.org')) {
    const title = url.pathname.startsWith('/wiki/')
      ? decodeURIComponent(url.pathname.replace('/wiki/', '').replace(/_/g, ' '))
      : 'Wikipedia article';
    return {
      type: 'wikipedia',
      url: url.toString(),
      siteLabel: 'Wikipedia',
      title,
      accentClass: 'bg-[#70C7BA]'
    };
  }

  if (host === 'prnt.sc' || host.endsWith('.prnt.sc')) {
    const code = url.pathname.split('/').filter(Boolean)[0];
    if (!code) return null;
    return {
      type: 'lightshot',
      url: url.toString(),
      siteLabel: 'Lightshot',
      title: 'Lightshot image',
      accentClass: 'bg-[#70C7BA]'
    };
  }

  const trimmedPath = url.pathname.replace(/\/+$/, '');
  return {
    type: 'generic',
    url: url.toString(),
    siteLabel: host,
    title: host,
    description: trimmedPath && trimmedPath !== '/' ? trimmedPath : undefined,
    accentClass: 'bg-[#70C7BA]'
  };
};

export const isEmbeddableUrl = (raw: string): boolean => Boolean(getEmbedData(raw));

interface LinkEmbedProps {
  url: string;
}

const LinkEmbed: React.FC<LinkEmbedProps> = ({ url }) => {
  const data = getEmbedData(url);
  const containerRef = useRef<HTMLAnchorElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [titleOverride, setTitleOverride] = useState<string | null>(null);
  const [descriptionOverride, setDescriptionOverride] = useState<string | null>(null);
  const [thumbnailOverride, setThumbnailOverride] = useState<string | null>(null);
  const [internalPost, setInternalPost] = useState<Post | null>(null);
  const [isImageExpanded, setIsImageExpanded] = useState(false);
  const { publicKey } = useAuth();
  const { fetchAndConvertPostDetails } = useKaspaPostsApi();
  const isImageEmbed = data?.type === 'image';
  const truncatedInternalContent = useMemo(() => {
    if (!internalPost) return '';
    const max = 180;
    return internalPost.content.length > max
      ? `${internalPost.content.slice(0, max)}…`
      : internalPost.content;
  }, [internalPost]);

  useEffect(() => {
    if (isVisible) return;
    const node = containerRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry && entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px 0px' }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [isVisible]);

  useEffect(() => {
    if (!isVisible || !data || data.type === 'image' || data.type === 'internal') return;
    if (data.type === 'x') {
      try {
        const xUrl = new URL(data.url);
        if (!xUrl.pathname || xUrl.pathname === '/' || xUrl.pathname === '') {
          return;
        }
      } catch {
        return;
      }
    }
    let cancelled = false;

    const loadOEmbed = async () => {
      try {
        const oembedUrl =
          data.type === 'youtube'
            ? `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(data.url)}`
            : data.type === 'x'
            ? `https://publish.twitter.com/oembed?omit_script=true&url=${encodeURIComponent(data.url)}`
            : `https://noembed.com/embed?url=${encodeURIComponent(data.url)}`;
        const response = await fetch(oembedUrl);
        if (!response.ok) return;
        const payload = (await response.json()) as {
          title?: string;
          author_name?: string;
          description?: string;
          thumbnail_url?: string;
        };
        if (cancelled) return;

        const nextTitle = payload.title || payload.author_name;
        if (nextTitle) {
          setTitleOverride(nextTitle);
        }
        if (payload.description) {
          setDescriptionOverride(payload.description);
        } else if (data.type === 'x' && payload.author_name) {
          setDescriptionOverride(`Post by ${payload.author_name}`);
        }
        if (payload.thumbnail_url) {
          setThumbnailOverride(payload.thumbnail_url);
        }
      } catch {
        // Ignore oEmbed errors and keep fallback title.
      }
    };

    void loadOEmbed();

    return () => {
      cancelled = true;
    };
  }, [data, isVisible]);

  useEffect(() => {
    if (!isVisible || !data || data.type !== 'internal' || !data.postId || !publicKey) {
      return;
    }
    let cancelled = false;

    const loadPost = async () => {
      try {
        const post = await fetchAndConvertPostDetails(data.postId, publicKey);
        if (!cancelled) {
          setInternalPost(post);
        }
      } catch {
        // Ignore failures for internal previews.
      }
    };

    void loadPost();

    return () => {
      cancelled = true;
    };
  }, [data, isVisible, publicKey, fetchAndConvertPostDetails]);

  if (!data) return null;

  return (
    <a
      href={data.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(event) => {
        event.stopPropagation();
        if (isImageEmbed) {
          event.preventDefault();
          setIsImageExpanded((prev) => !prev);
        }
      }}
      ref={containerRef}
      className={
        data.type === 'image'
          ? `mt-3 block w-full max-w-full min-w-0 overflow-hidden ${
              isImageEmbed ? (isImageExpanded ? 'cursor-zoom-out' : 'cursor-zoom-in') : ''
            }`
          : data.type === 'youtube'
          ? 'mt-3 block w-full max-w-[570px] min-w-0 overflow-hidden rounded-md border border-border bg-muted/40 transition-colors hover:bg-muted/60'
          : 'mt-3 block w-full max-w-full min-w-0 overflow-hidden rounded-md border border-border bg-muted/40 transition-colors hover:bg-muted/60'
      }
    >
      {!isVisible ? (
        <div className="p-3">
          <div className="h-3 w-24 rounded bg-muted" />
          <div className="mt-2 h-4 w-3/4 rounded bg-muted" />
          <div className="mt-2 h-3 w-1/2 rounded bg-muted" />
        </div>
      ) : data.type === 'image' ? (
        <img
          src={thumbnailOverride || data.thumbnailUrl || data.url}
          alt={data.title}
          loading="lazy"
          className={
            isImageExpanded
              ? 'block w-full max-w-[570px] max-h-[320px] object-contain mx-auto'
              : 'block w-auto max-w-[25%] max-h-[80px] object-contain'
          }
          referrerPolicy="no-referrer"
        />
      ) : data.type === 'internal' ? (
        <div className="flex min-w-0 w-full max-w-full overflow-hidden">
          <div className={`w-1.5 ${data.accentClass}`} />
          <div className="flex flex-1 min-w-0 flex-col gap-1 p-3 overflow-hidden">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Internal post
            </div>
            <div className="text-sm font-semibold text-foreground truncate max-w-full">
              {internalPost?.author.name || 'Loading post…'}
            </div>
            {internalPost && (
              <div className="text-xs text-muted-foreground whitespace-pre-wrap break-words max-w-full">
                {truncatedInternalContent}
              </div>
            )}
            <div className="mt-2 text-xs text-info break-all">{data.url}</div>
          </div>
        </div>
      ) : (
      <div className="flex min-w-0 w-full max-w-full overflow-hidden">
        <div className={`w-1.5 ${data.accentClass}`} />
        <div className="flex flex-1 min-w-0 gap-3 p-3 overflow-hidden">
          <div className="flex-1 min-w-0 overflow-hidden">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {data.siteLabel}
            </div>
            <div className="text-sm font-semibold text-foreground truncate max-w-full">
              {titleOverride || data.title}
            </div>
            {(descriptionOverride || data.description) && (
              <div className="mt-1 text-xs text-muted-foreground truncate max-w-full">
                {descriptionOverride || data.description}
              </div>
            )}
            <div className="mt-2 text-xs text-info break-all">{data.url}</div>
          </div>
          {(thumbnailOverride || data.thumbnailUrl) && (
            <img
              src={thumbnailOverride || data.thumbnailUrl}
              alt=""
              loading="lazy"
              className="h-20 w-20 flex-shrink-0 rounded-md object-cover"
              referrerPolicy="no-referrer"
            />
          )}
        </div>
      </div>
      )}
    </a>
  );
};

export default LinkEmbed;
