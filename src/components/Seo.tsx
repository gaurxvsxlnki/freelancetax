import { useEffect } from 'react';

interface SeoProps {
  title: string;
  description?: string;
  /** Public marketing pages only. App pages are behind auth and never indexed. */
  noIndex?: boolean;
}

function setMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

/** Lightweight per-page SEO: title, description, canonical-ish OG tags. */
export function Seo({ title, description, noIndex = false }: SeoProps) {
  useEffect(() => {
    document.title = title;
    if (description) {
      setMeta('name', 'description', description);
      setMeta('property', 'og:description', description);
    }
    setMeta('property', 'og:title', title);
    setMeta('property', 'og:type', 'website');
    setMeta('property', 'og:site_name', 'FreelanceTax');
    setMeta('name', 'robots', noIndex ? 'noindex, nofollow' : 'index, follow');
    return () => {
      setMeta('name', 'robots', 'index, follow');
    };
  }, [title, description, noIndex]);

  return null;
}
