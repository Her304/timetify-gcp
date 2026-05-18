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
    <div className="fixed bottom-6 right-6 z-50 flex items-start gap-3 bg-white border border-ink-8 shadow-lg px-4 py-3 max-w-sm rounded-2xl">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-ink">we hit a snag</p>
        <p className="text-sm text-ink-60 mt-0.5 leading-snug">
          our team has been notified and is working on a fix. need help?{' '}
          <a href="mailto:help@timetify.net" className="text-coral hover:text-coral-dark font-medium">
            help@timetify.net
          </a>
        </p>
      </div>
      <button onClick={onClose} className="shrink-0 p-0.5 text-ink-40 hover:text-ink transition-colors">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

export default ErrorToast;
