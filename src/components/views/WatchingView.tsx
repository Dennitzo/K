import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ScanEye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import PostCard from '../general/PostCard';
import { type Post, type PaginationOptions } from '@/models/types';
import { useAuth } from '@/contexts/AuthContext';
import { useKaspaPostsApi } from '@/hooks/useKaspaPostsApi';
import { useUserSettings } from '@/contexts/UserSettingsContext';

interface WatchingProps {
  posts: Post[];
  onUpVote: (id: string) => void;
  onDownVote: (id: string) => void;
  onRepost: (id: string) => void;
  onServerPostsUpdate: (posts: Post[]) => void;
}

const POLLING_INTERVAL = 5000; // 5 seconds

const Watching: React.FC<WatchingProps> = ({ posts, onUpVote, onDownVote, onRepost, onServerPostsUpdate }) => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const { publicKey } = useAuth();
  const { fetchAndConvertWatchingPosts, selectedNetwork, apiBaseUrl } = useKaspaPostsApi();
  const { searchbarEnabled, searchbarLoadLimit } = useUserSettings();

  useEffect(() => {
    if (!searchbarEnabled) {
      setSearchQuery('');
    }
  }, [searchbarEnabled]);
  
  
  
  // Refs
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isLoadingRef = useRef(isLoading);
  const searchQueryRef = useRef(searchQuery);
  const searchLoadInFlightRef = useRef(false);
  const searchLimitRef = useRef<number | null>(null);
  const searchFetchLockedRef = useRef(false);
  const searchAbortRef = useRef(false);
  const pollInFlightRef = useRef(false);
  
  // Use refs to store the latest values to avoid dependency issues
  const onServerPostsUpdateRef = useRef(onServerPostsUpdate);
  const fetchFunctionRef = useRef(fetchAndConvertWatchingPosts);
  const publicKeyRef = useRef(publicKey);
  const postsRef = useRef(posts);
  const nextCursorRef = useRef(nextCursor);
  const hasMoreRef = useRef(hasMore);
  const isLoadingMoreRef = useRef(isLoadingMore);

  // Update refs when values change
  onServerPostsUpdateRef.current = onServerPostsUpdate;
  fetchFunctionRef.current = fetchAndConvertWatchingPosts;
  publicKeyRef.current = publicKey;
  postsRef.current = posts;
  nextCursorRef.current = nextCursor;
  hasMoreRef.current = hasMore;
  isLoadingMoreRef.current = isLoadingMore;
  isLoadingRef.current = isLoading;
  searchQueryRef.current = searchQuery;

  useEffect(() => {
    return () => {
      searchAbortRef.current = true;
    };
  }, []);

  const loadPosts = useCallback(async (reset: boolean = true, pageLimit: number = 10) => {
    try {
      if (reset) {
        setIsLoading(true);
        setError(null);
      } else {
        setIsLoadingMore(true);
      }
      
      const options: PaginationOptions = {
        limit: pageLimit,
        ...(reset ? {} : { before: nextCursorRef.current })
      };
      
      const response = await fetchFunctionRef.current(publicKeyRef.current || '', options);
      
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
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch watching posts';
      setError(errorMessage);
      console.error('Error fetching watching posts from server:', err);
    } finally {
      if (reset) {
        setIsLoading(false);
      } else {
        setIsLoadingMore(false);
      }
    }
  }, []); // Remove dependencies to prevent recreation

  const loadMorePosts = useCallback(async (options?: { force?: boolean; pageLimit?: number }) => {
    if (!options?.force && searchbarEnabled && searchQuery.trim()) {
      return;
    }
    if (!hasMoreRef.current || isLoadingMoreRef.current) {
      return;
    }

    await loadPosts(false, options?.pageLimit);
  }, [loadPosts, searchbarEnabled, searchQuery]);

// Load posts on component mount and when network or apiBaseUrl changes
  useEffect(() => {
    if (publicKey) {
      // Use setTimeout to make this non-blocking
      setTimeout(() => loadPosts(true), 0);
    }
  }, [publicKey, selectedNetwork, apiBaseUrl]);

  // Set up polling with stable references
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    const startPolling = () => {
      interval = setInterval(async () => {
        if (searchbarEnabled && searchQueryRef.current.trim()) {
          return;
        }
        if (pollInFlightRef.current || isLoadingRef.current || isLoadingMoreRef.current) {
          return;
        }
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
          return;
        }
        try {
          pollInFlightRef.current = true;
          const options: PaginationOptions = {
            limit: 10
          };
          
          const response = await fetchFunctionRef.current(publicKeyRef.current || '', options);
          
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
          const errorMessage = err instanceof Error ? err.message : 'Failed to fetch watching posts';
          setError(errorMessage);
          console.error('Error fetching watching posts from server:', err);
        } finally {
          pollInFlightRef.current = false;
        }
      }, POLLING_INTERVAL);
    };

    startPolling();

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [selectedNetwork, apiBaseUrl]); // Removed posts dependency since we use refs

  // Single scroll-based infinite scroll mechanism (works on both desktop and mobile)
  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
      const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);
      const shouldLoadMore = distanceFromBottom < 300; // Load when within 300px of bottom

      if (
        searchbarEnabled &&
        searchQuery.trim()
      ) {
        return;
      }

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
    const trimmedQuery = searchQuery.trim();
    const limit = searchbarLoadLimit;

    if (!searchbarEnabled || !trimmedQuery || !Number.isFinite(limit) || limit <= 0) {
      return;
    }

    if (searchFetchLockedRef.current || searchLoadInFlightRef.current) {
      return;
    }

    searchLimitRef.current = Math.max(postsRef.current.length, limit);

    const loadForSearch = async () => {
      searchLoadInFlightRef.current = true;
      try {
        while (!searchAbortRef.current) {
          const currentCount = postsRef.current.length;
          const targetCount = searchLimitRef.current ?? limit;
          if (currentCount >= targetCount) {
            break;
          }
          if (!hasMoreRef.current) {
            break;
          }
          if (isLoadingRef.current || isLoadingMoreRef.current) {
            await new Promise((resolve) => setTimeout(resolve, 200));
            continue;
          }
          await loadMorePosts({ force: true, pageLimit: 100 });
          if (postsRef.current.length <= currentCount) {
            break;
          }
        }
      } finally {
        searchLoadInFlightRef.current = false;
        searchFetchLockedRef.current = true;
      }
    };

    void loadForSearch();

    return () => {
    };
  }, [searchQuery, searchbarEnabled, searchbarLoadLimit, loadMorePosts]);

  

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
              <ScanEye className="h-5 w-5 text-muted-foreground" />
              <h1 className="text-xl font-bold">Watching</h1>
            </div>
            {searchbarEnabled && (
              <div className="ml-auto flex-1 pr-10">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search"
                  className="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 flex h-9 w-full min-w-0 rounded-md border bg-background px-3 py-1 shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive text-sm border-input-thin focus-visible:border-input-thin-focus focus-visible:ring-0"
                />
              </div>
            )}
          </div>
          {error && (
            <div className="mt-2 p-2 bg-destructive/10 border border-destructive/20 rounded text-sm text-destructive">
              Error: {error}
            </div>
          )}
        </div>
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
            <p className="text-muted-foreground">Loading watching posts...</p>
          </div>
        ) : posts.length === 0 && !isLoading ? (
          <div className="p-8 text-center text-muted-foreground">
            No watching posts found.
          </div>
        ) : (
          <>
            {(searchQuery.trim()
              ? posts.filter((post) => {
                  const haystack = [
                    post.author.name,
                    post.author.nickname,
                    post.author.username,
                    post.content
                  ]
                    .filter(Boolean)
                    .join(' ')
                    .toLowerCase();
                  return haystack.includes(searchQuery.toLowerCase());
                })
              : posts
            ).map((post) => (
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
            {hasMore && isLoadingMore && !(searchbarEnabled && searchQuery.trim()) && (
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

export default Watching;
