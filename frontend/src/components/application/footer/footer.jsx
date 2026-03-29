import React from 'react';

export const Footer = () => {
  return (
    <footer className="bg-[#ffc759] text-black py-12 px-8 mt-12">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-start gap-8 mb-12">
          {/* Left Side: Logo and Links */}
          <div className="space-y-6">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold tracking-tight">timetify</span>
            </div>
            <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium text-black">
              <a href="/login" className="hover:text-white transition-colors">Login</a>
              <a href="/register" className="hover:text-white transition-colors">Register</a>
              <a href="/about" className="hover:text-white transition-colors">About</a>
              <a href="https://github.com/Her304/timetify" className="hover:text-white transition-colors">Github</a>
              <a href="/help" className="hover:text-white transition-colors">Help</a>
              <a href="/privacy" className="hover:text-white transition-colors">Privacy</a>
            </nav>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 border-t border-blue-400/30 flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-blue-100/80">
          <p>© {new Date().getFullYear()} timetify. All rights reserved.</p>
          <div className="flex gap-6">
            <a href="#" className="hover:text-white transition-colors">Terms</a>
            <a href="#" className="hover:text-white transition-colors">Privacy</a>
          </div>
        </div>
      </div>
    </footer>
  );
};
