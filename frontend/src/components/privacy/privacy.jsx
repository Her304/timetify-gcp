import React from 'react';
import {
  ShieldTick,
  Lock01,
  Eye,
  Settings01,
  Edit02,
  Mail01
} from "@untitledui/icons";


const Privacy = () => {
  const sections = [
    {
      icon: Eye,
      title: "Information We Collect",
      content: "We collect information you provide directly to us when you create an account, such as your name, email address, and any schedule data you upload or enter into the platform."
    },
    {
      icon: ShieldTick,
      title: "How We Use Your Information",
      content: "We use your information to provide, maintain, and improve our services, including to sync schedules with friends you have specifically authorized, and to send you technical notices and support messages."
    },
    {
      icon: Lock01,
      title: "Data Security",
      content: "We take reasonable measures to help protect information about you from loss, theft, misuse and unauthorized access, disclosure, alteration, and destruction."
    },
    {
      icon: Settings01,
      title: "Your Choices",
      content: "You may update, correct, or delete your account information at any time by logging into your account settings or emailing us. You can also control the visibility of your schedule through your profile settings."
    },
    {
      icon: Edit02,
      title: "Changes to the Policy",
      content: "We may change this Privacy Policy from time to time. If we make changes, we will notify you by revising the date at the top of the policy and, in some cases, we may provide you with additional notice."
    }
  ];

  return (
    <div className="space-y-12 py-12">
      {/* Header Section */}
      <section className="text-center space-y-4">
        <h1 className="text-5xl font-extrabold text-gray-900 tracking-tight">
          Privacy <span className="text-[#ffc759]">Policy</span>
        </h1>
        <p className="text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed">
          Your privacy is important to us. This policy explains how we collect, use, and protect your personal information.
        </p>
        <p className="text-sm text-gray-400">Last updated: {new Date().toLocaleDateString()}</p>
      </section>

      {/* Main Content */}
      <section className="grid md:grid-cols-1 gap-6">
        {sections.map((section, index) => (
          <div key={index} className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 flex flex-col md:flex-row gap-6 items-start">
            <div className="flex-shrink-0 p-3 bg-gray-50 rounded-2xl text-[#ffc759]">
              <section.icon className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-gray-900">{section.title}</h2>
              <p className="text-lg text-gray-600 leading-relaxed">
                {section.content}
              </p>
            </div>
          </div>
        ))}
      </section>

      {/* Support CTA */}
      <section className="bg-[#607196] rounded-3xl p-10 text-center space-y-6">
        <h2 className="text-2xl font-bold text-white">Still have questions?</h2>
        <p className="text-white max-w-lg mx-auto">
          Contact our privacy team if you have any concerns about how your data is handled.
        </p>
        <div className="flex justify-center pt-4">
          <a href="mailto:timtify.ca@gmail.com" className="flex items-center gap-2 px-8 py-3 bg-[#ffc759] text-black font-bold rounded-xl hover:scale-105 transition-transform">
            <Mail01 className="w-5 h-5" /> Email us your Concern
          </a>

        </div>
      </section>
    </div>
  );
};

export default Privacy;
