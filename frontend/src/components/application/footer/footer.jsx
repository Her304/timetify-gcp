import React from 'react';
import { Link } from 'react-router-dom';

export const Footer = ({ currentUser }) => {
  return (
    <footer className="bg-[#607196] text-white py-12 px-8 mt-12">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-start gap-8 mb-12">
          {/* Left Side: Logo and Links */}
          <div className="space-y-6">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold tracking-tight">timetify</span>
            </div>
            <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium text-white">
              {!currentUser && (
                <>
                  <Link to="/login" className="hover:text-white transition-colors">Login</Link>
                  <Link to="/register" className="hover:text-white transition-colors">Register</Link>
                </>
              )}
              <Link to="/about" className="hover:text-white transition-colors">About</Link>
              <Link to="/help" className="hover:text-white transition-colors">Help</Link>
              <Link to="/privacy" className="hover:text-white transition-colors">Privacy</Link>
              <a href="https://github.com/Her304/timetify" className="hover:text-white transition-colors">Github</a>
            </nav>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 border-t border-white flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-white">
          <p className="text-white">© {new Date().getFullYear()} timetify. All rights reserved.</p>
          <div className="flex gap-6">
            <Link to="/terms" className="text-white hover:text-white-500 transition-colors">Terms</Link>
            <Link to="/privacy" className="text-white hover:text-white-500 transition-colors">Privacy</Link>
          </div>
        </div>
      </div>
    </footer>
  );
};
