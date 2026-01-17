import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Server, Network, Globe, Palette, Info, RefreshCw, Code, ArrowLeft, Bell, Sparkles, Bookmark, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectOption } from '@/components/ui/select';
import { useUserSettings, type KaspaNetwork, type KaspaConnectionType, type IndexerType, type Theme, type TranslationTargetLang } from '@/contexts/UserSettingsContext';
import { KASPA_NETWORKS } from '@/constants/networks';
import { fetchHealthCheck, type HealthCheckResponse } from '@/services/postsApi';
import { toast } from 'sonner';
import { normalizeApiUrl } from '@/utils/urlUtils';
import packageJson from '../../../package.json';
import bookmarksService from '@/services/bookmarksService';
import { clearTranslationLog, getTranslationLog } from '@/services/deeplService';

const SettingsView: React.FC = () => {
  const navigate = useNavigate();
  const {
    selectedNetwork,
    setSelectedNetwork,
    getNetworkDisplayName,
    apiBaseUrl,
    indexerType,
    setIndexerType,
    customIndexerUrl,
    setCustomIndexerUrl,
    kaspaConnectionType,
    setKaspaConnectionType,
    customKaspaNodeUrl,
    setCustomKaspaNodeUrl,
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
    setDebugLogEnabled
  } = useUserSettings();

  const [localCustomIndexerUrl, setLocalCustomIndexerUrl] = useState<string>(customIndexerUrl);
  const [localApiKey, setLocalApiKey] = useState<string>(deeplApiKey);
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [translationLog, setTranslationLog] = useState<string>('');
  const [healthData, setHealthData] = useState<HealthCheckResponse | null>(null);
  const [isCheckingHealth, setIsCheckingHealth] = useState<boolean>(false);
  const [searchbarLoadLimitInput, setSearchbarLoadLimitInput] = useState<string>(
    String(searchbarLoadLimit)
  );
  const searchbarMaxLimit = indexerType === 'custom' ? 1000 : 500;

  useEffect(() => {
    setSearchbarLoadLimitInput(String(searchbarLoadLimit));
  }, [searchbarLoadLimit]);

  const handleCheckHealth = async () => {
    setIsCheckingHealth(true);
    try {
      const data = await fetchHealthCheck(apiBaseUrl);
      setHealthData(data);
      toast.success('Health check completed', {
        description: `Connected to ${data.service} v${data.version} on ${data.network}`
      });
    } catch (error) {
      console.error('Failed to check health:', error);
      setHealthData(null);
      toast.error('Health check failed', {
        description: 'Unable to connect to the indexer server. Please verify the URL.'
      });
    } finally {
      setIsCheckingHealth(false);
    }
  };

  const handleIndexerTypeChange = (type: IndexerType) => {
    setIndexerType(type);
    // Don't clear custom indexer URL when switching away - preserve it for later use
  };

  const handleCustomIndexerUrlChange = (value: string) => {
    setLocalCustomIndexerUrl(value);
  };

  const handleCustomIndexerUrlBlur = () => {
    // Normalize the URL (removes trailing slashes, adds protocol if needed)
    const normalized = normalizeApiUrl(localCustomIndexerUrl);

    // Update local state with normalized value
    setLocalCustomIndexerUrl(normalized);

    // Save if different from current value
    if (normalized !== customIndexerUrl) {
      setCustomIndexerUrl(normalized);
    }
  };

  const handleConnectionTypeChange = (type: KaspaConnectionType) => {
    setKaspaConnectionType(type);
    if (type === 'resolver') {
      // Clear custom node URL when switching to resolver
      setCustomKaspaNodeUrl('');
    }
  };

  const handleCustomNodeUrlChange = (value: string) => {
    setCustomKaspaNodeUrl(value);
  };

  const handleNetworkChange = (network: KaspaNetwork) => {
    setSelectedNetwork(network);
  };

  const handleThemeChange = (newTheme: Theme) => {
    setTheme(newTheme);
  };

  useEffect(() => {
    setLocalApiKey(deeplApiKey);
  }, [deeplApiKey]);

  const refreshTranslationLog = useCallback(() => {
    const entries = getTranslationLog();
    if (!entries.length) {
      setTranslationLog('No entries.');
      return;
    }
    const lines = entries.map((entry) => {
      const details = entry.details ? ` | ${entry.details}` : '';
      return `${entry.ts} [${entry.level.toUpperCase()}] ${entry.message}${details}`;
    });
    setTranslationLog(lines.join('\n'));
  }, []);

  useEffect(() => {
    refreshTranslationLog();
    if (!debugLogEnabled) return;
    const handleLogUpdate = () => refreshTranslationLog();
    window.addEventListener('ks-translation-log', handleLogUpdate);
    return () => window.removeEventListener('ks-translation-log', handleLogUpdate);
  }, [debugLogEnabled, refreshTranslationLog]);

  const handleApiKeyBlur = () => {
    const nextKey = localApiKey.trim();
    if (nextKey !== deeplApiKey) {
      setDeeplApiKey(nextKey);
    }
  };

  const handleLanguageChange = (value: string) => {
    setDeeplTargetLang(value as TranslationTargetLang);
  };

  const handleSystemNotificationsToggle = async (enabled: boolean) => {
    if (!enabled) {
      setSystemNotificationsEnabled(false);
      return;
    }
    if (typeof Notification === 'undefined') {
      toast.error('System notifications are not supported in this environment.');
      setSystemNotificationsEnabled(false);
      return;
    }
    if (Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        toast.error('Notification permission denied.');
        setSystemNotificationsEnabled(false);
        return;
      }
    }
    if (Notification.permission !== 'granted') {
      toast.error('Notifications are blocked in your browser settings.');
      setSystemNotificationsEnabled(false);
      return;
    }
    setSystemNotificationsEnabled(true);
  };

  const handleClearTranslationLog = () => {
    clearTranslationLog();
    refreshTranslationLog();
  };

  const handleClearBookmarks = () => {
    bookmarksService.clearBookmarks();
    toast.success('Bookmarks cleared.');
  };

  return (
    <div className="flex-1 w-full max-w-3xl mx-auto lg:border-r border-border flex flex-col h-full">
      {/* Header */}
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
            <Settings className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-lg sm:text-xl font-bold">Settings</h1>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-scroll p-3 sm:p-4" style={{
        scrollbarWidth: 'none',
        msOverflowStyle: 'none'
      }}>
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Current Settings Summary */}
          <Card className="border border-border">
            <CardContent className="p-6">
              <div className="space-y-4">
                <div className="flex items-center space-x-2 mb-4">
                  <Info className="h-5 w-5 text-muted-foreground" />
                  <h3 className="text-lg font-semibold text-foreground">Current Configuration</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1">Network</label>
                    <div className="bg-muted border border-border p-2 text-sm rounded-md">
                      {getNetworkDisplayName(selectedNetwork)}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1">Indexer</label>
                    <div className="bg-muted border border-border p-2 text-sm rounded-md">
                      {indexerType === 'public' ? 'Public indexer #01' : indexerType === 'local' ? 'Local Indexer (/api)' : 'Custom Indexer'}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1">Connection</label>
                    <div className="bg-muted border border-border p-2 text-sm rounded-md">
                      {kaspaConnectionType === 'public-node' ? 'Public node #1' : kaspaConnectionType === 'resolver' ? 'Automatic (resolver)' : 'Custom Node'}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1">Theme</label>
                    <div className="bg-muted border border-border p-2 text-sm capitalize rounded-md">
                      {theme}
                    </div>
                  </div>

                  {kaspaConnectionType === 'custom-node' && (
                    <div>
                      <label className="block text-sm font-medium text-muted-foreground mb-1">Node URL</label>
                      <div className="bg-muted border border-border p-2 text-sm break-all rounded-md">
                        {customKaspaNodeUrl || 'Not configured'}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Kaspa Network Settings */}
          <Card className="border border-border">
            <CardContent className="p-6">
              <div className="space-y-4">
                <div className="flex items-center space-x-2 mb-4">
                  <Network className="h-5 w-5 text-muted-foreground" />
                  <h2 className="text-lg font-semibold">Kaspa network</h2>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-foreground">
                    Network
                  </label>
                  <Select
                    value={selectedNetwork}
                    onChange={(e) => handleNetworkChange(e.target.value as KaspaNetwork)}
                    className="w-full"
                  >
                    <SelectOption value={KASPA_NETWORKS.MAINNET}>Mainnet</SelectOption>
                    <SelectOption value={KASPA_NETWORKS.TESTNET_10}>Testnet 10</SelectOption>
                  </Select>
                    {selectedNetwork === KASPA_NETWORKS.MAINNET && <p className="text-sm text-destructive font-medium">⚠️ Warning: Real KAS will be used!</p>}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Indexer Settings */}
          <Card className="border border-border">
            <CardContent className="p-6">
              <div className="space-y-4">
                <div className="flex items-center space-x-2 mb-4">
                  <Server className="h-5 w-5 text-muted-foreground" />
                  <h2 className="text-lg font-semibold">Indexer configuration</h2>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-foreground">
                    Indexer
                  </label>
                  <Select
                    value={indexerType}
                    onChange={(e) => handleIndexerTypeChange(e.target.value as IndexerType)}
                    className="w-full"
                  >
                    <SelectOption value="public">Public indexer #01</SelectOption>
                    <SelectOption value="local">Local Indexer (/api)</SelectOption>
                    <SelectOption value="custom">Custom indexer</SelectOption>
                  </Select>
                </div>

                {/* Custom Indexer URL Input */}
                {indexerType === 'custom' && (
                  <div className="space-y-2 mt-4">
                    <label className="block text-sm font-medium text-foreground">
                      Indexer URL
                    </label>
                    <Input
                      type="text"
                      value={localCustomIndexerUrl}
                      onChange={(e) => handleCustomIndexerUrlChange(e.target.value)}
                      onBlur={handleCustomIndexerUrlBlur}
                      placeholder={window.location.protocol === 'https:' ? 'https://indexer.example.com' : 'http://localhost:3000'}
                      className="text-sm border-input-thin focus-visible:border-input-thin-focus focus-visible:ring-0"
                    />
                    <p className="text-xs text-muted-foreground">
                      Supports: /api, example.com, example.com:5000, https://example.com, http://192.168.1.1:5200
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Kaspa Connection Settings */}
          <Card className="border border-border">
            <CardContent className="p-6">
              <div className="space-y-4">
                <div className="flex items-center space-x-2 mb-4">
                  <Globe className="h-5 w-5 text-muted-foreground" />
                  <h2 className="text-lg font-semibold">Kaspa node connection</h2>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-foreground">
                    Connection Type
                  </label>
                  <Select
                    value={kaspaConnectionType}
                    onChange={(e) => handleConnectionTypeChange(e.target.value as KaspaConnectionType)}
                    className="w-full"
                  >
                    <SelectOption value="public-node">Public node #1</SelectOption>
                    <SelectOption value="resolver">Automatic (resolver)</SelectOption>
                    <SelectOption value="custom-node">Your Kaspa node</SelectOption>
                  </Select>
                </div>

                {/* Custom Node URL Input */}
                {kaspaConnectionType === 'custom-node' && (
                  <div className="space-y-2 mt-4">
                    <label className="block text-sm font-medium text-foreground">
                      Kaspa node URL
                    </label>
                    <Input
                      type="url"
                      value={customKaspaNodeUrl}
                      onChange={(e) => handleCustomNodeUrlChange(e.target.value)}
                      placeholder="wss://your-kaspa-node.com:16210 or 192.168.1.100:16210"
                      className="text-sm border-input-thin focus-visible:border-input-thin-focus focus-visible:ring-0"
                    />
                    <p className="text-xs text-muted-foreground">
                      Enter the IP address and port of your Kaspa node. Include protocol (ws:// or wss://) if needed.
                      <br />
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Appearance Settings */}
          <Card className="border border-border">
            <CardContent className="p-6">
              <div className="space-y-4">
                <div className="flex items-center space-x-2 mb-4">
                  <Palette className="h-5 w-5 text-muted-foreground" />
                  <h2 className="text-lg font-semibold">Appearance</h2>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-foreground">
                    Theme
                  </label>
                  <Select
                    value={theme}
                    onChange={(e) => handleThemeChange(e.target.value as Theme)}
                    className="w-full"
                  >
                    <SelectOption value="light">Light</SelectOption>
                    <SelectOption value="dark">Dark</SelectOption>
                  </Select>
                </div>

                <label className="flex items-center space-x-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={turquoiseThemeEnabled}
                    onChange={(e) => setTurquoiseThemeEnabled(e.target.checked)}
                  />
                  <span>Turquoise Kaspa theme</span>
                </label>
              </div>
            </CardContent>
          </Card>

          {/* Software Versions */}
          <Card className="border border-border">
            <CardContent className="p-6">
              <div className="space-y-4">
                <div className="flex items-center space-x-2 mb-4">
                  <Code className="h-5 w-5 text-muted-foreground" />
                  <h2 className="text-lg font-semibold">Software versions</h2>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-foreground">
                    K Version
                  </label>
                  <Input
                    type="text"
                    value={packageJson.version}
                    readOnly
                    className="text-sm border-input-thin bg-muted"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-foreground">
                    Indexer Version
                  </label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="text"
                      value={healthData ? healthData.version : 'Click to refresh data'}
                      readOnly
                      className="text-sm border-input-thin bg-muted"
                    />
                    <Button
                      type="button"
                      onClick={handleCheckHealth}
                      disabled={isCheckingHealth}
                      size="sm"
                      variant="ghost"
                    >
                      <RefreshCw className={`h-4 w-4 ${isCheckingHealth ? 'animate-spin' : ''}`} />
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-border">
            <CardContent className="p-6">
              <div className="space-y-4">
                <div className="flex items-center space-x-2 mb-4">
                  <Sparkles className="h-5 w-5 text-muted-foreground" />
                  <h2 className="text-lg font-semibold">Post translation</h2>
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-foreground">
                    DeepL API Key
                  </label>
                  <Input
                    type={apiKeyVisible ? 'text' : 'password'}
                    value={localApiKey}
                    onChange={(e) => setLocalApiKey(e.target.value)}
                    onBlur={handleApiKeyBlur}
                    placeholder="e.g. xxxx-xxxx-xxxx"
                    className="text-sm border-input-thin focus-visible:border-input-thin-focus focus-visible:ring-0"
                    autoComplete="off"
                  />
                  <p className="text-xs text-muted-foreground">Stored locally in this browser.</p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setApiKeyVisible((prev) => !prev)}
                  >
                    {apiKeyVisible ? 'Hide key' : 'Show key'}
                  </Button>
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-foreground">
                    Target language
                  </label>
                  <Select
                    value={deeplTargetLang}
                    onChange={(e) => handleLanguageChange(e.target.value)}
                    className="w-full"
                  >
                    <SelectOption value="DE">German (DE)</SelectOption>
                    <SelectOption value="EN">English (EN)</SelectOption>
                    <SelectOption value="FR">French (FR)</SelectOption>
                    <SelectOption value="ES">Spanish (ES)</SelectOption>
                    <SelectOption value="IT">Italian (IT)</SelectOption>
                    <SelectOption value="NL">Dutch (NL)</SelectOption>
                    <SelectOption value="PL">Polish (PL)</SelectOption>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-border">
            <CardContent className="p-6">
              <div className="space-y-4">
                <div className="flex items-center space-x-2 mb-4">
                  <Bell className="h-5 w-5 text-muted-foreground" />
                  <h2 className="text-lg font-semibold">Notifications</h2>
                </div>
                <label className="flex items-center space-x-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={tabTitleEnabled}
                    onChange={(e) => setTabTitleEnabled(e.target.checked)}
                  />
                  <span>Browser tab notification (renames tab title)</span>
                </label>
                <label className="flex items-center space-x-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={systemNotificationsEnabled}
                    onChange={(e) => handleSystemNotificationsToggle(e.target.checked)}
                  />
                  <span>System notifications</span>
                </label>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-border">
            <CardContent className="p-6">
              <div className="space-y-4">
                <div className="flex items-center space-x-2 mb-4">
                  <Bookmark className="h-5 w-5 text-muted-foreground" />
                  <h2 className="text-lg font-semibold">Features</h2>
                </div>
                <label className="flex items-center space-x-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={bookmarksEnabled}
                    onChange={(e) => setBookmarksEnabled(e.target.checked)}
                  />
                  <span>Enable bookmarks</span>
                </label>
                {bookmarksEnabled && (
                  <Button type="button" variant="ghost" size="sm" onClick={handleClearBookmarks}>
                    Clear bookmarks
                  </Button>
                )}
                <label className="flex items-center space-x-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={searchbarEnabled}
                    onChange={(e) => setSearchbarEnabled(e.target.checked)}
                  />
                  <span>Search bar (Watching view)</span>
                </label>
                {searchbarEnabled && indexerType !== 'custom' && (
                  <div className="pl-6 space-y-2">
                    <label className="text-xs text-muted-foreground" htmlFor="searchbar-load-limit">
                      Search load limit
                    </label>
                    <Input
                      id="searchbar-load-limit"
                      type="number"
                      min={100}
                      max={searchbarMaxLimit}
                      value={searchbarLoadLimitInput}
                      onChange={(e) => {
                        setSearchbarLoadLimitInput(e.target.value);
                      }}
                      onBlur={() => {
                        const nextValue = Number(searchbarLoadLimitInput);
                        if (!Number.isFinite(nextValue)) {
                          setSearchbarLoadLimitInput(String(searchbarLoadLimit));
                          return;
                        }
                        const clamped = Math.max(100, Math.min(searchbarMaxLimit, Math.round(nextValue)));
                        setSearchbarLoadLimit(clamped);
                        setSearchbarLoadLimitInput(String(clamped));
                      }}
                    />
                    <p className="text-xs text-muted-foreground">
                      Loads up to this many posts when searching.
                    </p>
                  </div>
                )}
                <label className="flex items-center space-x-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={embedLinksEnabled}
                    onChange={(e) => setEmbedLinksEnabled(e.target.checked)}
                  />
                  <span>Embed links</span>
                </label>
                <label className="flex items-center space-x-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={hideTransactionPopup}
                    onChange={(e) => setHideTransactionPopup(e.target.checked)}
                  />
                  <span>Hide transaction popups</span>
                </label>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-border">
            <CardContent className="p-6">
              <div className="space-y-4">
                <div className="flex items-center space-x-2 mb-4">
                  <h2 className="text-lg font-semibold">Debug log</h2>
                </div>
                <label className="flex items-center space-x-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={debugLogEnabled}
                    onChange={(e) => setDebugLogEnabled(e.target.checked)}
                  />
                  <span>Enable debug log</span>
                </label>
                {debugLogEnabled && (
                  <div className="space-y-2">
                    <div className="text-xs text-muted-foreground whitespace-pre-wrap border border-border rounded-md bg-muted p-3">
                      {translationLog}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="ghost" size="sm" onClick={handleClearTranslationLog}>
                        Clear log
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default SettingsView;
