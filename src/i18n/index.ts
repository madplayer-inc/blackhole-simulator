import { ko, type I18nKey } from './ko';
import { en } from './en';

export type Lang = 'ko' | 'en';
export type { I18nKey };

const dicts: Record<Lang, Record<I18nKey, string>> = { ko, en };
const listeners = new Set<() => void>();

function detect(): Lang {
  const q = new URLSearchParams(location.search).get('lang');
  if (q === 'ko' || q === 'en') return q;
  try {
    const s = localStorage.getItem('bh.lang');
    if (s === 'ko' || s === 'en') return s;
  } catch {
    /* storage blocked */
  }
  return navigator.language.toLowerCase().startsWith('ko') ? 'ko' : 'en';
}

let current: Lang = detect();

export function lang(): Lang {
  return current;
}

export function setLang(l: Lang) {
  if (l === current) return;
  current = l;
  try {
    localStorage.setItem('bh.lang', l);
  } catch {
    /* storage blocked */
  }
  applyDocument();
  for (const f of listeners) f();
}

export function onLangChange(f: () => void) {
  listeners.add(f);
}

export function t(key: I18nKey, vars?: Record<string, string | number>): string {
  const s = dicts[current][key] ?? ko[key] ?? key;
  return vars ? s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? '')) : s;
}

/** document-level strings: <html lang>, title, description, [data-i18n] elements */
export function applyDocument() {
  document.documentElement.lang = current;
  document.title = t('app.title');
  document.querySelector('meta[name="description"]')?.setAttribute('content', t('app.description'));
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n as I18nKey);
  });
}
