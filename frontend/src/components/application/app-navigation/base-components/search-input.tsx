import { SearchLg } from "@untitledui/icons";
import type { InputHTMLAttributes } from "react";

export const SearchInput = (props: InputHTMLAttributes<HTMLInputElement>) => {
  return (
    <div className="relative group">
      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
        <SearchLg className="h-5 w-5 text-gray-400 group-focus-within:text-gray-500" />
      </div>
      <input
        type="text"
        className="block w-full pl-10 pr-12 py-2 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500 sm:text-sm transition-all shadow-sm"
        placeholder="Search"
        {...props}
      />
      <div className="absolute inset-y-0 right-0 flex py-1.5 pr-1.5">
        <kbd className="inline-flex items-center border border-gray-200 rounded px-1.5 font-sans text-xs text-gray-400">
          ⌘K
        </kbd>
      </div>
    </div>
  );
};
