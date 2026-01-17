import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, RefreshCw, CornerUpLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import PostCard from '../general/PostCard';
import ComposeReply from '../general/ComposeReply';
import { type Post } from '@/models/types';
import { buildMentionedPubkeysForReply } from '@/utils/replyChainUtils';
import { useAuth } from '@/contexts/AuthContext';
import { useKaspaPostsApi } from '@/hooks/useKaspaPostsApi';


interface PostDetailViewProps {
  onUpVote: (id: string) => void;
  onDownVote: (id: string) => void;
  onRepost: (id: string) => void;
}

type ReplyTreeNode = Post & {
  depth: number;
  children: ReplyTreeNode[];
};

const buildReplyTree = (replies: Post[], rootPostId: string): ReplyTreeNode[] => {
  const nodeMap = new Map<string, ReplyTreeNode>();
  const nodes: ReplyTreeNode[] = replies.map(reply => ({
    ...reply,
    depth: 0,
    children: []
  }));

  nodes.forEach(node => {
    nodeMap.set(node.id, node);
  });

  const roots: ReplyTreeNode[] = [];

  nodes.forEach(node => {
    const parentId = node.parentPostId;
    if (!parentId || parentId === rootPostId || !nodeMap.has(parentId)) {
      roots.push(node);
      return;
    }

    const parentNode = nodeMap.get(parentId);
    if (parentNode) {
      node.depth = parentNode.depth + 1;
      parentNode.children.push(node);
    } else {
      roots.push(node);
    }
  });

  return roots;
};

const flattenReplyTree = (nodes: ReplyTreeNode[]): ReplyTreeNode[] => {
  const result: ReplyTreeNode[] = [];

  const traverse = (node: ReplyTreeNode) => {
    result.push(node);
    node.children.forEach(child => traverse(child));
  };

  nodes.forEach(node => traverse(node));
  return result;
};

const MAX_NESTED_FETCH_DEPTH = 3;

const getReplyContainerStyle = (depth: number): React.CSSProperties => {
  if (depth <= 0) {
    return {
      width: '100%',
      marginLeft: 0,
      marginRight: 0
    };
  }

  const reductionPerLevel = 4; // percentage
  const clampedDepth = Math.min(depth, 5);
  const widthPercent = Math.max(60, 100 - reductionPerLevel * clampedDepth);

  return {
    width: `${widthPercent}%`,
    marginLeft: 'auto',
    marginRight: 0
  };
};

const PostDetailView: React.FC<PostDetailViewProps> = ({ onUpVote, onDownVote, onRepost }) => {
  const { postId } = useParams<{ postId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { publicKey } = useAuth();
  const { fetchAndConvertPostDetails, fetchAndConvertPostReplies } = useKaspaPostsApi();
  
  // Main post state
  const [currentPost, setCurrentPost] = useState<Post | null>(null);
  const [isLoadingPost, setIsLoadingPost] = useState(true);
  const [postError, setPostError] = useState<string | null>(null);
  const [parentPost, setParentPost] = useState<Post | null>(null);
  const [isLoadingParent, setIsLoadingParent] = useState(false);
  const [parentError, setParentError] = useState<string | null>(null);
  
  // Replies state
  const [replies, setReplies] = useState<Post[]>([]);
  const [isLoadingReplies, setIsLoadingReplies] = useState(false);
  const [repliesError, setRepliesError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [nestedRepliesMap, setNestedRepliesMap] = useState<Record<string, Post[]>>({});
  
  // UI state
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const statePost = (location.state as { post?: Post; fromNotifications?: boolean } | null)?.post ?? null;
  const isFromNotifications = (location.state as { fromNotifications?: boolean } | null)?.fromNotifications ?? false;
  // Default: the clicked post becomes the parent; in notifications, show the real parent instead.
  const effectiveParentPostId = isFromNotifications
    ? currentPost?.parentPostId ?? statePost?.parentPostId ?? null
    : null;
  const showRepliesHeaderAfterParent = Boolean(effectiveParentPostId);
  const showRepliesHeaderAfterPost = !effectiveParentPostId;
  
  // Refs for infinite scroll
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const parentPostIdRef = useRef<string | null>(null);
  const nestedRepliesCacheRef = useRef<Record<string, Post[]>>({});
  const nestedRepliesLoadingRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    nestedRepliesCacheRef.current = {};
    nestedRepliesLoadingRef.current.clear();
    setNestedRepliesMap({});
  }, [postId]);

  const fetchNestedRepliesRecursively = useCallback(async (parentId: string, depth: number = 0) => {
    if (!publicKey || depth >= MAX_NESTED_FETCH_DEPTH) {
      return;
    }
    if (nestedRepliesCacheRef.current[parentId]) {
      return;
    }
    if (nestedRepliesLoadingRef.current.has(parentId)) {
      return;
    }

    nestedRepliesLoadingRef.current.add(parentId);

    try {
      const response = await fetchAndConvertPostReplies(parentId, publicKey, { limit: 10 });
      const childReplies = response.posts || [];
      nestedRepliesCacheRef.current[parentId] = childReplies;
      setNestedRepliesMap(prev => {
        const existing = prev[parentId];
        if (existing && existing.length === childReplies.length && existing.every((child, idx) => child.id === childReplies[idx].id)) {
          return prev;
        }
        return {
          ...prev,
          [parentId]: childReplies
        };
      });
      await Promise.all(childReplies.map(child => fetchNestedRepliesRecursively(child.id, depth + 1)));
    } catch (error) {
      console.error('Error loading nested replies for post', parentId, error);
    } finally {
      nestedRepliesLoadingRef.current.delete(parentId);
    }
  }, [fetchAndConvertPostReplies, publicKey]);

  useEffect(() => {
    if (!publicKey) {
      return;
    }
    replies.forEach(reply => {
      fetchNestedRepliesRecursively(reply.id, 0);
    });
  }, [replies, fetchNestedRepliesRecursively, publicKey]);

  const combinedReplies = useMemo(() => {
    const collected: Post[] = [];
    const visited = new Set<string>();

    const traverse = (items: Post[]) => {
      for (const item of items) {
        if (visited.has(item.id)) {
          continue;
        }
        visited.add(item.id);
        collected.push(item);
        const nested = nestedRepliesMap[item.id];
        if (nested && nested.length > 0) {
          traverse(nested);
        }
      }
    };

    traverse(replies);
    return collected;
  }, [replies, nestedRepliesMap]);

  const replyTree = useMemo(() => {
    if (!currentPost) {
      return [];
    }
    return buildReplyTree(combinedReplies, currentPost.id);
  }, [combinedReplies, currentPost]);

  const flattenedReplyTree = useMemo(() => flattenReplyTree(replyTree), [replyTree]);

  // Load the main post details using the new API
  const loadPostDetails = useCallback(async () => {
    if (!postId || !publicKey) return;
    
    setIsLoadingPost(true);
    setPostError(null);
    
    try {
      const post = await fetchAndConvertPostDetails(postId, publicKey);
      setCurrentPost(post);
    } catch (error) {
      console.error('Error loading post details:', error);
      setPostError(error instanceof Error ? error.message : 'Failed to load post');
    } finally {
      setIsLoadingPost(false);
    }
  }, [postId, fetchAndConvertPostDetails, publicKey]);

  // Load replies for the current post
  const loadReplies = useCallback(async (reset: boolean = true) => {
    if (!postIdRef.current || !publicKeyRef.current) return;
    
    if (reset) {
      setIsLoadingReplies(true);
      setRepliesError(null);
    } else {
      setIsLoadingMore(true);
    }
    
    try {
      const options = {
        limit: 10,
        ...(reset ? {} : { before: nextCursorRef.current })
      };
      
      const response = await fetchFunctionRef.current(postIdRef.current, publicKeyRef.current, options);
      
      // Defensive check for response structure
      if (!response || !response.pagination) {
        console.error('Invalid response structure:', response);
        throw new Error('Invalid response from server');
      }

      // Note: fetchAndConvertPostReplies already converts the raw API response.replies to response.posts
      // So we should use response.posts here, not response.replies
      if (reset) {
        setReplies(response.posts || []);
        setNextCursor(response.pagination.nextCursor);
        setHasMore(response.pagination.hasMore);
      } else {
        // Append new replies to existing ones
        const updatedReplies = [...repliesRef.current, ...(response.posts || [])];
        setReplies(updatedReplies);
        setNextCursor(response.pagination.nextCursor);
        setHasMore(response.pagination.hasMore);
      }
      
    } catch (error) {
      console.error('Error loading replies:', error);
      setRepliesError(error instanceof Error ? error.message : 'Failed to load replies');
    } finally {
      if (reset) {
        setIsLoadingReplies(false);
      } else {
        setIsLoadingMore(false);
      }
    }
  }, []); // Remove dependencies to prevent recreation

  // Use refs to store the latest values to avoid dependency issues in infinite scroll
  const fetchFunctionRef = useRef(fetchAndConvertPostReplies);
  const postIdRef = useRef(postId);
  const publicKeyRef = useRef(publicKey);
  const repliesRef = useRef(replies);
  const nextCursorRef = useRef(nextCursor);
  const hasMoreRef = useRef(hasMore);
  const isLoadingMoreRef = useRef(isLoadingMore);
  
  // Update refs when values change
  fetchFunctionRef.current = fetchAndConvertPostReplies;
  postIdRef.current = postId;
  publicKeyRef.current = publicKey;
  repliesRef.current = replies;
  nextCursorRef.current = nextCursor;
  hasMoreRef.current = hasMore;
  isLoadingMoreRef.current = isLoadingMore;

  // Load more replies with stable references
  const loadMoreReplies = useCallback(async () => {
    if (!hasMoreRef.current || isLoadingMoreRef.current) {
      return;
    }
    
    await loadReplies(false);
  }, [loadReplies]);

  // Initial load when component mounts or postId changes
  useEffect(() => {
    if (postId) {
      loadPostDetails();
      loadReplies(true);
    }
  }, [postId, loadPostDetails, loadReplies]);

  useEffect(() => {
    if (!effectiveParentPostId || !publicKey) {
      setParentPost(null);
      setParentError(null);
      parentPostIdRef.current = null;
      return;
    }
    if (parentPostIdRef.current === effectiveParentPostId) {
      return;
    }
    parentPostIdRef.current = effectiveParentPostId;
    setIsLoadingParent(true);
    setParentError(null);
    fetchAndConvertPostDetails(effectiveParentPostId, publicKey)
      .then((post) => {
        setParentPost(post);
      })
      .catch((error) => {
        console.error('Error loading parent post:', error);
        setParentError(error instanceof Error ? error.message : 'Failed to load parent post');
      })
      .finally(() => {
        setIsLoadingParent(false);
      });
  }, [effectiveParentPostId, fetchAndConvertPostDetails, publicKey]);

  // Set up polling for the main post details (every 5 seconds)
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    const pollPostDetails = async () => {
      if (!postId || !publicKey) return;
      
      try {
        const updatedPost = await fetchAndConvertPostDetails(postId, publicKey);
        setCurrentPost(prev => {
          // Only update if there are actual changes to avoid unnecessary re-renders
          if (!prev ||
              prev.upVotes !== updatedPost.upVotes ||
              prev.downVotes !== updatedPost.downVotes ||
              prev.reposts !== updatedPost.reposts ||
              prev.replies !== updatedPost.replies ||
              prev.quotes !== updatedPost.quotes ||
              prev.upVoted !== updatedPost.upVoted ||
              prev.downVoted !== updatedPost.downVoted) {
            return updatedPost;
          }
          return prev;
        });
      } catch (error) {
        console.error('Error polling post details:', error);
        // Don't update error state for polling failures to avoid disruption
      }
    };

    // Start polling if we have a postId and the post is loaded
    if (postId && currentPost) {
      interval = setInterval(pollPostDetails, 5000); // Poll every 5 seconds
    }

    // Cleanup function
    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [postId, currentPost, fetchAndConvertPostDetails, publicKey]);

  // Set up polling for replies (every 5 seconds) with stable references to avoid disrupting infinite scroll
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    const pollReplies = async () => {
      if (!postIdRef.current || !publicKeyRef.current || isLoadingReplies || isLoadingMoreRef.current) return;
      
      try {
        // Only poll the first page of replies to check for new ones
        const response = await fetchFunctionRef.current(postIdRef.current, publicKeyRef.current, { limit: 10 });
        
        if (!response || !response.pagination) {
          console.error('Invalid response structure in replies polling:', response);
          return;
        }

        const newReplies = response.posts || [];
        const currentReplies = repliesRef.current;
        
        // Check if server data has any changes compared to local data
        let hasChanges = false;
        
        // First check if there are new replies (count increased)
        if (newReplies.length > Math.min(currentReplies.length, 10)) {
          hasChanges = true;
        } else {
          // Compare first 10 replies for changes in vote counts or other properties
          for (let i = 0; i < Math.min(newReplies.length, currentReplies.length, 10); i++) {
            const serverReply = newReplies[i];
            const localReply = currentReplies[i];
            
            if (
              serverReply.id !== localReply.id ||
              serverReply.upVotes !== localReply.upVotes ||
              serverReply.downVotes !== localReply.downVotes ||
              serverReply.replies !== localReply.replies ||
              serverReply.reposts !== localReply.reposts ||
              serverReply.upVoted !== localReply.upVoted ||
              serverReply.downVoted !== localReply.downVoted ||
              serverReply.reposted !== localReply.reposted
            ) {
              hasChanges = true;
              break;
            }
          }
        }
        
        if (hasChanges) {
          setReplies(prev => {
            if (prev.length <= 10) {
              // If we only have first page loaded, replace all
              setNextCursor(response.pagination.nextCursor);
              setHasMore(response.pagination.hasMore);
              return newReplies;
            } else {
              // If we have more than first page, only update the first 10 replies
              // to preserve the user's scroll position and additional loaded content
              const updatedReplies = [
                ...newReplies.slice(0, Math.min(newReplies.length, 10)),
                ...prev.slice(10)
              ];
              // Don't update pagination state as it would affect infinite scroll
              return updatedReplies;
            }
          });
        }
      } catch (error) {
        console.error('Error polling replies:', error);
        // Don't update error state for polling failures to avoid disruption
      }
    };

    // Start polling if we have a postId and replies have been loaded at least once
    if (postId && !isLoadingReplies && !repliesError) {
      interval = setInterval(pollReplies, 5000); // Poll every 5 seconds
    }

    // Cleanup function
    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [postId, isLoadingReplies, repliesError]); // Keep postId to restart polling when post changes

  // Infinite scroll for replies using stable references
  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;    
    if (!scrollContainer) {
      return;
    }

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
      const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);
      const shouldLoadMore = distanceFromBottom < 300; // Load when within 300px of bottom


      if (shouldLoadMore && hasMoreRef.current && !isLoadingMoreRef.current) {
        loadMoreReplies();
      }
    };

    scrollContainer.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      scrollContainer.removeEventListener('scroll', handleScroll);
    };
  }, [loadMoreReplies, replies.length]); // Re-setup when replies change

  // Handle reply intent from navigation state
  useEffect(() => {
    if (location.state?.shouldReply && location.state?.replyToId && currentPost) {
      setReplyingToId(location.state.replyToId);
      // Clear the navigation state to prevent re-triggering
      navigate(location.pathname, { 
        state: { post: location.state.post }, 
        replace: true 
      });
    }
  }, [location.state, currentPost, navigate, location.pathname]);

  // Reply handling functions
  const handleReply = (replyId: string) => {
    setReplyingToId(replyId);
  };

  const handleReplySubmit = () => {
    // Transaction is handled in ComposeReply component
    setReplyingToId(null);
    
    // Refresh replies after a delay to allow the transaction to be processed
    const refreshReplies = async (retryCount = 0) => {
      if (!postIdRef.current || !publicKeyRef.current) return;
      
      try {
        const response = await fetchFunctionRef.current(postIdRef.current, publicKeyRef.current, { limit: 10 });
        
        if (!response || !response.pagination) {
          console.error('Invalid response structure in reply refresh:', response);
          return;
        }
        
        const newReplies = response.posts || [];
        
        // If we got new replies or this is not a retry, update state
        if (newReplies.length > repliesRef.current.length || retryCount === 0) {
          setReplies(newReplies);
          setNextCursor(response.pagination.nextCursor);
          setHasMore(response.pagination.hasMore);
        } else if (retryCount < 3) {
          // Retry up to 3 times with increasing delays
          setTimeout(() => refreshReplies(retryCount + 1), (retryCount + 1) * 2000);
        }
      } catch (error) {
        console.error('Error refreshing replies after submit:', error);
        if (retryCount < 3) {
          setTimeout(() => refreshReplies(retryCount + 1), (retryCount + 1) * 2000);
        }
      }
    };
    
    // Start the refresh process after 3 seconds
    setTimeout(() => refreshReplies(), 3000);
  };

  const handleReplyCancel = () => {
    setReplyingToId(null);
  };

  // Get mentioned pubkeys for a reply - simplified logic
  const getMentionedPubkeysForReply = (targetPostId: string): string[] => {
    if (targetPostId === currentPost?.id && currentPost) {
      // Replying to the main post
      return buildMentionedPubkeysForReply(currentPost, publicKey ?? undefined);
    }
    
    // Replying to a reply
    const targetReply = replies.find(reply => reply.id === targetPostId);
    if (targetReply) {
      return buildMentionedPubkeysForReply(targetReply, publicKey ?? undefined);
    }
    
    return [];
  };

  // Show error if no public key is available
  if (!publicKey) {
    return (
      <div className="flex-1 w-full max-w-3xl mx-auto lg:border-r border-border flex flex-col h-full">
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate(-1)}
                className="p-2 hover:bg-muted rounded-full"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <h1 className="text-lg sm:text-xl font-bold">Authentication Required</h1>
            </div>
          </div>
          <div className="text-center px-4">
            <p className="text-muted-foreground mb-4 text-sm sm:text-base">
              Please log in to view post details.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Loading state
  if (isLoadingPost) {
    return (
      <div className="flex-1 w-full max-w-3xl mx-auto lg:border-r border-border flex flex-col h-full">
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate(-1)}
                className="p-2 hover:bg-muted rounded-full"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <h1 className="text-lg sm:text-xl font-bold">Loading...</h1>
            </div>
          </div>
          <div className="flex items-center justify-center p-8">
            <div className="w-6 h-6 border-2 border-transparent rounded-full animate-loader-circle"></div>
            <span className="ml-2 text-muted-foreground text-sm sm:text-base">Loading post...</span>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (postError || (!currentPost && !isLoadingPost)) {
    return (
      <div className="flex-1 w-full max-w-3xl mx-auto lg:border-r border-border flex flex-col h-full">
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate(-1)}
                className="p-2 hover:bg-muted rounded-full"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <h1 className="text-lg sm:text-xl font-bold">
                {postError ? 'Error' : 'Post not found'}
              </h1>
            </div>
          </div>
          <div className="text-center px-4">
            <p className="text-muted-foreground mb-4 text-sm sm:text-base">
              {postError || "The post you're looking for doesn't exist or has been removed."}
            </p>
            {postError && (
              <Button
                onClick={() => loadPostDetails()}
                variant="outline"
                size="sm"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Try Again
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // If we still don't have a post, return null (should not happen)
  if (!currentPost) {
    return null;
  }

  return (
    <div className="flex-1 w-full max-w-3xl mx-auto lg:border-r border-border flex flex-col h-full">
      {/* Header with back button and optional parent post button */}
      <div className="sticky top-0 bg-background/80 backdrop-blur-md border-b border-border p-4 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(-1)}
              className="p-2 hover:bg-neutral-hover rounded-full"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex flex-col">
              <h1 className="text-xl font-bold">Post</h1>
              <p className="text-sm text-muted-foreground truncate">
                by {currentPost.author.name}
              </p>
            </div>
          </div>
          
          {/* Parent post navigation button - only show if this is a reply */}
          {effectiveParentPostId && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(`/post/${effectiveParentPostId}`)}
              className="p-2 hover:bg-muted rounded-full"
              title="Go to parent post"
            >
              <CornerUpLeft className="h-5 w-5" />
            </Button>
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
        {effectiveParentPostId && (
          <div className="border-b border-border bg-card">
            <div className="px-4 py-3 bg-neutral border-b border-border flex items-center justify-between">
              <h3 className="text-base font-semibold text-muted-foreground flex items-center">
                <div className="w-3 h-3 rounded-full bg-primary/60 mr-2"></div>
                Parent post
              </h3>
            </div>
            {isLoadingParent ? (
              <div className="p-4 text-sm text-muted-foreground">Loading original post...</div>
            ) : parentPost ? (
              <PostCard
                post={parentPost}
                onUpVote={onUpVote}
                onDownVote={onDownVote}
                onRepost={onRepost}
                context="detail"
              />
            ) : parentError ? (
              <div className="p-4 text-sm text-destructive">Error: {parentError}</div>
            ) : null}
            {showRepliesHeaderAfterParent && (
              <div className="px-4 py-3 bg-neutral border-b border-border flex items-center justify-between">
                <h3 className="text-base font-semibold text-muted-foreground flex items-center">
                  <div className="w-3 h-3 rounded-full bg-primary/60 mr-2"></div>
                  Replies
                </h3>
                <Button
                  onClick={() => loadReplies(true)}
                  variant="ghost"
                  size="sm"
                  className="p-1 h-auto text-muted-foreground hover:text-foreground"
                  disabled={isLoadingReplies}
                >
                  <RefreshCw className={`h-4 w-4 ${isLoadingReplies ? 'animate-loader-circle' : ''}`} />
                </Button>
              </div>
            )}
          </div>
        )}
        {/* Main Post/Comment - Larger version */}
        <div className={effectiveParentPostId ? 'bg-card' : 'border-b border-border bg-card'}>
          <div className={effectiveParentPostId ? 'border-b border-border' : undefined}>
            {!effectiveParentPostId && (
              <div className="px-4 py-3 bg-neutral border-b border-border flex items-center justify-between">
                <h3 className="text-base font-semibold text-muted-foreground flex items-center">
                  <div className="w-3 h-3 rounded-full bg-primary/60 mr-2"></div>
                  Parent post
                </h3>
              </div>
            )}
            <div className={effectiveParentPostId ? 'flex justify-end' : undefined}>
              <div style={effectiveParentPostId ? getReplyContainerStyle(0) : { width: '100%' }}>
                <PostCard
                  post={currentPost}
                  onUpVote={onUpVote}
                  onDownVote={onDownVote}
                  onRepost={onRepost}
                  isDetailView={true}
                  onReply={handleReply}
                  context="detail"
                />
                {replyingToId === currentPost.id && (
                  <ComposeReply
                    onReply={handleReplySubmit}
                    onCancel={handleReplyCancel}
                    replyingToUser={currentPost.author.username}
                    postId={currentPost.id}
                    mentionedPubkeys={getMentionedPubkeysForReply(currentPost.id)}
                  />
                )}
              </div>
            </div>
            {showRepliesHeaderAfterPost && (
              <div className="px-4 py-3 bg-neutral border-b border-border flex items-center justify-between">
                <h3 className="text-base font-semibold text-muted-foreground flex items-center">
                  <div className="w-3 h-3 rounded-full bg-primary/60 mr-2"></div>
                  Replies
                </h3>
                <Button
                  onClick={() => loadReplies(true)}
                  variant="ghost"
                  size="sm"
                  className="p-1 h-auto text-muted-foreground hover:text-foreground"
                  disabled={isLoadingReplies}
                >
                  <RefreshCw className={`h-4 w-4 ${isLoadingReplies ? 'animate-loader-circle' : ''}`} />
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Replies Section */}
        <div>
          {/* Loading and Error States */}
          {isLoadingReplies && (
            <div className="flex items-center justify-center p-4">
              <div className="w-6 h-6 border-2 border-transparent rounded-full animate-loader-circle"></div>
              <span className="ml-2 text-muted-foreground">Loading replies...</span>
            </div>
          )}
          
          {repliesError && (
            <div className="mx-4 my-2 p-3 bg-destructive/10 border border-destructive/20 rounded text-sm text-destructive flex items-center justify-between">
              <span>Error loading replies: {repliesError}</span>
              <Button
                onClick={() => loadReplies(true)}
                variant="ghost"
                size="sm"
                className="ml-2 p-1 h-auto"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          )}
          
          {/* Replies List */}
          {flattenedReplyTree.length === 0 && !isLoadingReplies ? (
            <div className="p-8 text-center text-muted-foreground">
              No replies yet. Be the first to reply!
            </div>
          ) : (
            <>
              {/* Replies Header */}
              {!showRepliesHeaderAfterParent && !showRepliesHeaderAfterPost && flattenedReplyTree.length > 0 && (
                <div className="px-4 py-3 bg-neutral border-b border-border flex items-center justify-between w-full">
                  <h3 className="text-base font-semibold text-muted-foreground flex items-center">
                    <div className="w-3 h-3 rounded-full bg-primary/60 mr-2"></div>
                    Replies
                  </h3>
                  <Button
                    onClick={() => loadReplies(true)}
                    variant="ghost"
                    size="sm"
                    className="p-1 h-auto text-muted-foreground hover:text-foreground"
                    disabled={isLoadingReplies}
                  >
                    <RefreshCw className={`h-4 w-4 ${isLoadingReplies ? 'animate-loader-circle' : ''}`} />
                  </Button>
                </div>
              )}
              <div className="space-y-0">
                {flattenedReplyTree.map((reply) => {
                  const containerStyle = getReplyContainerStyle(reply.depth);
                  return (
                    <div
                      key={reply.id}
                      className="w-full flex justify-end"
                    >
                      <div style={containerStyle}>
                        <PostCard
                          post={reply}
                          onUpVote={onUpVote}
                          onDownVote={onDownVote}
                          onRepost={onRepost}
                          onReply={handleReply}
                          context="detail"
                        />
                        {replyingToId === reply.id && (
                          <ComposeReply
                            onReply={handleReplySubmit}
                            onCancel={handleReplyCancel}
                            replyingToUser={reply.author.username}
                            postId={reply.id}
                            mentionedPubkeys={getMentionedPubkeysForReply(reply.id)}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              
              {/* Auto-load more content when scrolling near bottom */}
              {hasMore && isLoadingMore && (
                <div className="p-4 text-center">
                  <div className="w-6 h-6 border-2 border-transparent rounded-full animate-loader-circle mx-auto"></div>
                  <p className="text-sm text-muted-foreground mt-2">Loading more replies...</p>
                </div>
              )}
              
              {/* End of replies indicator */}
              {!hasMore && flattenedReplyTree.length > 0 && (
                <div className="p-4 text-center text-muted-foreground text-sm">
                  No more replies to load
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default PostDetailView;
