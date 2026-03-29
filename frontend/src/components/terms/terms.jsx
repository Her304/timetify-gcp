import React from 'react';
import {
  ShieldTick,
  File02,
  User01,
  AlertCircle,
  Settings01,
  Mail01
} from "@untitledui/icons";

const Terms = () => {
  const sections = [
    {
      icon: User01,
      title: "Account Terms",
      content: "You are responsible for maintaining the security of your account and password. Each account is for individual use only and should not be shared."
    },
    {
      icon: File02,
      title: "Content & Conduct",
      content: "You retain all rights to the schedule data you upload. However, by using our services, you grant us a license to host and sync this content as per your privacy settings. You may not use Timetify for any illegal or unauthorized purpose."
    },

    {
      icon: AlertCircle,
      title: "Limitation of Liability",
      content: "Timetify is provided 'as is' without warranties of any kind. We are not liable for any damages resulting from your use of the service or any interruptions in availability."
    },
    {
      icon: Settings01,
      title: "Modifications to Terms",
      content: "We reserve the right to modify these terms at any time. Significant changes will be communicated via email or through a prominent notice on the platform."
    }
  ];

  return (
    <div className="space-y-12 py-12">
      {/* Header Section */}
      <section className="text-center space-y-4">
        <h1 className="text-5xl font-extrabold text-gray-900 tracking-tight">
          Terms of <span className="text-[#ffc759]">Service</span>
        </h1>
        <p className="text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed">
          Please read these terms carefully before using our platform. Your access and use of Timetify is conditioned on your acceptance of these terms.
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
        <h2 className="text-2xl font-bold text-white">Questions about our Terms?</h2>
        <p className="text-white max-w-lg mx-auto">
          If you have any questions regarding our Terms of Service, please reach out to our legal team.
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

export default Terms;
