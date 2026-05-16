import { useEffect } from 'react';
import { X } from '@untitledui/icons';

const ErrorToast = ({ isOpen, onClose }) => {
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(onClose, 8000);
    return () => clearTimeout(timer);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-start gap-3 bg-white border border-gray-200 shadow-lg px-4 py-3 max-w-sm animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800">We hit a snag</p>
        <p className="text-sm text-gray-500 mt-0.5 leading-snug">
          Our team has been notified and is working on a fix. Need help in the meantime?{' '}
          <a href="mailto:help@timetify.net" className="text-[#607196] hover:underline font-medium">
            help@timetify.net
          </a>
        </p>
      </div>
      <button onClick={onClose} className="shrink-0 p-0.5 text-gray-400 hover:text-gray-600 transition-colors">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

export default ErrorToast;
