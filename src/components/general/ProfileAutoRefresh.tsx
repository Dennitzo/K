import { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useUserSettings } from '@/contexts/UserSettingsContext';
import { useKaspaPostsApi } from '@/hooks/useKaspaPostsApi';
import { useKaspaTransactions } from '@/hooks/useKaspaTransactions';
import { addTranslationLog } from '@/services/deeplService';
import { Base64 } from 'js-base64';
import { toast } from 'sonner';
import { getExplorerTransactionUrl } from '@/utils/explorerUtils';

const AUTO_REFRESH_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
const STORAGE_KEY_PREFIX = 'ks_profile_auto_refresh_last_sent';

const ProfileAutoRefresh: React.FC = () => {
  const { publicKey, privateKey, isAuthenticated } = useAuth();
  const { fetchUserDetails } = useKaspaPostsApi();
  const { sendTransaction } = useKaspaTransactions();
  const { debugLogEnabled, profileAutoRefreshEnabled, selectedNetwork, hideTransactionPopup } = useUserSettings();
  const lastCheckKeyRef = useRef<string | null>(null);

  const log = (level: 'info' | 'warn' | 'error', message: string, details?: string) => {
    addTranslationLog(
      {
        ts: new Date().toISOString(),
        level,
        message,
        details
      },
      debugLogEnabled
    );
  };

  useEffect(() => {
    if (!profileAutoRefreshEnabled) {
      lastCheckKeyRef.current = null;
      return;
    }
    if (!isAuthenticated || !publicKey || !privateKey) {
      return;
    }
    const checkKey = `${publicKey}:${profileAutoRefreshEnabled}`;
    if (lastCheckKeyRef.current === checkKey) {
      return;
    }
    lastCheckKeyRef.current = checkKey;
    let cancelled = false;

    const run = async () => {
      try {
        log('info', 'Profile auto-refresh: starting check.');
        const userDetails = await fetchUserDetails(publicKey, publicKey);
        if (cancelled) return;

        const normalizeTimestampMs = (value: number) => {
          if (value > 1e12) return value;
          return value * 1000;
        };
        const lastProfileTxMs = userDetails?.timestamp ? normalizeTimestampMs(userDetails.timestamp) : 0;
        if (!lastProfileTxMs) {
          log('warn', 'Profile auto-refresh: missing last profile timestamp. Skipping.');
          return;
        }
        log('info', 'Profile auto-refresh: last profile transaction timestamp.', new Date(lastProfileTxMs).toLocaleString());

        const now = Date.now();
        const lastSentRaw = localStorage.getItem(`${STORAGE_KEY_PREFIX}:${publicKey}`);
        const lastSentMs = lastSentRaw ? Number(lastSentRaw) : 0;

        if (lastSentMs && now - lastSentMs < AUTO_REFRESH_INTERVAL_MS) {
          log('info', 'Profile auto-refresh: recently sent, skipping.');
          return;
        }

        if (now - lastProfileTxMs < AUTO_REFRESH_INTERVAL_MS) {
          log('info', 'Profile auto-refresh: profile still fresh, skipping.');
          return;
        }

        const encodedNickname = userDetails.userNickname || '';
        const encodedMessage = userDetails.postContent || '';
        const encodedProfileImage = userDetails.userProfileImage || '';

        const decodedNickname = encodedNickname ? Base64.decode(encodedNickname).trim() : '';
        const decodedMessage = encodedMessage ? Base64.decode(encodedMessage).trim() : '';
        const hasAnyContent = Boolean(decodedNickname || decodedMessage || encodedProfileImage);
        if (!hasAnyContent) {
          log('warn', 'Profile auto-refresh: all profile fields empty, skipping.');
          return;
        }

        const payload = `${encodedNickname}:${encodedProfileImage}:${encodedMessage}`;
        log('info', 'Profile auto-refresh: sending profile transaction.');
        const result = await sendTransaction({
          privateKey,
          userMessage: payload,
          type: 'broadcast'
        });

        if (result) {
          if (!hideTransactionPopup) {
            toast.success('Profile auto-refresh sent.', {
              description: (
                <div className="space-y-1">
                  <div>Auto-Refresh Transaction ID: {result.id}</div>
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
          localStorage.setItem(`${STORAGE_KEY_PREFIX}:${publicKey}`, String(now));
          log('info', 'Profile auto-refresh: transaction sent.', `TxId: ${result.id}`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        log('error', 'Profile auto-refresh: failed to send transaction.', message);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [profileAutoRefreshEnabled, isAuthenticated, publicKey, privateKey, fetchUserDetails, sendTransaction, debugLogEnabled]);

  return null;
};

export default ProfileAutoRefresh;
