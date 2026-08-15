import { useEffect } from "react";

interface SEOHeadProps {
  title: string;
  description: string;
  keywords?: string;
  ogImage?: string;
  ogUrl?: string;
  twitterHandle?: string;
  structuredData?: Record<string, any>;
}

export function SEOHead({
  title,
  description,
  keywords,
  ogImage = "https://drahmedbenlallahom.com/manus-storage/logo-abl_2afbc5e0.png",
  ogUrl = "https://drahmedbenlallahom.com",
  twitterHandle = "@drahmedbenlallahom",
  structuredData,
}: SEOHeadProps) {
  useEffect(() => {
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

    // Open Graph tags
    updateMeta("og:title", title, true);
    updateMeta("og:description", description, true);
    updateMeta("og:image", ogImage, true);
    updateMeta("og:url", ogUrl, true);
    updateMeta("og:type", "website", true);

    // Twitter tags
    updateMeta("twitter:card", "summary_large_image");
    updateMeta("twitter:title", title);
    updateMeta("twitter:description", description);
    updateMeta("twitter:image", ogImage);
    if (twitterHandle) {
      updateMeta("twitter:creator", twitterHandle);
    }

    // Canonical URL
    let canonical = document.querySelector("link[rel='canonical']") as HTMLLinkElement;
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = ogUrl;

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
  }, [title, description, keywords, ogImage, ogUrl, twitterHandle, structuredData]);

  return null;
}
