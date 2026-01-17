import React, { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import {
  type KaspaNetwork,
  DEFAULT_NETWORK,
  getNetworkDisplayName as getNetworkDisplayNameUtil,
  getNetworkRPCId as getNetworkRPCIdUtil,
  isValidNetwork
} from '@/constants/networks';

export type { KaspaNetwork } from '@/constants/networks';
export type KaspaConnectionType = 'resolver' | 'public-node' | 'custom-node';
export type IndexerType = 'public' | 'local' | 'custom';
export type Theme = 'light' | 'dark';
export type TranslationTargetLang = 'DE' | 'EN' | 'FR' | 'ES' | 'IT' | 'NL' | 'PL';

interface UserSettingsContextType {
  selectedNetwork: KaspaNetwork;
  setSelectedNetwork: (network: KaspaNetwork) => void;
  getNetworkDisplayName: (network: KaspaNetwork) => string;
  getNetworkRPCId: (network: KaspaNetwork) => string;
  apiBaseUrl: string;
  setApiBaseUrl: (url: string) => void;
  indexerType: IndexerType;
  setIndexerType: (type: IndexerType) => void;
  customIndexerUrl: string;
  setCustomIndexerUrl: (url: string) => void;
  kaspaConnectionType: KaspaConnectionType;
  setKaspaConnectionType: (type: KaspaConnectionType) => void;
  customKaspaNodeUrl: string;
  setCustomKaspaNodeUrl: (url: string) => void;
  kaspaNodeUrl: string;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  deeplApiKey: string;
  setDeeplApiKey: (key: string) => void;
  deeplTargetLang: TranslationTargetLang;
  setDeeplTargetLang: (lang: TranslationTargetLang) => void;
  tabTitleEnabled: boolean;
  setTabTitleEnabled: (enabled: boolean) => void;
  systemNotificationsEnabled: boolean;
  setSystemNotificationsEnabled: (enabled: boolean) => void;
  bookmarksEnabled: boolean;
  setBookmarksEnabled: (enabled: boolean) => void;
  searchbarEnabled: boolean;
  setSearchbarEnabled: (enabled: boolean) => void;
  searchbarLoadLimit: number;
  setSearchbarLoadLimit: (limit: number) => void;
  embedLinksEnabled: boolean;
  setEmbedLinksEnabled: (enabled: boolean) => void;
  hideTransactionPopup: boolean;
  setHideTransactionPopup: (enabled: boolean) => void;
  turquoiseThemeEnabled: boolean;
  setTurquoiseThemeEnabled: (enabled: boolean) => void;
  debugLogEnabled: boolean;
  setDebugLogEnabled: (enabled: boolean) => void;
  profileAutoRefreshEnabled: boolean;
  setProfileAutoRefreshEnabled: (enabled: boolean) => void;
  isSettingsLoaded: boolean;
}

const UserSettingsContext = createContext<UserSettingsContextType | undefined>(undefined);

export const useUserSettings = () => {
  const context = useContext(UserSettingsContext);
  if (context === undefined) {
    throw new Error('useUserSettings must be used within a UserSettingsProvider');
  }
  return context;
};

interface UserSettingsProviderProps {
  children: ReactNode;
}

const SETTINGS_STORAGE_KEY = 'kaspa_user_settings';

export const UserSettingsProvider: React.FC<UserSettingsProviderProps> = ({ children }) => {
  const [selectedNetwork, setSelectedNetworkState] = useState<KaspaNetwork>(DEFAULT_NETWORK);
  const [indexerType, setIndexerTypeState] = useState<IndexerType>('public');
  const [customIndexerUrl, setCustomIndexerUrlState] = useState<string>('');
  const [kaspaConnectionType, setKaspaConnectionTypeState] = useState<KaspaConnectionType>('resolver');
  const [customKaspaNodeUrl, setCustomKaspaNodeUrlState] = useState<string>('');
  const [theme, setThemeState] = useState<Theme>('light');
  const [isSettingsLoaded, setIsSettingsLoaded] = useState<boolean>(false);
  const [deeplApiKey, setDeeplApiKeyState] = useState<string>('');
  const [deeplTargetLang, setDeeplTargetLangState] = useState<TranslationTargetLang>('DE');
  const [tabTitleEnabled, setTabTitleEnabledState] = useState<boolean>(true);
  const [systemNotificationsEnabled, setSystemNotificationsEnabledState] = useState<boolean>(false);
  const [bookmarksEnabled, setBookmarksEnabledState] = useState<boolean>(true);
  const [searchbarEnabled, setSearchbarEnabledState] = useState<boolean>(false);
  const [searchbarLoadLimit, setSearchbarLoadLimitState] = useState<number>(100);
  const [embedLinksEnabled, setEmbedLinksEnabledState] = useState<boolean>(false);
  const [hideTransactionPopup, setHideTransactionPopupState] = useState<boolean>(false);
  const [turquoiseThemeEnabled, setTurquoiseThemeEnabledState] = useState<boolean>(false);
  const [debugLogEnabled, setDebugLogEnabledState] = useState<boolean>(false);
  const [profileAutoRefreshEnabled, setProfileAutoRefreshEnabledState] = useState<boolean>(false);

  // Derive apiBaseUrl from indexerType and customIndexerUrl
  const apiBaseUrl = indexerType === 'public'
    ? 'https://mainnet.kaspatalk.net'
    : indexerType === 'local'
    ? '/api'
    : customIndexerUrl;

  // Derive kaspaNodeUrl from kaspaConnectionType and customKaspaNodeUrl
  const kaspaNodeUrl = kaspaConnectionType === 'public-node'
    ? 'wss://node.k-social.network'
    : kaspaConnectionType === 'custom-node'
    ? customKaspaNodeUrl
    : ''; // Empty string for 'resolver' to trigger automatic resolution

  // Load settings from localStorage on mount
  useEffect(() => {
    try {
      const storedSettings = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (storedSettings) {
        const settings = JSON.parse(storedSettings);

        if (settings.selectedNetwork && isValidNetwork(settings.selectedNetwork)) {
          setSelectedNetworkState(settings.selectedNetwork);
        }

        // Migration logic: convert old apiBaseUrl to new indexerType system
        if (settings.indexerType && ['public', 'local', 'custom'].includes(settings.indexerType)) {
          // Migrate 'kaspatalk' to 'public' if found
          const migratedType = settings.indexerType === 'kaspatalk' ? 'public' : settings.indexerType;
          setIndexerTypeState(migratedType);
          if (settings.customIndexerUrl && typeof settings.customIndexerUrl === 'string') {
            setCustomIndexerUrlState(settings.customIndexerUrl);
          }
        } else if (settings.apiBaseUrl && typeof settings.apiBaseUrl === 'string') {
          // Migrate old apiBaseUrl to new system
          const url = settings.apiBaseUrl;
          if (url === 'https://mainnet.kaspatalk.net') {
            setIndexerTypeState('public');
          } else if (url === '/api') {
            setIndexerTypeState('local');
          } else {
            setIndexerTypeState('custom');
            setCustomIndexerUrlState(url);
          }
        }

        if (settings.kaspaConnectionType &&
            ['resolver', 'public-node', 'custom-node'].includes(settings.kaspaConnectionType)) {
          setKaspaConnectionTypeState(settings.kaspaConnectionType);
        }

        if (settings.customKaspaNodeUrl && typeof settings.customKaspaNodeUrl === 'string') {
          setCustomKaspaNodeUrlState(settings.customKaspaNodeUrl);
        }

        if (settings.theme && ['light', 'dark'].includes(settings.theme)) {
          setThemeState(settings.theme);
          // Apply theme to document root immediately
          if (typeof document !== 'undefined') {
            document.documentElement.setAttribute('data-theme', settings.theme);
          }
        }
        if (typeof settings.deeplApiKey === 'string') {
          setDeeplApiKeyState(settings.deeplApiKey);
        }
        if (settings.deeplTargetLang && ['DE', 'EN', 'FR', 'ES', 'IT', 'NL', 'PL'].includes(settings.deeplTargetLang)) {
          setDeeplTargetLangState(settings.deeplTargetLang);
        }
        if (typeof settings.tabTitleEnabled === 'boolean') {
          setTabTitleEnabledState(settings.tabTitleEnabled);
        }
        if (typeof settings.systemNotificationsEnabled === 'boolean') {
          setSystemNotificationsEnabledState(settings.systemNotificationsEnabled);
        }
        if (typeof settings.bookmarksEnabled === 'boolean') {
          setBookmarksEnabledState(settings.bookmarksEnabled);
        }
        if (typeof settings.searchbarEnabled === 'boolean') {
          setSearchbarEnabledState(settings.searchbarEnabled);
        }
        if (Number.isFinite(settings.searchbarLoadLimit)) {
          const indexerTypeForClamp =
            settings.indexerType && ['public', 'local', 'custom'].includes(settings.indexerType)
              ? settings.indexerType
              : indexerType;
          const maxLimit = indexerTypeForClamp === 'custom' ? 1000 : 500;
          const clamped = Math.min(maxLimit, Math.max(100, Math.round(settings.searchbarLoadLimit)));
          setSearchbarLoadLimitState(clamped);
        }
        if (typeof settings.embedLinksEnabled === 'boolean') {
          setEmbedLinksEnabledState(settings.embedLinksEnabled);
        }
        if (typeof settings.hideTransactionPopup === 'boolean') {
          setHideTransactionPopupState(settings.hideTransactionPopup);
        }
        if (typeof settings.turquoiseThemeEnabled === 'boolean') {
          setTurquoiseThemeEnabledState(settings.turquoiseThemeEnabled);
          if (typeof document !== 'undefined') {
            if (settings.turquoiseThemeEnabled) {
              document.documentElement.setAttribute('data-accent', 'turquoise');
            } else {
              document.documentElement.removeAttribute('data-accent');
            }
          }
        }
        if (typeof settings.debugLogEnabled === 'boolean') {
          setDebugLogEnabledState(settings.debugLogEnabled);
        }
        if (typeof settings.profileAutoRefreshEnabled === 'boolean') {
          setProfileAutoRefreshEnabledState(settings.profileAutoRefreshEnabled);
        }
      }
    } catch (error) {
      console.error('Error loading user settings:', error);
      // Continue with default settings if loading fails
    } finally {
      // Mark settings as loaded
      setIsSettingsLoaded(true);
    }

    // Apply default theme if no settings exist
    if (typeof document !== 'undefined' && !localStorage.getItem(SETTINGS_STORAGE_KEY)) {
      document.documentElement.setAttribute('data-theme', 'light');
    }
  }, []);

  // Save settings whenever they change (after initial load is complete)
  useEffect(() => {
    // Only save if settings have been loaded (prevents saving defaults on mount)
    if (!isSettingsLoaded) {
      return;
    }

    const settings = {
      selectedNetwork,
      indexerType,
      customIndexerUrl,
      kaspaConnectionType,
      customKaspaNodeUrl,
      theme,
      deeplApiKey,
      deeplTargetLang,
      tabTitleEnabled,
      systemNotificationsEnabled,
      bookmarksEnabled,
      searchbarEnabled,
      searchbarLoadLimit,
      embedLinksEnabled,
      hideTransactionPopup,
      turquoiseThemeEnabled,
      debugLogEnabled,
      profileAutoRefreshEnabled
    };

    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch (error) {
      console.error('Error auto-saving settings:', error);
    }
  }, [
    selectedNetwork,
    indexerType,
    customIndexerUrl,
    kaspaConnectionType,
    customKaspaNodeUrl,
    theme,
    deeplApiKey,
    deeplTargetLang,
    tabTitleEnabled,
    systemNotificationsEnabled,
    bookmarksEnabled,
    searchbarEnabled,
    searchbarLoadLimit,
    embedLinksEnabled,
    hideTransactionPopup,
    turquoiseThemeEnabled,
    debugLogEnabled,
    profileAutoRefreshEnabled,
    isSettingsLoaded
  ]);

  const setSelectedNetwork = (network: KaspaNetwork) => {
    setSelectedNetworkState(network);
    // Note: Settings are auto-saved via useEffect when state changes
  };

  // Deprecated: kept for backward compatibility, but now a no-op
  // Use setIndexerType and setCustomIndexerUrl instead
  const setApiBaseUrl = (_url: string) => {
    console.warn('setApiBaseUrl is deprecated. Use setIndexerType and setCustomIndexerUrl instead.');
  };

  const setIndexerType = (type: IndexerType) => {
    setIndexerTypeState(type);
    // Note: Settings are auto-saved via useEffect when state changes
  };

  const setCustomIndexerUrl = (url: string) => {
    setCustomIndexerUrlState(url);
    // Note: Settings are auto-saved via useEffect when state changes
  };

  const setKaspaConnectionType = (type: KaspaConnectionType) => {
    setKaspaConnectionTypeState(type);
    // Note: Settings are auto-saved via useEffect when state changes
  };

  const setCustomKaspaNodeUrl = (url: string) => {
    setCustomKaspaNodeUrlState(url);
    // Note: Settings are auto-saved via useEffect when state changes
  };

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    // Note: Settings are auto-saved via useEffect when state changes

    // Apply theme to document root
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', newTheme);
    }
  };

  const setDeeplApiKey = (key: string) => {
    setDeeplApiKeyState(key);
  };

  const setDeeplTargetLang = (lang: TranslationTargetLang) => {
    setDeeplTargetLangState(lang);
  };

  const setTabTitleEnabled = (enabled: boolean) => {
    setTabTitleEnabledState(enabled);
  };

  const setSystemNotificationsEnabled = (enabled: boolean) => {
    setSystemNotificationsEnabledState(enabled);
  };

  const setBookmarksEnabled = (enabled: boolean) => {
    setBookmarksEnabledState(enabled);
  };

  const setSearchbarEnabled = (enabled: boolean) => {
    setSearchbarEnabledState(enabled);
  };

  const setSearchbarLoadLimit = (limit: number) => {
    const maxLimit = indexerType === 'custom' ? 1000 : 500;
    const clamped = Math.min(maxLimit, Math.max(100, Math.round(limit)));
    setSearchbarLoadLimitState(clamped);
  };

  const setEmbedLinksEnabled = (enabled: boolean) => {
    setEmbedLinksEnabledState(enabled);
  };

  useEffect(() => {
    const maxLimit = indexerType === 'custom' ? 1000 : 500;
    setSearchbarLoadLimitState((current) => Math.min(maxLimit, Math.max(100, current)));
  }, [indexerType]);

  const setHideTransactionPopup = (enabled: boolean) => {
    setHideTransactionPopupState(enabled);
  };

  const setTurquoiseThemeEnabled = (enabled: boolean) => {
    setTurquoiseThemeEnabledState(enabled);
    if (typeof document !== 'undefined') {
      if (enabled) {
        document.documentElement.setAttribute('data-accent', 'turquoise');
      } else {
        document.documentElement.removeAttribute('data-accent');
      }
    }
  };

  const setDebugLogEnabled = (enabled: boolean) => {
    setDebugLogEnabledState(enabled);
  };

  const setProfileAutoRefreshEnabled = (enabled: boolean) => {
    setProfileAutoRefreshEnabledState(enabled);
  };

  const getNetworkDisplayName = (network: KaspaNetwork): string => {
    return getNetworkDisplayNameUtil(network);
  };

  const getNetworkRPCId = (network: KaspaNetwork): string => {
    return getNetworkRPCIdUtil(network);
  };

  const value: UserSettingsContextType = {
    selectedNetwork,
    setSelectedNetwork,
    getNetworkDisplayName,
    getNetworkRPCId,
    apiBaseUrl,
    setApiBaseUrl,
    indexerType,
    setIndexerType,
    customIndexerUrl,
    setCustomIndexerUrl,
    kaspaConnectionType,
    setKaspaConnectionType,
    customKaspaNodeUrl,
    setCustomKaspaNodeUrl,
    kaspaNodeUrl,
    theme,
    setTheme,
    deeplApiKey,
    setDeeplApiKey,
    deeplTargetLang,
    setDeeplTargetLang,
    tabTitleEnabled,
    setTabTitleEnabled,
    systemNotificationsEnabled,
    setSystemNotificationsEnabled,
    bookmarksEnabled,
    setBookmarksEnabled,
    searchbarEnabled,
    setSearchbarEnabled,
    searchbarLoadLimit,
    setSearchbarLoadLimit,
    embedLinksEnabled,
    setEmbedLinksEnabled,
    hideTransactionPopup,
    setHideTransactionPopup,
    turquoiseThemeEnabled,
    setTurquoiseThemeEnabled,
    debugLogEnabled,
    setDebugLogEnabled,
    profileAutoRefreshEnabled,
    setProfileAutoRefreshEnabled,
    isSettingsLoaded
  };

  return (
    <UserSettingsContext.Provider value={value}>
      {children}
    </UserSettingsContext.Provider>
  );
};
