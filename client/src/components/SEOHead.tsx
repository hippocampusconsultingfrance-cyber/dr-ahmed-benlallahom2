import { useEffect } from "react";
import { useLocation } from "wouter";
import { useLanguage } from "@/contexts/LanguageContext";
import { resolveClientSeo } from "@shared/routeMetadata";

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

/**
 * Met à jour le <head> après hydratation. Pour une route publique connue, le titre, la
 * description, les robots, la canonique et l'image de partage viennent de la table partagée
 * avec le pré-rendu (shared/routeMetadata.ts) : le HTML servi et le DOM hydraté sont
 * identiques en français. Les props ne servent qu'aux autres langues et aux routes
 * dynamiques ou privées. Une page privée (noindex) sans URL explicite ne déclare jamais
 * l'accueil comme canonique (resolveClientSeo).
 */
export function SEOHead({
  title,
  description,
  keywords,
  ogImage,
  ogUrl,
  // Aucun compte X/Twitter officiel n'est connu : twitter:site et
  // twitter:creator ne sont émis que si une page fournit explicitement un compte.
  twitterHandle,
  structuredData,
  noIndex = false,
}: SEOHeadProps) {
  const [location] = useLocation();
  const { language } = useLanguage();

  useEffect(() => {
    const seo = resolveClientSeo(location, language, { title, description, keywords, ogImage, ogUrl, noIndex });

    // Update title
    document.title = seo.title;

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
    updateMeta("description", seo.description);
    if (seo.keywords) {
      updateMeta("keywords", seo.keywords);
    }
    updateMeta("robots", seo.robots);

    // Open Graph tags
    updateMeta("og:title", seo.title, true);
    updateMeta("og:description", seo.description, true);
    updateMeta("og:image", seo.image.url, true);
    updateMeta("og:image:type", seo.image.type, true);
    updateMeta("og:image:width", String(seo.image.width), true);
    updateMeta("og:image:height", String(seo.image.height), true);
    updateMeta("og:image:alt", seo.image.alt, true);
    updateMeta("og:url", seo.ogUrl, true);
    updateMeta("og:type", "website", true);

    // Twitter tags
    updateMeta("twitter:card", "summary_large_image");
    updateMeta("twitter:title", seo.title);
    updateMeta("twitter:description", seo.description);
    updateMeta("twitter:image", seo.image.url);
    updateMeta("twitter:image:alt", seo.image.alt);
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
    if (seo.canonicalUrl) {
      if (!canonical) {
        canonical = document.createElement("link");
        canonical.rel = "canonical";
        document.head.appendChild(canonical);
      }
      canonical.href = seo.canonicalUrl;
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
  }, [location, language, title, description, keywords, ogImage, ogUrl, twitterHandle, structuredData, noIndex]);

  return null;
}
