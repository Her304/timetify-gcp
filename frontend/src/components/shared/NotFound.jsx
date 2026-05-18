import { Link } from 'react-router-dom';
import { Star, Blob, T, FF, MonoLabel, PillBtn } from "@/components/shared/brand";

const NotFound = () => {
  return (
    <div className="relative flex flex-col items-center justify-center min-h-[70vh] text-center px-4 overflow-hidden">
      <Star color={T.lime} size={36} style={{ position: 'absolute', top: 40, left: '20%', transform: 'rotate(-15deg)' }}/>
      <Star color={T.coral} size={28} style={{ position: 'absolute', top: 80, right: '22%', transform: 'rotate(15deg)' }}/>
      <Blob color={T.lilac} size={140} seed={1} style={{ position: 'absolute', bottom: 40, left: '15%', opacity: 0.55 }}/>
      <Blob color={T.coralLt} size={120} seed={2} style={{ position: 'absolute', top: 120, right: '12%', opacity: 0.65 }}/>

      <MonoLabel>error 404</MonoLabel>
      <h1 className="text-7xl sm:text-8xl text-ink mt-1 leading-none" style={{ fontFamily: FF.serif, letterSpacing: -3 }}>
        page&apos;s lost.
      </h1>
      <p className="text-base text-ink-60 max-w-md mt-5 leading-relaxed">
        looks like u took a wrong turn.{" "}
        <Link className="font-semibold text-coral hover:text-coral-dark" to="/register">make an account</Link>
        {" "}or{" "}
        <Link className="font-semibold text-coral hover:text-coral-dark" to="/login">sign in</Link>
        {" "}to record ur timetable.
      </p>

      <Link to="/" className="mt-7">
        <PillBtn bg={T.coral} fg="#fff" size="lg">
          ← back home
        </PillBtn>
      </Link>
    </div>
  );
};

export default NotFound;
