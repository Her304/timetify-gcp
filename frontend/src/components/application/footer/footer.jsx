import { Link } from 'react-router-dom';
import { AppMark, T, FF } from "@/components/shared/brand";

export const Footer = ({ currentUser }) => {
  return (
    <footer style={{ background: T.ink, color: T.cream }} className="py-12 px-8 mt-12">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-start gap-8 mb-10">
          <div className="space-y-5">
            <div className="flex items-center gap-2.5">
              <AppMark size={32}/>
              <span className="text-2xl" style={{ fontFamily: FF.serif, letterSpacing: -0.6 }}>timetify</span>
            </div>
            <nav className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
              {!currentUser && (
                <>
                  <Link to="/login" className="hover:text-coral transition-colors lowercase">login</Link>
                  <Link to="/register" className="hover:text-coral transition-colors lowercase">register</Link>
                </>
              )}
              <Link to="/about" className="hover:text-coral transition-colors lowercase">about</Link>
              <Link to="/help" className="hover:text-coral transition-colors lowercase">help</Link>
              <Link to="/privacy" className="hover:text-coral transition-colors lowercase">privacy</Link>
              <a href="https://github.com/Her304/timetify" className="hover:text-coral transition-colors lowercase">github</a>
            </nav>
          </div>
        </div>

        <div className="pt-6 flex flex-col md:flex-row justify-between items-center gap-4 text-xs" style={{ borderTop: '1px solid rgba(248,244,237,.15)', fontFamily: FF.mono, color: 'rgba(248,244,237,.6)' }}>
          <p>© {new Date().getFullYear()} timetify · all rights reserved</p>
          <div className="flex gap-5">
            <Link to="/terms" className="hover:text-coral transition-colors">terms</Link>
            <Link to="/privacy" className="hover:text-coral transition-colors">privacy</Link>
          </div>
        </div>
      </div>
    </footer>
  );
};
