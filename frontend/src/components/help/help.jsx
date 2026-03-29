import React from 'react';
import {
  HelpCircle,
  Mail01,
  MessageChatCircle,
  Zap,
  Globe01
} from "@untitledui/icons";

const Help = () => {
  return (
    <div className="space-y-16 py-12">
      {/* Hero Section */}
      <section className="text-center space-y-6">
        <h1 className="text-5xl font-extrabold text-gray-900 tracking-tight">
          How can we <span className="text-[#ffc759]">Help</span>?
        </h1>
        <p className="text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed">
          Need assistance with Timetify? We're here to support you. Explore our resources or get in touch with our team.
        </p>
      </section>

      {/* Support Options */}
      <section className="grid md:grid-cols-1 gap-12 items-center bg-white p-10 rounded-3xl shadow-sm border border-gray-100">
        <div className="space-y-6">
          <div className="inline-flex items-center justify-center p-3 bg-[#607196]/10 rounded-2xl text-[#607196]">
            <HelpCircle className="w-8 h-8" />
          </div>
          <h2 className="text-3xl font-bold text-gray-900">Get in Touch</h2>
          <p className="text-lg text-gray-600 leading-relaxed">
            Whether you have a question, a feature request, or need to report a bug, we're ready to help you out.
          </p>

          <div className="space-y-4 pt-4">
            <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-2xl border border-gray-100 group hover:border-[#ffc759]/50 transition-colors">
              <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-[#607196] shadow-sm">
                <Mail01 className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Email Us</p>
                <a href="mailto:timtify.ca@gmail.com" className="text-lg font-bold text-gray-900 hover:text-[#607196] transition-colors">
                  timtify.ca@gmail.com
                </a>
              </div>
            </div>

            <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-2xl border border-gray-100 group hover:border-[#607196]/50 transition-colors">
              <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-[#607196] shadow-sm">
                <MessageChatCircle className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-400 uppercase tracking-wider">GitHub</p>
                <a href="https://github.com/Her304/timetify" target="_blank" rel="noopener noreferrer" className="text-lg font-bold text-gray-900 hover:text-[#607196] transition-colors">
                  Check our Repository
                </a>
              </div>
            </div>
          </div>
        </div>

      </section>
    </div>
  );
};

export default Help;
