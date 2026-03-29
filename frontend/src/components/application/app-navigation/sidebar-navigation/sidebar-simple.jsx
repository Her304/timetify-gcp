import { useState } from "react";
import { useLocation } from "react-router-dom";
import { ChevronRight } from "@untitledui/icons";

export const SidebarNavigationSimple = ({ items, secondaryItems, LogOut }) => {
  const location = useLocation();
  const [openItems, setOpenItems] = useState({
    Projects: true,
  });

  const isItemActive = (item) => {
    const currentPath = location.pathname;
    const currentHash = location.hash;
    const currentFull = currentPath + currentHash;

    if (currentFull === item.href) return true;
    if (currentPath === item.href && item.href.indexOf('#') === -1) return true;

    if (!item.items) return false;
    for (const subItem of item.items) {
      if (currentFull === subItem.href) return true;
      if (currentPath === subItem.href && subItem.href.indexOf('#') === -1) return true;
    }
    return false;
  };

  const toggleItem = (item) => {
    if (isItemActive(item)) return;
    setOpenItems((prev) => ({ ...prev, [item.label]: !prev[item.label] }));
  };

  return (
    <div className="flex flex-col h-full bg-white border-r border-gray-200 w-72 p-0 overflow-hidden font-sans">
      <div className="p-6 pb-2">
        <div className="w-20 h-9 rounded-lg flex items-center justify-center">
          <h2 className="text-xl text-[#607196] font-semibold">Timetify</h2>
        </div>
      </div>

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
                    if (hasChildren) {
                      toggleItem(item);
                    }
                  }}
                  className={`flex items-center w-full px-3 py-2 text-sm font-medium rounded-md transition-colors group ${isExpanded ? "text-gray-900" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                    } ${isForcedOpen ? "bg-gray-50/50" : ""}`}
                >
                  {item.icon && (
                    <item.icon className={`mr-3 h-6 w-6 shrink-0 ${isExpanded ? "text-gray-500" : "text-gray-400 group-hover:text-gray-500"
                      }`} />
                  )}
                  <span className="flex-1 text-left font-semibold">{item.label}</span>
                  {item.badge && (
                    <span className="ml-auto inline-block py-0.5 px-2.5 text-xs font-semibold bg-gray-100 text-gray-600 border border-gray-200 rounded-full shadow-sm">
                      {item.badge}
                    </span>
                  )}
                  {hasChildren && (
                    <div className="ml-2 text-gray-400">
                      <ChevronRight className={`h-4 w-4 stroke-[2.5px] transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`} />
                    </div>
                  )}
                </a>

                <div className={`grid transition-all duration-300 ease-in-out ${isExpanded ? "grid-rows-[1fr] opacity-100 mt-1" : "grid-rows-[0fr] opacity-0"}`}>
                  <div className="overflow-hidden">
                    <div className="space-y-1 ml-9 border-l border-gray-100 pl-2 pb-1">
                      {item.items && item.items.map((subItem, subIndex) => {
                        const isSubActive = (location.pathname + location.hash) === subItem.href || (location.pathname === subItem.href && subItem.href.indexOf('#') === -1);
                        return (
                          <a
                            key={subIndex}
                            href={subItem.href}
                            className={`block px-3 py-2 text-sm font-medium rounded-md transition-colors ${isSubActive
                              ? "bg-gray-50 text-gray-900 font-semibold"
                              : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
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

      {secondaryItems && secondaryItems.length > 0 && (
        <div className="px-4 py-4 border-gray-100 mt-auto">
          <nav className="space-y-3">
            {secondaryItems.map((item, index) => (
              <a
                key={index}
                href={item.href}
                className="flex items-center w-full px-3 py-2 text-sm font-medium text-gray-600 rounded-md bg-gray-100 hover:bg-gray-200 hover:text-gray-900 transition-colors group"
              >
                {item.icon && (
                  <item.icon className="mr-3 h-6 w-6 shrink-0 text-gray-400 group-hover:text-gray-500" />
                )}
                <span className="flex-1 text-left font-semibold">{item.label}</span>
              </a>
            ))}
          </nav>
        </div>
      )}

      {LogOut && LogOut.length > 0 && (
        <div className="px-4 py-4 border-gray-100 mt-auto">
          <nav className="space-y-3">
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
                  className={`flex items-center w-full px-3 py-2 text-sm font-medium text-white rounded-md transition-colors group cursor-pointer ${isLogin
                      ? "bg-blue-600 hover:bg-blue-700"
                      : "bg-red-600 hover:bg-red-700"
                    }`}
                >
                  <span className="flex-1 text-center font-semibold">{item.label}</span>
                </a>
              );
            })}
            <br />
          </nav>
        </div>
      )}
    </div>
  );
};
