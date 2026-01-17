import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Bookmark } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import PostCard from '@/components/general/PostCard';
import bookmarksService, { type BookmarkEntry } from '@/services/bookmarksService';
import { useUserSettings } from '@/contexts/UserSettingsContext';

interface BookmarksViewProps {
  onUpVote: (id: string) => void;
  onDownVote: (id: string) => void;
  onRepost: (id: string) => void;
}

const BookmarksView: React.FC<BookmarksViewProps> = ({ onUpVote, onDownVote, onRepost }) => {
  const navigate = useNavigate();
  const { bookmarksEnabled, searchbarEnabled } = useUserSettings();
  const [bookmarks, setBookmarks] = useState<BookmarkEntry[]>([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const unsubscribe = bookmarksService.subscribe(setBookmarks);
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!searchbarEnabled) {
      setQuery('');
    }
  }, [searchbarEnabled]);

  const filtered = useMemo(() => {
    if (!query.trim()) return bookmarks;
    const normalized = query.toLowerCase();
    return bookmarks.filter((entry) => {
      const post = entry.post;
      const haystack = [
        post.author.name,
        post.author.nickname,
        post.author.username,
        post.content
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(normalized);
    });
  }, [bookmarks, query]);

  const handleUpVote = (postId: string) => {
    onUpVote(postId);
  };

  const handleDownVote = (postId: string) => {
    onDownVote(postId);
  };

  const handleRepost = (postId: string) => {
    onRepost(postId);
  };

  return (
    <div className="flex-1 w-full max-w-3xl mx-auto lg:border-r border-border flex flex-col h-full">
      <div className="sticky top-0 bg-background/80 backdrop-blur-md border-b border-border p-4 z-10">
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
            <Bookmark className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-xl font-bold">Bookmarks</h1>
          </div>
          {searchbarEnabled && bookmarksEnabled && (
            <div className="ml-auto flex-1 pr-10">
              <input
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search bookmarks"
                className="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 flex h-9 w-full min-w-0 rounded-md border bg-background px-3 py-1 shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive text-sm border-input-thin focus-visible:border-input-thin-focus focus-visible:ring-0"
              />
            </div>
          )}
        </div>
      </div>

      <div
        className="flex-1 overflow-y-scroll"
        style={{
          scrollbarWidth: 'none',
          msOverflowStyle: 'none'
        }}
      >
        {!bookmarksEnabled ? (
          <div className="p-8 text-center text-muted-foreground">
            Bookmarks are disabled in settings.
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            No bookmarks yet.
          </div>
        ) : (
          filtered.map((entry) => (
            <PostCard
              key={entry.id}
              post={entry.post}
              onUpVote={handleUpVote}
              onDownVote={handleDownVote}
              onRepost={handleRepost}
              context="list"
            />
          ))
        )}
      </div>
    </div>
  );
};

export default BookmarksView;
