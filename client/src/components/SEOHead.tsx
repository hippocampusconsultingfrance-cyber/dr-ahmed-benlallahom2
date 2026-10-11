import { useEffect } from "react";

interface SEOHeadProps {
  title: string;
  description: string;
  keywords?: string;
  ogImage?: string;
  ogUrl?: string;
  twitterHandle?: string;
  structuredData?: Record<string, any>;
  noIndex?: boolean;
}

const DEFAULT_URL = "https://drahmedbenlallahom.com";

export function SEOHead({
  title,
  description,
  keywords,
  ogImage = "https://drahmedbenlallahom.com/assets/abl-logo.svg",
  ogUrl,
  // Aucun compte X/Twitter officiel n'est connu : twitter:site et
  // twitter:creator ne sont émis que si une page fournit explicitement un compte.
  twitterHandle,
  structuredData,
  noIndex = false,
}: SEOHeadProps) {
  useEffect(() => {
    const pageUrl = ogUrl ?? DEFAULT_URL;
    // Une page privée (noindex) sans URL explicite ne doit pas déclarer
    // l'accueil comme URL canonique : signaux contradictoires pour les moteurs.
    const canonicalUrl = ogUrl ?? (noIndex ? undefined : DEFAULT_URL);

    // Update title
    document.title = title;

    // Update or create meta tags
    const updateMeta = (name: string, content: string, isProperty = false) => {
      let element = document.querySelector(
        isProperty ? `meta[property="${name}"]` : `meta[name="${name}"]`
      ) as HTMLMetaElement;

      if (!element) {
        element = document.createElement("meta");
        if (isProperty) {
          element.setAttribute("property", name);
        } else {
          element.setAttribute("name", name);
        }
        document.head.appendChild(element);
      }

      element.setAttribute("content", content);
    };

    // Standard meta tags
    updateMeta("description", description);
    if (keywords) {
      updateMeta("keywords", keywords);
    }
    updateMeta("robots", noIndex ? "noindex, nofollow, noarchive" : "index, follow, max-image-preview:large");

    // Open Graph tags
    updateMeta("og:title", title, true);
    updateMeta("og:description", description, true);
    updateMeta("og:image", ogImage, true);
    updateMeta("og:url", pageUrl, true);
    updateMeta("og:type", "website", true);

    // Twitter tags
    updateMeta("twitter:card", "summary_large_image");
    updateMeta("twitter:title", title);
    updateMeta("twitter:description", description);
    updateMeta("twitter:image", ogImage);
    if (twitterHandle) {
      updateMeta("twitter:site", twitterHandle);
      updateMeta("twitter:creator", twitterHandle);
    } else {
      document
        .querySelectorAll('meta[name="twitter:site"], meta[name="twitter:creator"]')
        .forEach(element => element.remove());
    }

    // Canonical URL
    let canonical = document.querySelector("link[rel='canonical']") as HTMLLinkElement | null;
    if (canonicalUrl) {
      if (!canonical) {
        canonical = document.createElement("link");
        canonical.rel = "canonical";
        document.head.appendChild(canonical);
      }
      canonical.href = canonicalUrl;
    } else if (canonical) {
      canonical.remove();
    }

    // Structured Data (JSON-LD): keep the document-level schemas intact and
    // update only the page-specific schema owned by this component.
    const structuredDataId = "seo-head-structured-data";
    let script = document.getElementById(structuredDataId) as HTMLScriptElement | null;
    if (structuredData) {
      if (!script) {
        script = document.createElement("script");
        script.id = structuredDataId;
        script.type = "application/ld+json";
        document.head.appendChild(script);
      }
      script.textContent = JSON.stringify(structuredData);
    } else if (script) {
      script.remove();
    }
  }, [title, description, keywords, ogImage, ogUrl, twitterHandle, structuredData, noIndex]);

  return null;
}
