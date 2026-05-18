import { useState } from "react";
import { useLocation } from "react-router-dom";
import { ChevronRight } from "@untitledui/icons";
import { AppMark, T, FF } from "@/components/shared/brand";

export const SidebarNavigationSimple = ({ items, secondaryItems, LogOut }) => {
  const location = useLocation();
  const [openItems, setOpenItems] = useState({});

  const isItemActive = (item) => {
    const currentPath = location.pathname;
    const currentHash = location.hash;
    const currentFull = currentPath + currentHash;
    if (currentFull === item.href) return true;
    if (currentPath === item.href && !item.href.includes('#')) return true;
    if (!item.items) return false;
    for (const subItem of item.items) {
      if (currentFull === subItem.href) return true;
      if (currentPath === subItem.href && !subItem.href.includes('#')) return true;
    }
    return false;
  };

  const toggleItem = (item) => {
    if (isItemActive(item)) return;
    setOpenItems((prev) => ({ [item.label]: !prev[item.label] }));
  };

  return (
    <div className="hidden md:flex flex-col h-screen sticky top-0 bg-cream border-r border-ink-8 w-72 overflow-hidden flex-shrink-0">
      {/* Logo */}
      <div className="px-6 pt-6 pb-5 flex items-center gap-3">
        <AppMark size={36} />
        <h2 className="text-3xl text-ink leading-none" style={{ fontFamily: FF.serif, letterSpacing: -0.8 }}>timetify</h2>
      </div>

      {/* Primary nav */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <nav className="space-y-1">
          {items.map((item, index) => {
            const isForcedOpen = isItemActive(item);
            const isExpanded = isForcedOpen || !!openItems[item.label];
            const hasChildren = item.items && item.items.length > 0;

            return (
              <div key={index} className="space-y-1">
                <a
                  href={item.href}
                  onClick={() => { if (hasChildren) toggleItem(item); }}
                  className={`flex items-center w-full px-3.5 py-2.5 text-sm font-semibold rounded-full transition-colors group ${
                    isForcedOpen
                      ? "bg-ink text-cream"
                      : isExpanded
                        ? "text-ink"
                        : "text-ink-60 hover:bg-ink-8 hover:text-ink"
                  }`}
                >
                  {item.icon && (
                    <item.icon
                      className={`mr-3 h-4 w-4 shrink-0 ${
                        isForcedOpen ? "text-cream" : isExpanded ? "text-coral" : "text-ink-40 group-hover:text-coral"
                      }`}
                    />
                  )}
                  <span className="flex-1 text-left">{item.label}</span>
                  {hasChildren && (
                    <ChevronRight
                      className={`h-4 w-4 stroke-[2.5px] transition-transform duration-200 ${
                        isForcedOpen ? "text-cream" : "text-ink-40"
                      } ${isExpanded ? "rotate-90" : ""}`}
                    />
                  )}
                </a>

                <div
                  className={`grid transition-all duration-300 ease-in-out ${
                    isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                  }`}
                >
                  <div className="overflow-hidden">
                    <div className="space-y-0.5 ml-7 border-l-2 border-ink-8 pl-3 pb-1 mt-1">
                      {item.items &&
                        item.items.map((subItem, subIndex) => {
                          const isSubActive =
                            location.pathname + location.hash === subItem.href ||
                            (location.pathname === subItem.href && !subItem.href.includes('#'));
                          return (
                            <a
                              key={subIndex}
                              href={subItem.href}
                              className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-full transition-colors ${
                                isSubActive
                                  ? "text-ink font-semibold"
                                  : "text-ink-60 hover:text-ink"
                              }`}
                            >
                              {isSubActive && <span className="w-1.5 h-1.5 rounded-full bg-coral" />}
                              <span>{subItem.label}</span>
                            </a>
                          );
                        })}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </nav>
      </div>

      {/* Secondary items (Add, Profile) */}
      {secondaryItems && secondaryItems.length > 0 && (
        <div className="px-4 pb-2 space-y-2">
          {secondaryItems.map((item, index) => (
            <a
              key={index}
              href={item.href}
              className="flex items-center w-full px-4 py-2.5 text-sm font-semibold text-ink bg-white border border-ink-8 rounded-full hover:bg-ink-8 transition-colors group"
            >
              {item.icon && (
                <item.icon className="mr-3 h-4 w-4 shrink-0 text-coral" />
              )}
              <span>{item.label}</span>
            </a>
          ))}
        </div>
      )}

      {/* Log out / Log in */}
      {LogOut && LogOut.length > 0 && (
        <div className="px-4 pb-6 pt-2">
          {LogOut.map((item, index) => {
            const isLogin = item.label === "Log In";
            return (
              <a
                key={index}
                href={item.onClick ? undefined : item.href}
                onClick={(e) => {
                  if (item.onClick) {
                    e.preventDefault();
                    item.onClick();
                  }
                }}
                className={`flex items-center justify-center w-full px-4 py-2.5 text-sm font-bold rounded-full transition-colors cursor-pointer ${
                  isLogin
                    ? "bg-coral hover:bg-coral-dark text-white"
                    : "bg-ink hover:opacity-90 text-cream"
                }`}
              >
                {item.label}
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
};
