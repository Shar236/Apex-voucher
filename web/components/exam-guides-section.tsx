import Link from 'next/link';
import Image from 'next/image';
import { Clock, ArrowRight, Calendar, BookOpen } from 'lucide-react';
import { SectionHeading } from '@/components/ui';
import type { BlogPost } from '@/lib/blog-types';

const fmtDate = (d?: string) => (d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '');

/** Students Diary & Exam Guides — homepage teaser for the latest published blog posts, linking to each article's real /blog/[slug] URL. */
export function ExamGuidesSection({ posts }: { posts: BlogPost[] }) {
  const featured = posts.find((p) => p.featured);
  const gridPosts = featured ? posts.filter((p) => p._id !== featured._id) : posts;

  return (
    <section className="py-16 sm:py-24 bg-surface border-b border-line transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading eyebrow="Students Diary & Guides" title="Students Diary & Exam Guides" subtitle="Guides on PTE, GRE, TOEFL, IELTS, admissions, and education loans written specifically for Indian students." />
        <div className="flex justify-center -mt-4 mb-12">
          <Link href="/blog" className="inline-flex items-center gap-1.5 px-4 h-10 rounded-full bg-surface text-accent font-medium text-xs border border-accent/45 hover:bg-accent/6 transition-colors">
            <BookOpen className="w-3.5 h-3.5" /> View All Articles <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {posts.length === 0 ? (
          <div className="py-12 text-center space-y-2">
            <p className="font-heading font-medium text-lg text-ink">New guides coming soon!</p>
            <p className="text-sm font-normal text-ink-muted">Our editorial team is preparing fresh exam guides for you.</p>
          </div>
        ) : (
          <>
            {featured && (
              <Link href={`/blog/${featured.slug}`} className="group relative grid md:grid-cols-2 rounded-3xl overflow-hidden border border-line bg-[#0B0D12] shadow-sm hover:shadow-xl transition-all duration-300 mb-10">
                <div className="relative aspect-video md:aspect-auto md:min-h-72 overflow-hidden">
                  {featured.coverImage ? (
                    <Image src={featured.coverImage} alt={featured.coverImageAlt || featured.title} fill sizes="(max-width: 768px) 100vw, 600px" loading="lazy" className="object-cover transition-transform duration-500 group-hover:scale-105" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-neutral-600 bg-[#0B0D12]">No image</div>
                  )}
                  {/* <div className="absolute inset-0 bg-linear-to-t md:bg-linear-to-r from-[#0B0D12] via-[#0B0D12]/40 to-transparent" /> */}
                  <span className="absolute top-4 left-4 px-3 py-1 rounded-lg bg-accent text-white text-[11px] font-medium uppercase tracking-wider shadow-md">{featured.category}</span>
                </div>
                <div className="flex flex-col justify-center p-6 sm:p-10 space-y-3.5 bg-[#0B0D12] text-white">
                  <div className="flex items-center gap-3 text-[11px] font-normal text-neutral-400">
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-accent" /> {fmtDate(featured.publishedAt)}
                    </span>
                    {featured.readingTime ? (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-accent" /> {featured.readingTime} min read
                      </span>
                    ) : null}
                  </div>
                  <h3 className="font-heading font-medium text-2xl sm:text-3xl leading-snug">{featured.title}</h3>
                  <p className="text-neutral-300 text-sm font-normal leading-relaxed line-clamp-3">{featured.excerpt}</p>
                  <span className="inline-flex items-center gap-2 text-accent font-medium text-sm pt-1 group-hover:gap-3 transition-all">
                    Read Article <ArrowRight className="w-4 h-4" strokeWidth={2.5} />
                  </span>
                </div>
              </Link>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
              {gridPosts.map((post) => (
                <Link key={post._id || post.slug} href={`/blog/${post.slug}`} className="group flex flex-col rounded-3xl bg-surface border border-line hover:border-accent/40 overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
                  <div className="relative aspect-video bg-surface-sunken overflow-hidden">
                    {post.coverImage ? (
                      <Image src={post.coverImage} alt={post.coverImageAlt || post.title} fill sizes="(max-width: 768px) 100vw, 380px" loading="lazy" className="object-cover transition-transform duration-500 group-hover:scale-105" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-ink-muted text-xs font-normal">No image</div>
                    )}
                    <span className="absolute top-3 left-3 px-2.5 py-1 rounded-lg bg-accent text-white text-[10px] font-medium uppercase tracking-wider shadow-md">{post.category}</span>
                  </div>
                  <div className="flex flex-col flex-1 p-5 space-y-2.5">
                    <h4 className="font-heading font-medium text-base leading-snug text-ink line-clamp-2 group-hover:text-accent transition-colors">{post.title}</h4>
                    <p className="text-xs font-normal text-ink-muted line-clamp-2 flex-1">{post.excerpt}</p>
                    <div className="flex items-center justify-between pt-2.5 border-t border-line">
                      <div className="flex items-center gap-3 text-[10px] font-normal text-ink-muted">
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="w-3 h-3" /> {fmtDate(post.publishedAt)}
                        </span>
                        {post.readingTime ? (
                          <span className="inline-flex items-center gap-1">
                            <Clock className="w-3 h-3" /> {post.readingTime} min
                          </span>
                        ) : null}
                      </div>
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-accent group-hover:gap-1.5 transition-all">
                        Read <ArrowRight className="w-3 h-3" />
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
