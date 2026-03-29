import { Link } from 'react-router-dom';
import { HomeLine, AlertCircle } from '@untitledui/icons';

const NotFound = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="relative mb-6">
        <div className="absolute inset-0 bg-blue-100 rounded-full blur-2xl opacity-50 scale-150"></div>
        <div className="relative p-4 bg-white rounded-2xl shadow-xl border border-gray-100">
          <AlertCircle className="w-16 h-16 text-[#607196]" />
        </div>
      </div>

      <h1 className="text-8xl font-black text-gray-900 mb-2 tracking-tighter">
        404
      </h1>

      <h2 className="text-2xl font-bold text-gray-800 mb-4">
        Oops! Page not found
      </h2>

      <p className="text-gray-600 max-w-md mb-8 leading-relaxed">
        The page you are looking for seems to be Time-out,
        lets <a className="text-[#ff7b9c] hover:underline" href="/register">create new account</a> or <a className="text-[#ff7b9c] hover:underline" href="/login">login</a> to record your Timetable!
      </p>

      <Link
        to="/"
        className="flex items-center gap-2 px-6 py-3 bg-[#607196] text-white font-semibold rounded-xl hover:bg-[#607196]/80 transition-all shadow-md hover:shadow-lg active:scale-95 group"
      >
        <HomeLine className="w-5 h-5 group-hover:-translate-y-0.5 transition-transform" />
        Back to Home
      </Link>
    </div>
  );
};

export default NotFound;
