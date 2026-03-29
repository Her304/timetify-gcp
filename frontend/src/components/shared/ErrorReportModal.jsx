import { useState } from 'react';
import { getLogs } from '../../utils/logger';
import { X, Send01, AlertCircle } from '@untitledui/icons';

const ErrorReportModal = ({ isOpen, onClose, currentUser, authenticatedFetch }) => {
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState(null); // 'success' | 'error'

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setStatus(null);

    const frontendLogs = getLogs();

    try {
      const response = await authenticatedFetch('http://127.0.0.1:8000/api/report-error/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description,
          frontend_logs: frontendLogs,
        }),
      });

      if (response.ok) {
        setStatus('success');
        setDescription('');
        setTimeout(() => {
          onClose();
          setStatus(null);
        }, 2000);
      } else {
        setStatus('error');
      }
    } catch (err) {
      console.error('Failed to submit error report:', err);
      setStatus('error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-blue-600" />
            Report an Error
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-200 transition-colors text-gray-500"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
                Describe what happened
            </label>
            <textarea
              className="w-full h-32 p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all resize-none"
              placeholder="E.g. I tried to add a course but the page froze..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </div>

          <div className="p-4 bg-blue-50 rounded-xl border border-blue-100 flex gap-3">
            <div className="p-2 bg-blue-100 rounded-lg shrink-0 h-fit">
              <AlertCircle className="w-5 h-5 text-blue-600" />
            </div>
            <div className="text-sm text-blue-800 leading-relaxed">
              To help us fix the issue, this report will automatically include your 
              <strong> user ID ({currentUser?.id})</strong>, 
              <strong> username ({currentUser?.username})</strong>, 
              and <strong>application logs</strong> (recent console and server activity).
            </div>
          </div>

          {status === 'success' && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm font-medium flex items-center gap-2">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
              Report submitted successfully! Thank you.
            </div>
          )}

          {status === 'error' && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm font-medium">
              Failed to submit report. Please try again or contact support.
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-white border border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || status === 'success'}
              className="flex-1 px-4 py-2 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
              ) : (
                <>
                  <Send01 className="w-4 h-4" />
                  Submit Report
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ErrorReportModal;
