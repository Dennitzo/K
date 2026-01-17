import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { useAuth } from '@/contexts/AuthContext';
import { useKaspaTransactions } from '@/hooks/useKaspaTransactions';
import EmojiPickerButton from '@/components/ui/emoji-picker';
import SevenTVPickerButton from '@/components/ui/seventv-picker';
import { detectMentionsInText, validateAndReturnPublicKey } from '@/utils/kaspaAddressUtils';
import { getExplorerTransactionUrl } from '@/utils/explorerUtils';
import { useUserSettings } from '@/contexts/UserSettingsContext';
import emojiData from '@/data/emoji-data.json';

interface ComposeBoxProps {
  onPost: (content: string) => void;
}

const ComposeBox: React.FC<ComposeBoxProps> = ({ onPost }) => {
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validatedMentions, setValidatedMentions] = useState<Array<{pubkey: string}>>([]);
  const { privateKey } = useAuth();
  const { sendTransaction, networkId } = useKaspaTransactions();
  const { selectedNetwork, hideTransactionPopup } = useUserSettings();
  const editorRef = useRef<HTMLDivElement>(null);
  const lastContentRef = useRef<string>('');
  const emojiRangeRef = useRef<{ node: Text; start: number; end: number } | null>(null);
  const [emojiQuery, setEmojiQuery] = useState('');
  const [emojiActiveIndex, setEmojiActiveIndex] = useState(0);

  const emoteUrlRegex = /https?:\/\/cdn\.7tv\.app\/emote\/[A-Za-z0-9]+\/\d+x\.(?:webp|png|avif)/g;

  const escapeHtml = (value: string) =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

  const renderContentHtml = (value: string) => {
    const regex = new RegExp(emoteUrlRegex.source, 'g');
    let lastIndex = 0;
    let html = '';
    let match: RegExpExecArray | null = null;

    while ((match = regex.exec(value)) !== null) {
      const start = match.index;
      const url = match[0];
      const textSegment = value.slice(lastIndex, start);
      html += escapeHtml(textSegment).replace(/\n/g, '<br/>');
      html += `<img data-emote-url="${url}" src="${url}" alt="7TV emote" style="height:1.5rem;width:1.5rem;display:inline-block;vertical-align:text-bottom;" />`;
      lastIndex = start + url.length;
    }

    const tail = value.slice(lastIndex);
    html += escapeHtml(tail).replace(/\n/g, '<br/>');
    return html;
  };

  const emojiIndex = useMemo(() => {
    const toEmoji = (unicode: string) => {
      const codePoints = unicode.split('-').map((part) => parseInt(part, 16));
      return String.fromCodePoint(...codePoints);
    };

    const pickPrimaryName = (names: string[]) => {
      if (!names.length) return '';
      const descriptive = names.find((name) => name.includes(' '));
      return descriptive || names[0];
    };

    const categories = Object.values(emojiData) as Array<Array<{ n?: string[]; u?: string }>>;
    return categories.flatMap((category) =>
      (category || [])
        .filter((entry) => entry?.u && Array.isArray(entry.n) && entry.n.length)
        .map((entry) => {
          const names = entry.n || [];
          return {
            emoji: toEmoji(entry.u as string),
            names,
            primaryName: pickPrimaryName(names),
            search: names.join(' ').toLowerCase()
          };
        })
    );
  }, []);

  const emojiSuggestions = useMemo(() => {
    const trimmed = emojiQuery.trim().toLowerCase();
    if (!trimmed) return [];
    return emojiIndex
      .filter((entry) => entry.search.includes(trimmed))
      .slice(0, 32);
  }, [emojiIndex, emojiQuery]);

  useEffect(() => {
    setEmojiActiveIndex(0);
  }, [emojiQuery]);

  const serializeEditorContent = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent || '';
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return '';
    }

    const element = node as HTMLElement;
    if (element.tagName === 'IMG') {
      return element.dataset.emoteUrl || '';
    }

    if (element.tagName === 'BR') {
      return '\n';
    }

    let text = '';
    element.childNodes.forEach((child) => {
      text += serializeEditorContent(child);
    });

    if (element.tagName === 'DIV' || element.tagName === 'P') {
      return text + '\n';
    }

    return text;
  };

  const updateEmojiQueryFromSelection = () => {
    const editor = editorRef.current;
    if (!editor) {
      setEmojiQuery('');
      emojiRangeRef.current = null;
      return;
    }

    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) {
      setEmojiQuery('');
      emojiRangeRef.current = null;
      return;
    }

    const range = selection.getRangeAt(0);
    if (!editor.contains(range.endContainer)) {
      setEmojiQuery('');
      emojiRangeRef.current = null;
      return;
    }

    if (range.endContainer.nodeType !== Node.TEXT_NODE) {
      setEmojiQuery('');
      emojiRangeRef.current = null;
      return;
    }

    const textNode = range.endContainer as Text;
    const text = textNode.textContent || '';
    const uptoCursor = text.slice(0, range.endOffset);
    const match = /(?:^|\s):([\w+-]*)$/.exec(uptoCursor);

    if (!match) {
      setEmojiQuery('');
      emojiRangeRef.current = null;
      return;
    }

    const query = match[1] || '';
    if (!query) {
      setEmojiQuery('');
      emojiRangeRef.current = null;
      return;
    }

    setEmojiQuery(query);
    emojiRangeRef.current = {
      node: textNode,
      start: range.endOffset - query.length - 1,
      end: range.endOffset
    };
  };

  const updateEditorFromContent = (value: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.innerHTML = renderContentHtml(value);
  };


  // Validate mentions whenever content changes
  useEffect(() => {
    const validateMentions = async () => {
      const mentions = detectMentionsInText(content);
      const validated: Array<{pubkey: string}> = [];
      
      for (const mention of mentions) {
        const validPubkey = await validateAndReturnPublicKey(mention.pubkey);
        if (validPubkey) {
          validated.push({ pubkey: validPubkey });
        }
      }
      
      setValidatedMentions(validated);
    };
    
    if (content.includes('@')) {
      validateMentions();
    } else {
      setValidatedMentions([]);
    }
  }, [content, networkId]);

  useEffect(() => {
    if (!editorRef.current) return;
    if (content === lastContentRef.current) return;
    updateEditorFromContent(content);
    lastContentRef.current = content;
  }, [content]);


  const updateContentFromEditor = () => {
    const editor = editorRef.current;
    if (!editor) return;
    let nextValue = '';
    editor.childNodes.forEach((child) => {
      nextValue += serializeEditorContent(child);
    });
    if (nextValue.endsWith('\n')) {
      nextValue = nextValue.replace(/\n+$/, '');
    }
    lastContentRef.current = nextValue;
    setContent(nextValue);
  };

  const insertEmojiSuggestion = (emoji: string) => {
    const editor = editorRef.current;
    const rangeInfo = emojiRangeRef.current;
    if (!editor || !rangeInfo) {
      insertTextAtCursor(`${emoji} `);
      setEmojiQuery('');
      emojiRangeRef.current = null;
      return;
    }

    const range = document.createRange();
    range.setStart(rangeInfo.node, rangeInfo.start);
    range.setEnd(rangeInfo.node, rangeInfo.end);
    range.deleteContents();

    const insertion = document.createTextNode(`${emoji} `);
    range.insertNode(insertion);

    const selection = window.getSelection();
    if (selection) {
      const caretRange = document.createRange();
      caretRange.setStart(insertion, insertion.textContent?.length || 0);
      caretRange.collapse(true);
      selection.removeAllRanges();
      selection.addRange(caretRange);
    }

    updateContentFromEditor();
    setEmojiQuery('');
    emojiRangeRef.current = null;
    editor.focus();
  };

  const insertTextAtCursor = (value: string) => {
    const editor = editorRef.current;
    if (!editor) {
      setContent((prev) => prev + value);
      return;
    }
    const selection = window.getSelection();
    const hasValidRange = selection && selection.rangeCount && editor.contains(selection.anchorNode);
    if (!hasValidRange) {
      editor.appendChild(document.createTextNode(value));
    } else {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      range.insertNode(document.createTextNode(value));
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    updateContentFromEditor();
    editor.focus();
  };

  const insertEmoteAtCursor = (url: string) => {
    const editor = editorRef.current;
    if (!editor) {
      setContent((prev) => `${prev}${url} `);
      return;
    }
    const img = document.createElement('img');
    img.src = url;
    img.alt = '7TV emote';
    img.dataset.emoteUrl = url;
    img.style.height = '1.5rem';
    img.style.width = '1.5rem';
    img.style.display = 'inline-block';
    img.style.verticalAlign = 'text-bottom';

    const spacer = document.createTextNode(' ');
    const selection = window.getSelection();
    const hasValidRange = selection && selection.rangeCount && editor.contains(selection.anchorNode);
    if (!hasValidRange) {
      editor.appendChild(img);
      editor.appendChild(spacer);
    } else {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      range.insertNode(spacer);
      range.insertNode(img);
      range.setStartAfter(spacer);
      range.setEndAfter(spacer);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    updateContentFromEditor();
    editor.focus();
  };

  const handleEmojiSelect = (emoji: string) => {
    insertTextAtCursor(emoji);
  };

  const handleSevenTVSelect = (url: string) => {
    insertEmoteAtCursor(url);
  };

  const handlePost = async () => {
    if (content.trim() && privateKey && !isSubmitting) {
      try {
        setIsSubmitting(true);
        
        // Send post transaction with mentioned public keys
        const mentionedPubkeys = validatedMentions.map(m => m.pubkey);
        const result = await sendTransaction({
          privateKey: privateKey,
          userMessage: content,
          type: 'post',
          mentionedPubkeys: mentionedPubkeys
        });

        // Show success toast with transaction details
        if (result) {
          if (!hideTransactionPopup) {
            toast.success("Post transaction successful!", {
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
          
          // Only clear content and call parent handler after successful transaction
          onPost(content);
          setContent('');
        }
      } catch (error) {
        console.error('Error submitting post:', error);
        toast.error("An error occurred when sending transaction", {
          description: error instanceof Error ? error.message : "Unknown error occurred",
          duration: 5000,
        });
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <Card className="border-b border-border sm:border-l sm:border-r bg-card rounded-none">
      <CardContent className="p-3 sm:p-4">
        <div className="flex space-x-2 sm:space-x-3">
          {/* Removing avatar
          <Avatar className="h-8 w-8 sm:h-10 sm:w-10 flex-shrink-0">
            <AvatarImage src={userAvatar} />
            <AvatarFallback className="bg-muted text-muted-foreground text-xs sm:text-sm">You</AvatarFallback>
          </Avatar>
          */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start space-x-2">
              <div className="flex-1 relative">
                {content.length === 0 && (
                  <div className="pointer-events-none absolute left-3 top-2 text-muted-foreground text-base">
                    What's happening?
                  </div>
                )}
                <div
                  ref={editorRef}
                  contentEditable
                  suppressContentEditableWarning
                  role="textbox"
                  aria-multiline="true"
                  onInput={() => {
                    updateContentFromEditor();
                    updateEmojiQueryFromSelection();
                  }}
                  onKeyUp={updateEmojiQueryFromSelection}
                  onClick={updateEmojiQueryFromSelection}
                  onKeyDown={(event) => {
                    if (!emojiSuggestions.length) return;
                    if (event.key === 'ArrowDown') {
                      event.preventDefault();
                      setEmojiActiveIndex((prev) => Math.min(prev + 1, emojiSuggestions.length - 1));
                    } else if (event.key === 'ArrowUp') {
                      event.preventDefault();
                      setEmojiActiveIndex((prev) => Math.max(prev - 1, 0));
                    } else if (event.key === 'Enter' || event.key === 'Tab') {
                      event.preventDefault();
                      const pick = emojiSuggestions[emojiActiveIndex];
                      if (pick) {
                        insertEmojiSuggestion(pick.emoji);
                      }
                    } else if (event.key === 'Escape') {
                      event.preventDefault();
                      setEmojiQuery('');
                      emojiRangeRef.current = null;
                    }
                  }}
                  className="flex-1 min-h-10 sm:min-h-12 w-full resize-none text-base border border-input-thin rounded-md bg-transparent px-3 py-2 outline-none focus-visible:border-input-thin-focus"
                />
                {emojiSuggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-md border border-border bg-background shadow-lg">
                    {emojiSuggestions.map((entry, index) => (
                      <button
                        key={`${entry.emoji}-${entry.primaryName}-${index}`}
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => insertEmojiSuggestion(entry.emoji)}
                        className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted ${index === emojiActiveIndex ? 'bg-muted' : ''}`}
                      >
                        <span className="text-base">{entry.emoji}</span>
                        <span className="text-muted-foreground">:{entry.primaryName}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-start space-x-1">
                <EmojiPickerButton onEmojiSelect={handleEmojiSelect} className="mt-1" />
                <SevenTVPickerButton onEmoteSelect={handleSevenTVSelect} className="mt-1" />
              </div>
            </div>
            <div className="flex justify-between items-center mt-2">
              <div className="flex space-x-2">
              </div>
              <Button
                onClick={handlePost}
                disabled={!content.trim() || isSubmitting}
                className="px-4 sm:px-6 py-2 font-bold text-sm sm:text-base"
              >
                {isSubmitting && (
                  <div className="w-3 h-3 sm:w-4 sm:h-4 border-2 border-transparent rounded-full animate-loader-circle-white mr-2"></div>
                )}
                {isSubmitting ? (
                  <>
                    <span className="hidden sm:inline">Posting...</span>
                    <span className="sm:hidden">...</span>
                  </>
                ) : (
                  'Post'
                )}
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ComposeBox;
