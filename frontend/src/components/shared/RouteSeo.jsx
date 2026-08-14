import { useLocation } from "react-router-dom";

import Seo from "./Seo";
import { PAGE_SEO, APP_ROUTE_TITLES, DEFAULT_TITLE } from "@/seo/config";

/**
 * Applies per-route metadata from one place, rather than threading a <Seo> into
 * every page component. Keeping it centralised means a new route cannot quietly
 * ship without metadata — it falls through to the noindex default instead of
 * inheriting whatever the previously visited page happened to set.
 */
const RouteSeo = () => {
  const { pathname } = useLocation();

  // Blog detail pages depend on data only BlogPost has, so it owns its own tags.
  if (pathname.startsWith("/blog/")) return null;

  const page = PAGE_SEO[pathname];
  if (page) return <Seo path={pathname} {...page} />;

  const appRoute = APP_ROUTE_TITLES.find(([prefix]) => pathname.startsWith(prefix));
  return (
    <Seo
      path={pathname}
      title={appRoute ? appRoute[1] : DEFAULT_TITLE}
      noindex
    />
  );
};

export default RouteSeo;
