import { useEffect } from "react";

/**
 * Loads the AdSense tag on demand instead of from index.html.
 *
 * It previously sat in the document <head>, so every visitor — including
 * first-time visitors hitting the landing page, where the largest contentful
 * paint is decided — paid for a third-party connection and script fetch before
 * seeing anything. Ads only run on the blog, so the tag now loads only there.
 *
 * Consequence worth knowing: AdSense Auto ads can no longer place ads outside
 * /blog, because the script is not present elsewhere.
 */

const ADSENSE_CLIENT = "ca-pub-9825491172037028";
const ADSENSE_SRC = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`;
const ADSENSE_HOST = "https://pagead2.googlesyndication.com";

const AdSenseLoader = () => {
  useEffect(() => {
    // Navigating between blog pages must not append the script repeatedly.
    if (document.querySelector(`script[src^="${ADSENSE_HOST}"]`)) return;

    const script = document.createElement("script");
    script.src = ADSENSE_SRC;
    script.async = true;
    script.crossOrigin = "anonymous";
    document.head.appendChild(script);
    // Intentionally never removed: AdSense does not support being torn down,
    // and re-adding it on each visit to /blog would reinitialise it.
  }, []);

  return null;
};

export default AdSenseLoader;
