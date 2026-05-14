import { useState } from "react";
import { useLocation } from "react-router-dom";
import { ChevronRight } from "@untitledui/icons";

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
    <div className="hidden md:flex flex-col h-screen sticky top-0 bg-white border-r border-[#e8e9ed] w-72 overflow-hidden flex-shrink-0">
      {/* Logo */}
      <div className="px-6 pt-6 pb-4">
        <h2 className="text-3xl font-normal text-[#607196] tracking-tight" style={{ fontFamily: "'DM Serif Text', serif" }}>Timetify</h2>
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
                  onClick={(e) => {
                    if (hasChildren) toggleItem(item);
                  }}
                  className={`flex items-center w-full px-3 py-2.5 text-sm font-semibold  transition-colors group ${
                    isExpanded
                      ? "text-gray-900"
                      : "text-gray-600 hover:bg-[#e8e9ed] hover:text-gray-900"
                  } ${isForcedOpen ? "bg-[#e8e9ed]/60" : ""}`}
                >
                  {item.icon && (
                    <item.icon
                      className={`mr-3 h-5 w-5 shrink-0 ${
                        isExpanded ? "text-[#607196]" : "text-gray-400 group-hover:text-[#607196]"
                      }`}
                    />
                  )}
                  <span className="flex-1 text-left">{item.label}</span>
                  {hasChildren && (
                    <ChevronRight
                      className={`h-4 w-4 text-gray-400 stroke-[2.5px] transition-transform duration-200 ${
                        isExpanded ? "rotate-90" : ""
                      }`}
                    />
                  )}
                </a>

                <div
                  className={`grid transition-all duration-300 ease-in-out ${
                    isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                  }`}
                >
                  <div className="overflow-hidden">
                    <div className="space-y-0.5 ml-8 border-l-2 border-[#e8e9ed] pl-3 pb-1 mt-1">
                      {item.items &&
                        item.items.map((subItem, subIndex) => {
                          const isSubActive =
                            location.pathname + location.hash === subItem.href ||
                            (location.pathname === subItem.href && !subItem.href.includes('#'));
                          return (
                            <a
                              key={subIndex}
                              href={subItem.href}
                              className={`block px-3 py-2 text-sm  transition-colors ${
                                isSubActive
                                  ? "bg-[#e8e9ed] text-gray-900 font-semibold"
                                  : "text-gray-500 hover:bg-[#e8e9ed]/50 hover:text-gray-800"
                              }`}
                            >
                              {subItem.label}
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

      {/* Secondary items (Add, User) */}
      {secondaryItems && secondaryItems.length > 0 && (
        <div className="px-4 pb-2 space-y-2">
          {secondaryItems.map((item, index) => (
            <a
              key={index}
              href={item.href}
              className="flex items-center w-full px-4 py-3 text-sm font-semibold text-gray-800  bg-[#e8e9ed] hover:bg-[#d8dae0] transition-colors group"
            >
              {item.icon && (
                <item.icon className="mr-3 h-5 w-5 shrink-0 text-[#607196]" />
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
                className={`flex items-center justify-center w-full px-4 py-3 text-sm font-bold text-white  transition-colors cursor-pointer ${
                  isLogin
                    ? "bg-[#607196] hover:bg-[#4a5a7a]"
                    : "bg-red-500 hover:bg-red-600"
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
