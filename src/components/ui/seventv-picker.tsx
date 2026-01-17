import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from "@/components/ui/button";
import { Sparkles } from 'lucide-react';

interface SevenTVPickerButtonProps {
  onEmoteSelect: (url: string) => void;
  className?: string;
  onOpenChange?: (open: boolean) => void;
}

interface SevenTVEmote {
  id: string;
  name: string;
  previewUrl: string;
  fullUrl: string;
  displayUrl?: string;
}

const SEVENTV_EMOTES_STORAGE_KEY = 'seventv-emotes-list-v1';
const SEVENTV_CACHE_NAME = 'seventv-emotes-v1';

const SevenTVPickerButton: React.FC<SevenTVPickerButtonProps> = ({
  onEmoteSelect,
  className = "",
  onOpenChange
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emotes, setEmotes] = useState<SevenTVEmote[]>([]);
  const [query, setQuery] = useState('');
  const [retryCount, setRetryCount] = useState(0);
  const pickerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const objectUrlsRef = useRef<string[]>([]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        pickerRef.current &&
        !pickerRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  useEffect(() => {
    onOpenChange?.(isOpen);
  }, [isOpen, onOpenChange]);

  useEffect(() => {
    if (!isOpen || emotes.length || isLoading) return;
    let cancelled = false;

    const loadEmotes = async () => {
      try {
        setIsLoading(true);
        setError(null);
        if (objectUrlsRef.current.length) {
          objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
          objectUrlsRef.current = [];
        }
        let nextEmotes: SevenTVEmote[] = [];
        const stored = localStorage.getItem(SEVENTV_EMOTES_STORAGE_KEY);
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed)) {
              nextEmotes = parsed.filter((emote) => emote?.id && emote?.name && emote?.previewUrl);
            }
          } catch {
            localStorage.removeItem(SEVENTV_EMOTES_STORAGE_KEY);
          }
        }

        if (!nextEmotes.length) {
          const endpoint = 'https://7tv.io/v3/emote-sets/01F74BZYAR00069YQS4JB48G14';
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 8000);
          let payload: any = null;

          try {
            const response = await fetch(endpoint, { signal: controller.signal });
            if (!response.ok) {
              throw new Error(`7TV request failed (${response.status})`);
            }
            payload = await response.json();
          } finally {
            clearTimeout(timeoutId);
          }

          if (!payload) {
            throw new Error('7TV request timed out.');
          }
          if (cancelled) return;
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

          nextEmotes = emotesList
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
            .filter((emote: SevenTVEmote) => emote.id && emote.name && emote.previewUrl);
        }

        if (!('caches' in window)) {
          setEmotes(nextEmotes);
          return;
        }

        const cache = await caches.open(SEVENTV_CACHE_NAME);
        const hydratedEmotes = await Promise.all(
          nextEmotes.map(async (emote) => {
            try {
              let response = await cache.match(emote.previewUrl);
              if (!response) {
                const fetched = await fetch(emote.previewUrl, { mode: 'cors' });
                if (!fetched.ok) return emote;
                await cache.put(emote.previewUrl, fetched.clone());
                response = fetched;
              }
              const blob = await response.blob();
              const objectUrl = URL.createObjectURL(blob);
              objectUrlsRef.current.push(objectUrl);
              return { ...emote, displayUrl: objectUrl };
            } catch {
              return emote;
            }
          })
        );

        if (cancelled) return;
        setEmotes(hydratedEmotes);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load 7TV emotes');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadEmotes();

    return () => {
      cancelled = true;
    };
  }, [isOpen, emotes.length, isLoading, retryCount]);

  useEffect(() => {
    return () => {
      if (objectUrlsRef.current.length) {
        objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
        objectUrlsRef.current = [];
      }
    };
  }, []);

  const filteredEmotes = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return emotes.slice(0, 240);
    return emotes
      .filter((emote) => emote.name.toLowerCase().includes(trimmed))
      .slice(0, 240);
  }, [emotes, query]);

  const handleEmoteClick = (emote: SevenTVEmote) => {
    onEmoteSelect(emote.fullUrl || emote.previewUrl);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <Button
        ref={buttonRef}
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className={`p-2 text-secondary-action hover:text-secondary-action-hover hover:bg-muted rounded-none ${className}`}
        title="7TV emotes"
      >
        <Sparkles size={18} />
      </Button>

      {isOpen && (
        <div
          ref={pickerRef}
          className="absolute top-full right-0 z-50 mt-2 w-72 rounded-md border border-border bg-background shadow-lg"
        >
          <div className="p-2 border-b border-border">
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search 7TV emotes"
              className="w-full rounded-md border border-border bg-transparent px-2 py-1 text-xs text-foreground outline-none focus-visible:border-input-thin-focus"
            />
          </div>
          <div className="max-h-64 overflow-y-auto p-2">
            {isLoading && (
              <div className="text-xs text-muted-foreground">Loading emotes...</div>
            )}
            {error && !isLoading && (
              <div className="text-xs text-destructive">
                {error}
                <button
                  type="button"
                  onClick={() => setRetryCount((prev) => prev + 1)}
                  className="ml-2 underline text-muted-foreground hover:text-foreground"
                >
                  Retry
                </button>
              </div>
            )}
            {!isLoading && !error && !filteredEmotes.length && (
              <div className="text-xs text-muted-foreground">No emotes found.</div>
            )}
            {!isLoading && !error && filteredEmotes.length > 0 && (
              <div className="grid grid-cols-6 gap-2">
                {filteredEmotes.map((emote) => (
                  <button
                    key={emote.id}
                    type="button"
                    onClick={() => handleEmoteClick(emote)}
                    className="h-10 w-10 rounded-md hover:bg-muted flex items-center justify-center"
                    title={emote.name}
                  >
                    <img
                      src={emote.displayUrl || emote.previewUrl}
                      alt={emote.name}
                      loading="lazy"
                      className="h-8 w-8 object-contain"
                      referrerPolicy="no-referrer"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SevenTVPickerButton;
