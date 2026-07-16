import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Star, Blob, T, FF, MonoLabel, PillBtn } from "@/components/shared/brand";

const formatDate = (iso) => {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
};

const BlogPost = () => {
  const { slug } = useParams();
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    setLoading(true);
    setNotFound(false);
    const load = async () => {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/blog/${slug}/`);
        if (res.status === 404) { setNotFound(true); return; }
        if (!res.ok) throw new Error("Failed to load post");
        setPost(await res.json());
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [slug]);

  if (loading) {
    return <p className="text-center text-sm text-ink-60 py-16">loading…</p>;
  }

  if (notFound || !post) {
    return (
      <div className="text-center py-16 space-y-4">
        <MonoLabel>not found</MonoLabel>
        <h1 className="text-4xl text-ink" style={{ fontFamily: FF.serif, letterSpacing: -1 }}>
          this post doesn&apos;t exist.
        </h1>
        <Link to="/blog">
          <PillBtn bg={T.coral} fg="#fff">← back to blog</PillBtn>
        </Link>
      </div>
    );
  }

  const paragraphs = (post.content || "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

  return (
    <article className="max-w-3xl mx-auto py-8 space-y-8 relative">
      <Star color={T.lime} size={24} style={{ position: 'absolute', top: 0, right: '4%', transform: 'rotate(-15deg)' }}/>

      <Link to="/blog" className="inline-block">
        <MonoLabel color={T.coral}>← back to blog</MonoLabel>
      </Link>

      {post.cover_image && (
        <div className="rounded-3xl overflow-hidden aspect-[16/7]">
          <img src={post.cover_image} alt="" className="w-full h-full object-cover" />
        </div>
      )}

      {!post.cover_image && (
        <div className="rounded-3xl overflow-hidden aspect-[16/7] grid place-items-center relative" style={{ background: T.cream }}>
          <Blob color={T.lilac} size={140} seed={1} style={{ opacity: 0.6 }} />
        </div>
      )}

      <header className="space-y-3">
        <MonoLabel>{formatDate(post.published_at)}{post.author_username ? ` · ${post.author_username}` : ''}</MonoLabel>
        <h1 className="text-5xl text-ink leading-tight" style={{ fontFamily: FF.serif, letterSpacing: -1.5 }}>
          {post.title}
        </h1>
      </header>

      <div className="space-y-5 text-base text-ink-60 leading-relaxed">
        {paragraphs.map((p, i) => <p key={i}>{p}</p>)}
      </div>
    </article>
  );
};

export default BlogPost;
