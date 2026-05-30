import Link from "next/link";

const posts = [
  {
    title: "How to Digitize Your Kirana Store in 5 Simple Steps",
    excerpt: "Transform your traditional shop into a smart store with billing, inventory, and udhar management — all from your phone.",
    date: "May 15, 2026",
    slug: "digitize-kirana-store",
  },
  {
    title: "Top 10 Features Every Kirana Shop Management App Should Have",
    excerpt: "From smart billing to AI insights, discover the must-have features that can save you time and grow your business.",
    date: "April 28, 2026",
    slug: "top-features-kirana-app",
  },
  {
    title: "Understanding Udhar Book: Digital Credit Management for Shop Owners",
    excerpt: "Learn how digital udhar management can reduce losses, track customer credit, and improve cash flow for your shop.",
    date: "April 10, 2026",
    slug: "udhar-book-digital-credit",
  },
  {
    title: "Why Your Shop Needs AI-Powered Inventory Management",
    excerpt: "AI can predict demand, reduce waste, and optimize stock levels. See how small shops are benefiting from smart inventory.",
    date: "March 22, 2026",
    slug: "ai-inventory-management",
  },
  {
    title: "The Future of Kirana Stores in India: 2026 & Beyond",
    excerpt: "Explore how technology is reshaping India's 12+ million Kirana stores and what it means for shop owners.",
    date: "March 5, 2026",
    slug: "future-of-kirana-stores",
  },
];

export default function BlogPage() {
  return (
    <div className="min-h-screen pt-24 pb-20">
      <div className="max-w-4xl mx-auto px-4">
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            <span className="bg-gradient-to-r from-indigo-400 via-cyan-400 to-emerald-400 bg-clip-text text-transparent">
              Blog
            </span>
          </h1>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto">
            Tips, guides, and insights for Kirana shop owners to grow their business with smart technology.
          </p>
        </div>

        <div className="space-y-6">
          {posts.map((post) => (
            <article key={post.slug} className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6 hover:border-indigo-500/30 transition group">
              <Link href={`/blog/${post.slug}`}>
                <p className="text-xs text-slate-500 mb-2">{post.date}</p>
                <h2 className="text-xl font-semibold text-slate-100 group-hover:text-indigo-400 transition mb-2">{post.title}</h2>
                <p className="text-slate-400 text-sm leading-relaxed">{post.excerpt}</p>
                <span className="inline-block mt-3 text-xs text-indigo-400 font-medium group-hover:underline">Read More</span>
              </Link>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
