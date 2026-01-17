import { type Post } from '@/models/types';

export interface BookmarkEntry {
  id: string;
  post: Post;
  createdAt: number;
}

const STORAGE_KEY = 'ks_bookmarks';

type BookmarkListener = (bookmarks: BookmarkEntry[]) => void;

class BookmarksService {
  private listeners: BookmarkListener[] = [];

  getBookmarks(): BookmarkEntry[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.error('Failed to load bookmarks:', error);
      return [];
    }
  }

  isBookmarked(postId: string): boolean {
    return this.getBookmarks().some((entry) => entry.id === postId);
  }

  subscribe(callback: BookmarkListener): () => void {
    this.listeners.push(callback);
    callback(this.getBookmarks());
    return () => {
      this.listeners = this.listeners.filter((listener) => listener !== callback);
    };
  }

  addBookmark(post: Post): void {
    const next = this.getBookmarks();
    if (next.some((entry) => entry.id === post.id)) return;
    next.unshift({ id: post.id, post, createdAt: Date.now() });
    if (next.length > 200) next.length = 200;
    this.persist(next);
  }

  removeBookmark(postId: string): void {
    const next = this.getBookmarks().filter((entry) => entry.id !== postId);
    this.persist(next);
  }

  updateBookmarkPost(postId: string, updater: (post: Post) => Post): void {
    const next = this.getBookmarks().map((entry) => {
      if (entry.id !== postId) return entry;
      return { ...entry, post: updater(entry.post) };
    });
    this.persist(next);
  }

  syncFromPosts(posts: Post[]): void {
    if (posts.length === 0) return;
    const current = this.getBookmarks();
    if (current.length === 0) return;
    const postMap = new Map<string, Post>();
    const collect = (items: Post[]) => {
      items.forEach((item) => {
        postMap.set(item.id, item);
        if (item.nestedReplies?.length) {
          collect(item.nestedReplies);
        }
      });
    };
    collect(posts);
    let changed = false;
    const next = current.map((entry) => {
      const updated = postMap.get(entry.id);
      if (!updated) return entry;
      changed = true;
      return { ...entry, post: updated };
    });
    if (changed) {
      this.persist(next);
    }
  }

  clearBookmarks(): void {
    this.persist([]);
  }

  private persist(bookmarks: BookmarkEntry[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarks));
      this.listeners.forEach((listener) => listener(bookmarks));
    } catch (error) {
      console.error('Failed to persist bookmarks:', error);
    }
  }
}

export default new BookmarksService();
