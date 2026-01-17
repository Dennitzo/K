import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import PostCard from '../general/PostCard';
import { type Post } from '@/models/types';
import ComposeBox from '../general/ComposeBox';
import { useAuth } from '@/contexts/AuthContext';
import { useKaspaPostsApi } from '@/hooks/useKaspaPostsApi';

interface MyPostsProps {
  posts: Post[];
  onUpVote: (id: string) => void;
  onDownVote: (id: string) => void;
  onRepost: (id: string) => void;
  onPost: (content: string) => void;
  onServerPostsUpdate: (posts: Post[]) => void;
}

const POLLING_INTERVAL = 5000; // 5 seconds
const SEVENTV_EMOTES_STORAGE_KEY = 'seventv-emotes-list-v1';
const SEVENTV_CACHE_NAME = 'seventv-emotes-v1';

const buildSevenTVEmotes = (payload: any) => {
  const emotesList = Array.isArray(payload?.emotes) ? payload.emotes : [];

  const normalizeHostUrl = (hostUrl: string | undefined) => {
    if (!hostUrl) return '';
    return hostUrl.startsWith('//') ? `https:${hostUrl}` : hostUrl;
  };

  const pickFile = (files: Array<{ name?: string; format?: string; width?: number }> | undefined, preferredName: string) => {
    if (!files || !files.length) return null;
    const exact = files.find((file) => file?.name === preferredName);
    if (exact) return exact;
    const webpFiles = files.filter((file) => file?.format === 'WEBP');
    if (webpFiles.length) {
      return webpFiles.sort((a, b) => (a.width || 0) - (b.width || 0))[webpFiles.length - 1];
    }
    return files.sort((a, b) => (a.width || 0) - (b.width || 0))[files.length - 1] || null;
  };

  const buildFileUrl = (hostUrl: string, fileName: string | undefined) => {
    if (!hostUrl || !fileName) return '';
    return `${hostUrl}/${fileName}`;
  };

  return emotesList
    .map((emote: any) => {
      const hostUrl = normalizeHostUrl(emote?.data?.host?.url);
      const files = emote?.data?.host?.files as Array<{ name?: string; format?: string; width?: number }> | undefined;
      const previewFile = pickFile(files, '2x.webp') || pickFile(files, '2x.png');
      const fullFile = pickFile(files, '4x.webp') || pickFile(files, '4x.png') || previewFile;
      const previewUrl = buildFileUrl(hostUrl, previewFile?.name);
      const fullUrl = buildFileUrl(hostUrl, fullFile?.name) || previewUrl;
      return {
        id: emote?.id as string,
        name: emote?.name as string,
        previewUrl,
        fullUrl
      };
    })
    .filter((emote) => emote.id && emote.name && emote.previewUrl);
};

const MyPosts: React.FC<MyPostsProps> = ({ posts, onUpVote, onDownVote, onRepost, onPost, onServerPostsUpdate }) => {
  const navigate = useNavigate();
  const { publicKey } = useAuth();
  const { fetchAndConvertMyPosts, selectedNetwork, apiBaseUrl } = useKaspaPostsApi();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  
  // Refs
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  // Use refs to store the latest values to avoid dependency issues
  const onServerPostsUpdateRef = useRef(onServerPostsUpdate);
  const fetchFunctionRef = useRef(fetchAndConvertMyPosts);
  const publicKeyRef = useRef(publicKey);
  const postsRef = useRef(posts);
  const nextCursorRef = useRef(nextCursor);
  const hasMoreRef = useRef(hasMore);
  const isLoadingMoreRef = useRef(isLoadingMore);

  // Update refs when values change
  onServerPostsUpdateRef.current = onServerPostsUpdate;
  fetchFunctionRef.current = fetchAndConvertMyPosts;
  publicKeyRef.current = publicKey;
  postsRef.current = posts;
  nextCursorRef.current = nextCursor;
  hasMoreRef.current = hasMore;
  isLoadingMoreRef.current = isLoadingMore;

const loadPosts = useCallback(async (reset: boolean = true) => {
    if (!publicKeyRef.current) return;

    try {
      if (reset) {
        setIsLoading(true);
        setError(null);
      } else {
        setIsLoadingMore(true);
      }

      const options = {
        limit: 10,
        ...(reset ? {} : { before: nextCursorRef.current })
      };
      
      const response = await fetchFunctionRef.current(publicKeyRef.current, publicKeyRef.current, options);
      
      // Defensive check for response structure
      if (!response || !response.pagination) {
        console.error('Invalid response structure:', response);
        throw new Error('Invalid response from server');
      }

      if (reset) {
        onServerPostsUpdateRef.current(response.posts || []);
        setNextCursor(response.pagination.nextCursor);
        setHasMore(response.pagination.hasMore);
      } else {
        // Append new posts to existing ones
        const updatedPosts = [...postsRef.current, ...(response.posts || [])];
        onServerPostsUpdateRef.current(updatedPosts);
        setNextCursor(response.pagination.nextCursor);
        setHasMore(response.pagination.hasMore);
      }
    } catch (error) {
      console.error('Error loading posts:', error);
      setError(error instanceof Error ? error.message : 'Failed to load posts');
    } finally {
      if (reset) {
        setIsLoading(false);
      } else {
        setIsLoadingMore(false);
      }
    }
  }, []); // Remove dependencies to prevent recreation

const loadMorePosts = useCallback(async () => {
    if (!hasMoreRef.current || isLoadingMoreRef.current) return;
    await loadPosts(false);
  }, [loadPosts]);

  // Load posts on component mount and when network or apiBaseUrl changes
  useEffect(() => {
    if (publicKey) {
      // Use setTimeout to make this non-blocking
      setTimeout(() => loadPosts(true), 0);
    }
  }, [publicKey, selectedNetwork, apiBaseUrl]);

  // Auto-refresh every 30 seconds (less aggressive to avoid interfering with infinite scroll)
  useEffect(() => {
    const interval = setInterval(() => {
      // Only refresh if user is near the top to avoid disrupting infinite scroll
      const scrollContainer = scrollContainerRef.current;
      if (scrollContainer && scrollContainer.scrollTop < 100) {
        loadPosts(true);
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [loadPosts]);

  // Set up polling with stable references
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    const startPolling = () => {
      interval = setInterval(async () => {
        // Check if we still have a public key
        if (!publicKeyRef.current) return;
        
        try {
          const options = {
            limit: 10
          };
          
          const response = await fetchFunctionRef.current(publicKeyRef.current, publicKeyRef.current, options);
          
          // Defensive check for response structure
          if (!response || !response.pagination) {
            console.error('Invalid polling response structure:', response);
            return;
          }

          // Check if server data has any changes compared to local data
          const serverPosts = response.posts || [];
          const localPosts = postsRef.current;
          
          let hasChanges = false;
          
          // Check if post count differs
          if (serverPosts.length !== localPosts.length) {
            hasChanges = true;
          } else {
            // Compare each post for changes in vote counts, timestamps, or other properties
            for (let i = 0; i < Math.min(serverPosts.length, localPosts.length); i++) {
              const serverPost = serverPosts[i];
              const localPost = localPosts[i];
              
              if (
                serverPost.id !== localPost.id ||
                serverPost.upVotes !== localPost.upVotes ||
                serverPost.downVotes !== localPost.downVotes ||
                serverPost.replies !== localPost.replies ||
                serverPost.reposts !== localPost.reposts ||
                serverPost.timestamp !== localPost.timestamp ||
                serverPost.upVoted !== localPost.upVoted ||
                serverPost.downVoted !== localPost.downVoted ||
                serverPost.reposted !== localPost.reposted
              ) {
                hasChanges = true;
                break;
              }
            }
          }
          
          if (hasChanges) {
            // Only update the first page of posts to preserve infinite scroll state
            const currentPosts = postsRef.current;
            
            if (currentPosts.length <= 10) {
              // If we only have first page loaded, replace all
              onServerPostsUpdateRef.current(serverPosts);
              setHasMore(response.pagination.hasMore);
              setNextCursor(response.pagination.nextCursor);
            } else {
              // If we have more than first page, only update the first 10 posts
              // to preserve the user's scroll position and additional loaded content
              const updatedPosts = [
                ...serverPosts.slice(0, Math.min(serverPosts.length, 10)),
                ...currentPosts.slice(10)
              ];
              onServerPostsUpdateRef.current(updatedPosts);
              // Don't update pagination state as it would affect infinite scroll
            }
          }
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : 'Failed to fetch posts';
          setError(errorMessage);
          console.error('Error fetching posts from server:', err);
        }
      }, POLLING_INTERVAL);
    };

    // Only start polling if we have a public key
    if (publicKeyRef.current) {
      startPolling();
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [selectedNetwork, apiBaseUrl]);

  // Single scroll-based infinite scroll mechanism (works on both desktop and mobile)
  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
      const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);
      const shouldLoadMore = distanceFromBottom < 300; // Load when within 300px of bottom

      if (shouldLoadMore && hasMoreRef.current && !isLoadingMoreRef.current) {
        loadMorePosts();
      }
    };

    scrollContainer.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      scrollContainer.removeEventListener('scroll', handleScroll);
    };
  }, [loadMorePosts]);

  useEffect(() => {
    let cancelled = false;

    const preloadSevenTVEmotes = async () => {
      try {
        const response = await fetch('https://7tv.io/v3/emote-sets/01F74BZYAR00069YQS4JB48G14');
        if (!response.ok) {
          throw new Error(`7TV request failed (${response.status})`);
        }
        const payload = await response.json();
        const emotes = buildSevenTVEmotes(payload);
        if (cancelled) return;
        localStorage.setItem(SEVENTV_EMOTES_STORAGE_KEY, JSON.stringify(emotes));

        if ('caches' in window) {
          const cache = await caches.open(SEVENTV_CACHE_NAME);
          const urls = Array.from(
            new Set(
              emotes
                .flatMap((emote) => [emote.previewUrl, emote.fullUrl])
                .filter((url) => url)
            )
          );
          const batchSize = 12;
          for (let i = 0; i < urls.length; i += batchSize) {
            const batch = urls.slice(i, i + batchSize);
            await Promise.allSettled(
              batch.map(async (url) => {
                const cached = await cache.match(url);
                if (cached) return;
                const fetched = await fetch(url, { mode: 'cors' });
                if (fetched.ok) {
                  await cache.put(url, fetched);
                }
              })
            );
          }
        }
      } catch (err) {
        console.error('Failed to preload 7TV emotes:', err);
      }
    };

    void preloadSevenTVEmotes();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex-1 w-full max-w-3xl mx-auto lg:border-r border-border flex flex-col h-full">
      {/* Header */}
      <div className="sticky top-0 bg-background/80 backdrop-blur-md border-b border-border z-10">
        <div className="p-4">
          <div className="flex items-center space-x-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(-1)}
              className="p-2 hover:bg-accent rounded-full"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-muted-foreground" />
              <h1 className="text-xl font-bold">My posts</h1>
            </div>
          </div>
          {error && (
            <div className="mt-2 p-2 bg-destructive/10 border border-destructive/20 rounded text-sm text-destructive">
              Error: {error}
            </div>
          )}
        </div>
        <ComposeBox onPost={onPost} />
      </div>
      <div 
        ref={scrollContainerRef}
        className="flex-1 overflow-y-scroll" 
        style={{
          scrollbarWidth: 'none',
          msOverflowStyle: 'none'
        }}
      >
        {isLoading && posts.length === 0 ? (
          <div className="p-8 text-center">
            <div className="w-8 h-8 border-2 border-transparent rounded-full animate-loader-circle mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading posts...</p>
          </div>
        ) : posts.length === 0 && !isLoading ? (
          <div className="p-8 text-center text-muted-foreground">
            No posts found. Create your first post above!
          </div>
        ) : (
          <>
            {posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                onUpVote={onUpVote}
                onDownVote={onDownVote}
                onRepost={onRepost}
                context="list"
              />
            ))}
            
            {/* Auto-load more content when scrolling near bottom */}
            {hasMore && isLoadingMore && (
              <div className="p-4 text-center">
                <div className="w-6 h-6 border-2 border-transparent rounded-full animate-loader-circle mx-auto"></div>
                <p className="text-sm text-muted-foreground mt-2">Loading more posts...</p>
              </div>
            )}
            
            {/* End of posts indicator */}
            {!hasMore && posts.length > 0 && (
              <div className="p-4 text-center text-muted-foreground text-sm">
                No more posts to load
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default MyPosts;
