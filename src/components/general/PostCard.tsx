import React, { useEffect, useMemo, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ThumbsUp, ThumbsDown, MessageCircle, MessageSquareQuote, Bookmark } from "lucide-react";
import { type Post } from "@/models/types";
import { useNavigate } from "react-router-dom";
import UserDetailsDialog from "../dialogs/UserDetailsDialog";
import { useJdenticonAvatar } from "@/hooks/useJdenticonAvatar";
import { toast } from "sonner";
import { useAuth } from '@/contexts/AuthContext';
import { useKaspaTransactions } from '@/hooks/useKaspaTransactions';
import { extractUrls, LinkifiedText } from '@/utils/linkUtils';
import LinkEmbed, { isEmbeddableUrl } from './LinkEmbed';
import QuoteDialog from "../dialogs/QuoteDialog";
import SimplifiedPostCard from "./SimplifiedPostCard";
import { getExplorerTransactionUrl } from '@/utils/explorerUtils';
import { useUserSettings } from '@/contexts/UserSettingsContext';
import bookmarksService from '@/services/bookmarksService';
import { addTranslationLog, translateText } from '@/services/deeplService';

const I18N = {
  de: {
    translate_link: "Übersetzen mit DeepL",
    translating: "Übersetze…",
    translated: "Übersetzt",
    translate_error: "Fehler beim Übersetzen"
  },
  en: {
    translate_link: "Translate with DeepL",
    translating: "Translating…",
    translated: "Translated",
    translate_error: "Translation failed"
  },
  fr: {
    translate_link: "Traduire avec DeepL",
    translating: "Traduction…",
    translated: "Traduit",
    translate_error: "Échec de la traduction"
  },
  es: {
    translate_link: "Traducir con DeepL",
    translating: "Traduciendo…",
    translated: "Traducido",
    translate_error: "Error al traducir"
  },
  it: {
    translate_link: "Traduci con DeepL",
    translating: "Traduzione…",
    translated: "Tradotto",
    translate_error: "Errore di traduzione"
  },
  nl: {
    translate_link: "Vertalen met DeepL",
    translating: "Vertalen…",
    translated: "Vertaald",
    translate_error: "Vertaling mislukt"
  },
  pl: {
    translate_link: "Tłumacz z DeepL",
    translating: "Tłumaczenie…",
    translated: "Przetłumaczono",
    translate_error: "Błąd tłumaczenia"
  }
};

const localeFromLang = (lang: string) => {
  const normalized = (lang || "DE").toUpperCase();
  const map: Record<string, keyof typeof I18N> = {
    DE: "de",
    EN: "en",
    FR: "fr",
    ES: "es",
    IT: "it",
    NL: "nl",
    PL: "pl"
  };
  return map[normalized] || "en";
};

interface PostCardProps {
  post: Post;
  onUpVote?: (id: string) => void;
  onDownVote?: (id: string) => void;
  onRepost?: (id: string) => void;
  isDetailView?: boolean;
  onClick?: () => void;
  onReply?: (postId: string) => void;
  context?: 'detail' | 'list'; // New prop to indicate where the PostCard is being rendered
}

const PostCard: React.FC<PostCardProps> = ({
  post,
  onUpVote,
  onDownVote,
  isDetailView = false,
  onClick,
  onReply,
  context = 'list'
}) => {
  
  const navigate = useNavigate();
  
  const handleMentionClick = (pubkey: string) => {
    // Navigate to user profile using the pubkey as identifier
    // Pass state to indicate this is a mention click so UI can show loading state
    navigate(`/user/${encodeURIComponent(pubkey)}`, { 
      state: { fromMention: true } 
    });
  };
  const [showUserDetailsDialog, setShowUserDetailsDialog] = useState(false);
  const [showQuoteDialog, setShowQuoteDialog] = useState(false);
  const [isSubmittingVote, setIsSubmittingVote] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [translationText, setTranslationText] = useState<string | null>(null);
  const [translationState, setTranslationState] = useState<'idle' | 'translating' | 'translated' | 'error'>('idle');
  const { privateKey } = useAuth();
  const { sendTransaction } = useKaspaTransactions();
  const {
    selectedNetwork,
    deeplApiKey,
    deeplTargetLang,
    debugLogEnabled,
    bookmarksEnabled,
    hideTransactionPopup,
    embedLinksEnabled
  } = useUserSettings();
  
  // Generate dynamic avatar based on pubkey for consistency, but use profile image if available
  const avatarSizePixels = isDetailView ? 48 : 40;
  const jdenticonAvatar = useJdenticonAvatar(post.author.pubkey || post.author.username, avatarSizePixels);
  
  // Use profile image if available, otherwise use generated avatar
  const displayAvatar = post.author.avatar || jdenticonAvatar;

  useEffect(() => {
    const unsubscribe = bookmarksService.subscribe((bookmarks) => {
      setIsBookmarked(bookmarks.some((entry) => entry.id === post.id));
    });
    return unsubscribe;
  }, [post.id]);

  const translationLabels = useMemo(() => {
    const locale = localeFromLang(deeplTargetLang);
    return I18N[locale] || I18N.en;
  }, [deeplTargetLang]);

  const embedUrls = useMemo(() => {
    if (!embedLinksEnabled) return [];
    const emoteUrlRegex = /https?:\/\/cdn\.7tv\.app\/emote\/[A-Za-z0-9]+\/\d+x\.(?:webp|png|avif)/;
    const urls = extractUrls(post.content || '');
    return urls.filter((url) => isEmbeddableUrl(url) && !emoteUrlRegex.test(url));
  }, [post.content, embedLinksEnabled]);

  const handleUpVote = async () => {
    if (!privateKey || isSubmittingVote) return;
    
    try {
      setIsSubmittingVote(true);
      
      // Send vote transaction
      const result = await sendTransaction({
        privateKey,
        userMessage: '', // Empty message for votes
        type: 'vote' as any, // Cast as any since it's not in the official types yet
        postId: post.id,
        vote: 'upvote',
        mentionedPubkey: post.author.pubkey // Include the author's pubkey as per protocol specification
      } as any); // Cast as any to bypass TypeScript for now

      if (result) {
        if (!hideTransactionPopup) {
          toast.success("Upvote transaction successful!", {
            description: (
              <div className="space-y-2">
                <div>Transaction ID: {result.id}</div>
                <div>Fees: {result.feeAmount.toString()} sompi</div>
                <div>Fees: {result.feeKAS} KAS</div>
                <button
                  onClick={() => window.open(getExplorerTransactionUrl(result.id, selectedNetwork), '_blank')}
                  className="mt-2 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90"
                >
                  Open explorer
                </button>
              </div>
            ),
            duration: 5000
          });
        }
        
        // Call the parent handler if provided
        if (onUpVote) {
          onUpVote(post.id);
        }
      }
    } catch (error) {
      console.error('Error submitting upvote:', error);
      toast.error("Error submitting upvote", {
        description: error instanceof Error ? error.message : "Unknown error occurred",
        duration: 5000,
      });
    } finally {
      setIsSubmittingVote(false);
    }
  };

  const handleDownVote = async () => {
    if (!privateKey || isSubmittingVote) return;
    
    try {
      setIsSubmittingVote(true);
      
      // Send vote transaction
      const result = await sendTransaction({
        privateKey,
        userMessage: '', // Empty message for votes
        type: 'vote' as any, // Cast as any since it's not in the official types yet
        postId: post.id,
        vote: 'downvote',
        mentionedPubkey: post.author.pubkey // Include the author's pubkey as per protocol specification
      } as any); // Cast as any to bypass TypeScript for now

      if (result) {
        if (!hideTransactionPopup) {
          toast.success("Downvote transaction successful!", {
            description: (
              <div className="space-y-2">
                <div>Transaction ID: {result.id}</div>
                <div>Fees: {result.feeAmount.toString()} sompi</div>
                <div>Fees: {result.feeKAS} KAS</div>
                <button
                  onClick={() => window.open(getExplorerTransactionUrl(result.id, selectedNetwork), '_blank')}
                  className="mt-2 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90"
                >
                  Open explorer
                </button>
              </div>
            ),
            duration: 5000
          });
        }
        
        // Call the parent handler if provided
        if (onDownVote) {
          onDownVote(post.id);
        }
      }
    } catch (error) {
      console.error('Error submitting downvote:', error);
      toast.error("Error submitting downvote", {
        description: error instanceof Error ? error.message : "Unknown error occurred",
        duration: 5000,
      });
    } finally {
      setIsSubmittingVote(false);
    }
  };

  const handleCardClick = (e: React.MouseEvent) => {
    // Don't navigate if clicking on interactive elements
    if (e.target instanceof HTMLElement) {
      const isInteractive = e.target.closest('button') || e.target.closest('a');
      if (isInteractive) return;
    }

    if (onClick) {
      onClick();
    } else if (!isDetailView) {
      // Allow navigation for both posts and comments, passing post data
      navigate(`/post/${post.id}`, { state: { post } });
    }
  };
  const avatarSize = isDetailView ? "h-12 w-12" : "h-10 w-10";
  const contentTextSize = isDetailView ? "text-lg" : "text-base";
  const authorNameSize = isDetailView ? "text-lg" : "text-base";
  const timestampSize = isDetailView ? "text-base" : "text-xs sm:text-sm";

  // Check if message is longer than 500 characters and truncate if needed
  const MAX_CHARS = 500;
  const isLongMessage = post.content.length > MAX_CHARS;
  const displayContent = isDetailView || !isLongMessage
    ? post.content
    : post.content.substring(0, MAX_CHARS) + '.....';

  const formatTranslationText = (translated: string, original: string) => {
    let formatted = translated.replace(/\r\n/g, '\n');
    formatted = formatted.replace(/\n/g, '\n\n');
    formatted = formatted.replace(/([^\n])\s+(?=\d+\/\d+)/g, '$1\n\n');

    const sentenceBreakRegex = /([.!?])\s+/g;
    formatted = formatted.replace(sentenceBreakRegex, '$1\n\n');

    return formatted;
  };

  const handleTranslate = async (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!deeplApiKey) {
      setTranslationState('error');
      return;
    }
    if (translationState === 'translating') return;
    setTranslationState('translating');
    addTranslationLog(
      {
        ts: new Date().toISOString(),
        level: 'info',
        message: 'Translation started',
        details: `len=${post.content.length}`
      },
      debugLogEnabled
    );

    try {
      const translated = await translateText({
        text: post.content,
        targetLang: deeplTargetLang,
        apiKey: deeplApiKey
      });
      setTranslationText(formatTranslationText(translated, post.content));
      setTranslationState('translated');
      addTranslationLog(
        {
          ts: new Date().toISOString(),
          level: 'info',
          message: 'Translation successful',
          details: `len=${post.content.length}`
        },
        debugLogEnabled
      );
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      setTranslationState('error');
      addTranslationLog(
        {
          ts: new Date().toISOString(),
          level: 'error',
          message: 'Translation failed',
          details: errMsg
        },
        debugLogEnabled
      );
    }
  };

  const handleBookmarkToggle = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (isBookmarked) {
      bookmarksService.removeBookmark(post.id);
    } else {
      bookmarksService.addBookmark(post);
    }
  };

  return (
    <div
      className={`border-b border-border sm:border-l sm:border-r p-3 sm:p-4 hover:bg-accent hover:bg-opacity-50 cursor-pointer transition-colors duration-200 bg-card max-w-full overflow-hidden`}
      onClick={handleCardClick}
    >
      <div className="flex space-x-2 sm:space-x-3">
        <Avatar
          className={`${avatarSize} flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity`}
          onClick={(e) => {
            e.stopPropagation();
            setShowUserDetailsDialog(true);
          }}
        >
            <AvatarImage src={displayAvatar} />
            <AvatarFallback className="bg-muted text-muted-foreground">
              {post.author.name.split(' ').map(n => n[0]).join('')}
            </AvatarFallback>
          </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-1 sm:space-x-2 min-w-0 flex-1">
              <span
                className={`font-bold text-foreground truncate hover:underline cursor-pointer ${authorNameSize}`}
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/user/${post.author.pubkey}`);
                }}
              >
                {post.author.name}
              </span>
            </div>
            <span className={`text-muted-foreground ${timestampSize} flex-shrink-0 ml-2`}>{post.timestamp}</span>
          </div>
          <div className={`mt-1 text-foreground ${contentTextSize} break-words whitespace-pre-wrap`}>
            <LinkifiedText onMentionClick={handleMentionClick}>{displayContent}</LinkifiedText>
          </div>
          {deeplApiKey && (
            <button
              type="button"
              onClick={handleTranslate}
              disabled={translationState === 'translating'}
              className="mt-2 text-xs text-info hover:text-info/80 underline disabled:opacity-60"
            >
              {translationState === 'translating'
                ? translationLabels.translating
                : translationState === 'translated'
                ? translationLabels.translated
                : translationState === 'error'
                ? translationLabels.translate_error
                : translationLabels.translate_link}
            </button>
          )}
          {translationText && (
            <div className="mt-2 border-l-2 border-border pl-3 text-sm text-muted-foreground italic whitespace-pre-wrap">
              {translationText}
            </div>
          )}
          {embedUrls.map((url) => (
            <LinkEmbed key={url} url={url} />
          ))}
          {isLongMessage && !isDetailView && (
            <div className="mt-2 p-2 bg-muted border-l-4 border-primary rounded-r">
              <p className="text-sm text-muted-foreground">
                Click to read more...
              </p>
            </div>
          )}
          {/* Render quoted post if this is a quote */}
          {post.isQuote && post.quote && (
            <div className="mt-3">
              <SimplifiedPostCard
                quote={post.quote}
                onClick={post.quote.referencedId ? (e) => {
                  e?.stopPropagation();
                  if (post.quote) {
                    navigate(`/post/${post.quote.referencedId}`);
                  }
                } : undefined}
              />
            </div>
          )}
          <div className="flex items-center justify-between mt-3 w-full">
            
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-info p-1 sm:p-2 flex-1 flex justify-center min-w-0"
              // TO BE IMPLEMENTED - Reply count click functionality and hover effects
              //className="text-secondary-action hover:text-info hover:bg-interactive-hover p-1 sm:p-2 flex-1 flex justify-center min-w-0"
              onClick={() => {
                if (context === 'list') {
                  // Navigate to PostDetailView with reply intent
                  navigate(`/post/${post.id}`, {
                    state: {
                      post,
                      shouldReply: true,
                      replyToId: post.id
                    }
                  });
                } else if (onReply) {
                  // Use current behavior for detail view
                  onReply(post.id);
                }
              }}
            >
              <MessageCircle className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
              <span className="text-xs sm:text-sm">{post.replies}</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={!privateKey}
              className="text-muted-foreground hover:text-info p-1 sm:p-2 flex-1 flex justify-center min-w-0"
              onClick={(e) => {
                e.stopPropagation();
                setShowQuoteDialog(true);
              }}
            >
              <MessageSquareQuote className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
              <span className="text-xs sm:text-sm">{post.quotes}</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={post.downVoted || post.upVoted || isSubmittingVote || !privateKey}
              className={`p-1 sm:p-2 flex-1 flex justify-center min-w-0 ${
                post.downVoted || !privateKey
                  ? 'text-muted-foreground'
                  : post.upVoted
                  ? 'text-success'
                  : 'text-muted-foreground hover:text-success'
              }`}
              onClick={handleUpVote}
            >
              <div className="w-3 h-3 sm:w-4 sm:h-4 mr-1 flex items-center justify-center flex-shrink-0">
                {isSubmittingVote ? (
                  <div className="w-[8px] h-[8px] sm:w-[12px] sm:h-[12px] border-2 border-transparent rounded-full animate-loader-circle"></div>
                ) : (
                  <ThumbsUp className={`h-3 w-3 sm:h-4 sm:w-4 ${post.upVoted ? 'fill-current' : ''}`} />
                )}
              </div>
              <span className="text-xs sm:text-sm">{post.upVotes || 0}</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={post.upVoted || post.downVoted || isSubmittingVote || !privateKey}
              className={`p-1 sm:p-2 flex-1 flex justify-center min-w-0 ${
                post.upVoted || !privateKey
                  ? 'text-muted-foreground'
                  : post.downVoted
                  ? 'text-destructive'
                  : 'text-muted-foreground hover:text-destructive'
              }`}
              onClick={handleDownVote}
            >
              <div className="w-3 h-3 sm:w-4 sm:h-4 mr-1 flex items-center justify-center flex-shrink-0">
                {isSubmittingVote ? (
                  <div className="w-[8px] h-[8px] sm:w-[12px] sm:h-[12px] border-2 border-transparent rounded-full animate-loader-circle"></div>
                ) : (
                  <ThumbsDown className={`h-3 w-3 sm:h-4 sm:w-4 ${post.downVoted ? 'fill-current' : ''}`} />
                )}
              </div>
              <span className="text-xs sm:text-sm">{post.downVotes || 0}</span>
            </Button>
            {bookmarksEnabled && (
              <Button
                variant="ghost"
                size="sm"
                className={`p-1 sm:p-2 flex-1 flex justify-center min-w-0 ${
                  isBookmarked ? 'text-info' : 'text-muted-foreground hover:text-info'
                }`}
                onClick={handleBookmarkToggle}
              >
                <Bookmark
                  className="h-3 w-3 sm:h-4 sm:w-4 mr-1"
                  fill={isBookmarked ? 'currentColor' : 'none'}
                />
                <span className="text-xs sm:text-sm">
                  {isBookmarked ? 'Bookmarked' : 'Bookmark'}
                </span>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* User Details Dialog */}
      <UserDetailsDialog
        isOpen={showUserDetailsDialog}
        onClose={() => setShowUserDetailsDialog(false)}
        userPubkey={post.author.pubkey}
        userAddress={post.author.username}
        userNickname={post.author.nickname}
        onNavigateToUserPosts={() => navigate(`/user/${post.author.pubkey}`)}
      />

      {/* Quote Dialog */}
      <QuoteDialog
        isOpen={showQuoteDialog}
        onClose={() => setShowQuoteDialog(false)}
        postId={post.id}
        quotedAuthorPubkey={post.author.pubkey}
      />
    </div>
  );
};

export default PostCard;
