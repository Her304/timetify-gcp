import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Star, Blob, T, FF, MonoLabel } from "@/components/shared/brand";

const formatDate = (iso) => {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
};

const CoverPlaceholder = ({ seed = 0 }) => (
  <div className="w-full h-full grid place-items-center relative overflow-hidden" style={{ background: T.cream }}>
    <Blob color={[T.coral, T.lilac, T.lime][seed % 3]} size={90} seed={seed} style={{ opacity: 0.7 }} />
  </div>
);

const Blog = () => {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/blog/`);
        if (!res.ok) throw new Error("Failed to load posts");
        setPosts(await res.json());
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <div className="space-y-12 py-8 relative">
      <Star color={T.lime} size={32} style={{ position: 'absolute', top: 12, right: '15%', transform: 'rotate(-15deg)' }}/>
      <Star color={T.coral} size={24} style={{ position: 'absolute', top: 64, left: '10%', transform: 'rotate(20deg)' }}/>
      <Blob color={T.lilac} size={120} seed={2} style={{ position: 'absolute', top: 200, right: '6%', opacity: 0.5 }}/>

      <section className="text-center space-y-3 relative">
        <MonoLabel>blog</MonoLabel>
        <h1 className="text-6xl text-ink leading-none" style={{ fontFamily: FF.serif, letterSpacing: -1.8 }}>
          from the <span style={{ color: T.coral }}>timetify</span> team
        </h1>
        <p className="text-base text-ink-60 max-w-2xl mx-auto leading-relaxed">
          notes, tips, and updates on staying in sync with ur people.
        </p>
      </section>

      {loading && (
        <p className="text-center text-sm text-ink-60">loading posts…</p>
      )}

      {!loading && error && (
        <p className="text-center text-sm text-ink-60">couldn&apos;t load posts right now — try again in a bit.</p>
      )}

      {!loading && !error && posts.length === 0 && (
        <p className="text-center text-sm text-ink-60">no posts yet — check back soon.</p>
      )}

      {!loading && !error && posts.length > 0 && (
        <section className="grid md:grid-cols-2 gap-6 max-w-5xl mx-auto">
          {posts.map((post, i) => (
            <Link
              key={post.slug}
              to={`/blog/${post.slug}`}
              className="group bg-white rounded-3xl border border-ink-8 hover:border-coral transition-colors overflow-hidden flex flex-col"
            >
              <div className="aspect-[16/9] w-full overflow-hidden">
                {post.cover_image
                  ? <img src={post.cover_image} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  : <CoverPlaceholder seed={i} />}
              </div>
              <div className="p-7 space-y-3 flex-1 flex flex-col">
                <MonoLabel fs={10}>{formatDate(post.published_at)}</MonoLabel>
                <h2 className="text-2xl text-ink leading-tight" style={{ fontFamily: FF.serif, letterSpacing: -0.5 }}>
                  {post.title}
                </h2>
                {post.excerpt && (
                  <p className="text-sm text-ink-60 leading-relaxed flex-1">{post.excerpt}</p>
                )}
              </div>
            </Link>
          ))}
        </section>
      )}
    </div>
  );
};

export default Blog;
