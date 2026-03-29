import React from 'react';
import { 
  Users01, 
  CheckDone01, 
  Zap, 
  LineChartUp03, 
  MessageChatCircle 
} from "@untitledui/icons";

const About = () => {
  return (
    <div className="space-y-16 py-12">
      {/* Hero Section */}
      <section className="text-center space-y-6">
        <h1 className="text-5xl font-extrabold text-gray-900 tracking-tight">
          About <span className="text-[#ffc759]">Timetify</span>
        </h1>
        <p className="text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed">
          The ultimate social scheduling platform designed to keep you and your friends in sync, effortlessly.
        </p>
      </section>

      {/* Mission Section */}
      <section className="grid md:grid-cols-2 gap-12 items-center bg-white p-10 rounded-3xl shadow-sm border border-gray-100">
        <div className="space-y-6">
          <div className="inline-flex items-center justify-center p-3 bg-[#ffc759]/10 rounded-2xl text-[#ffc759]">
            <Users01 className="w-8 h-8" />
          </div>
          <h2 className="text-3xl font-bold text-gray-900">Our Mission</h2>
          <p className="text-lg text-gray-600 leading-relaxed">
            At Timetify, we believe that staying connected shouldn't be a chore. Our mission is to bridge the gap between individual productivity and social connection by providing a seamless way to share schedules, discover mutual free time, and plan together.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="p-6 bg-gray-50 rounded-2xl space-y-2">
            <h3 className="text-4xl font-black text-[#ffc759]">10k+</h3>
            <p className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Active Users</p>
          </div>
          <div className="p-6 bg-gray-50 rounded-2xl space-y-2">
            <h3 className="text-4xl font-black text-[#ffc759]">50k+</h3>
            <p className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Schedules Synced</p>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="space-y-12">
        <div className="text-center space-y-4">
          <h2 className="text-3xl font-bold text-gray-900">Why Choose Timetify?</h2>
          <p className="text-gray-600 max-w-xl mx-auto">
            Powerful tools designed to simplify your life and enhance your social connections.
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-8">
          {[
            {
              icon: Zap,
              title: "AI-Powered Extraction",
              description: "Upload your syllabus and let our AI handle the scheduling for you."
            },
            {
              icon: CheckDone01,
              title: "Real-time Sync",
              description: "Instantly see when your friends are free or busy throughout the day."
            },
            {
              icon: LineChartUp03,
              title: "Smart Insights",
              description: "Get analytics on your week and identify peak productivity windows."
            }
          ].map((feature, i) => (
            <div key={i} className="p-8 bg-white rounded-3xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow space-y-4 group">
              <div className="w-12 h-12 bg-gray-50 rounded-xl flex items-center justify-center text-gray-400 group-hover:bg-[#ffc759]/10 group-hover:text-[#ffc759] transition-colors">
                <feature.icon className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-gray-900">{feature.title}</h3>
              <p className="text-gray-600 leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Contact/CTA Section */}
      <section className="relative overflow-hidden bg-gray-900 rounded-3xl p-12 text-center space-y-8">
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#ffc759] opacity-10 blur-3xl rounded-full -translate-y-1/2 translate-x-1/2"></div>
        <div className="relative z-10 space-y-4 text-white">
          <h2 className="text-3xl font-bold">Have Questions?</h2>
          <p className="text-gray-400 max-w-lg mx-auto">
            Our support team is always here to help you get the most out of Timetify.
          </p>
          <div className="flex justify-center gap-4 pt-4">
            <a href="mailto:support@timetify.com" className="px-8 py-3 bg-[#ffc759] text-black font-bold rounded-xl hover:scale-105 transition-transform">
              Contact Us
            </a>
            <a href="https://github.com/Her304/timetify" className="px-8 py-3 bg-white/10 text-white font-bold rounded-xl hover:bg-white/20 transition-colors flex items-center gap-2">
              <MessageChatCircle className="w-5 h-5" /> View on GitHub
            </a>
          </div>
        </div>
      </section>
    </div>
  );
};

export default About;
