export interface TranslationLogEntry {
  ts: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  details?: string;
}

interface TranslateParams {
  text: string;
  targetLang: string;
  apiKey: string;
}

const LOG_KEY = 'ks_translation_debug_log';
const MAX_LOG_ENTRIES = 100;

export function getTranslationLog(): TranslationLogEntry[] {
  try {
    const raw = localStorage.getItem(LOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Failed to read translation log:', error);
    return [];
  }
}

export function clearTranslationLog(): void {
  try {
    localStorage.removeItem(LOG_KEY);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('ks-translation-log'));
    }
  } catch (error) {
    console.error('Failed to clear translation log:', error);
  }
}

export function addTranslationLog(entry: TranslationLogEntry, enabled: boolean): void {
  if (!enabled) return;
  try {
    const next = [entry, ...getTranslationLog()];
    if (next.length > MAX_LOG_ENTRIES) next.length = MAX_LOG_ENTRIES;
    localStorage.setItem(LOG_KEY, JSON.stringify(next));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('ks-translation-log'));
    }
  } catch (error) {
    console.error('Failed to persist translation log:', error);
  }
}

export async function translateText({ text, targetLang, apiKey }: TranslateParams): Promise<string> {
  const res = await fetch('/deepl/v2/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      auth_key: apiKey,
      text,
      target_lang: targetLang,
      preserve_formatting: '1',
      split_sentences: 'nonewlines'
    }).toString()
  });

  const bodyText = await res.text();
  let json: any;
  try {
    json = JSON.parse(bodyText);
  } catch {
    throw new Error(`DeepL response is not JSON (HTTP ${res.status}).`);
  }

  if (!res.ok) {
    const apiMessage = json && json.message ? json.message : bodyText.slice(0, 200);
    throw new Error(`DeepL error (HTTP ${res.status}): ${apiMessage}`);
  }

  if (!json || !json.translations || !json.translations[0]) {
    throw new Error('DeepL response is invalid.');
  }

  return json.translations[0].text;
}
