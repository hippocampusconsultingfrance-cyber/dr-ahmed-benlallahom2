import { trpc } from "@/lib/trpc";
import { useLanguage } from "@/contexts/LanguageContext";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import Breadcrumb from "@/components/Breadcrumb";
import { Calendar, ArrowRight, Tag } from "lucide-react";
import { Link } from "wouter";
import { SEOHead } from "@/components/SEOHead";

export default function BlogPage() {
  const { language } = useLanguage();
  const { data, isLoading, error } = trpc.blog.list.useQuery({
    language,
    limit: 20,
  });

  const breadcrumbItems = [
    { label: language === "fr" ? "Actualités" : language === "en" ? "News" : language === "de" ? "Nachrichten" : "新闻" },
  ];

  const title = language === "fr" ? "Actualités & Veille Médicale" 
    : language === "en" ? "News & Medical Watch" 
    : language === "de" ? "Nachrichten & Medizinische Überwachung" 
    : "新闻与医学监测";

  const subtitle = language === "fr" ? "Restez informé des dernières avancées en anesthésie-réanimation"
    : language === "en" ? "Stay informed about the latest advances in anesthesia and critical care"
    : language === "de" ? "Bleiben Sie über die neuesten Fortschritte in der Anästhesie informiert"
    : "了解麻醉与重症监护的最新进展";

  const noArticles = language === "fr" ? "Aucun article publié pour le moment."
    : language === "en" ? "No articles published yet."
    : language === "de" ? "Noch keine Artikel veröffentlicht."
    : "暂无已发布的文章。";

  const seoDescription = subtitle;

  return (
    <div className="min-h-screen bg-background">
      <SEOHead title={`${title} | Dr. Ahmed Ben Lallahom`} description={seoDescription} ogUrl="https://drahmedbenlallahom.com/blog" />
      <Navigation />
      <main className="pt-24 pb-16">
        <div className="container max-w-6xl mx-auto px-4">
          <Breadcrumb items={breadcrumbItems} />

          <div className="text-center mb-12">
            <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4">{title}</h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">{subtitle}</p>
          </div>

          {isLoading && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="bg-card border border-border rounded-xl overflow-hidden animate-pulse">
                  <div className="h-48 bg-muted" />
                  <div className="p-6 space-y-3">
                    <div className="h-4 bg-muted rounded w-1/3" />
                    <div className="h-6 bg-muted rounded w-3/4" />
                    <div className="h-4 bg-muted rounded w-full" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {error && (
            <div className="text-center py-12 text-red-400">
              Erreur de chargement : {error.message}
            </div>
          )}

          {data && data.items.length === 0 && (
            <div className="text-center py-16">
              <p className="text-muted-foreground text-lg">{noArticles}</p>
            </div>
          )}

          {data && data.items.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {data.items.map((post) => (
                <Link key={post.id} href={`/blog/${post.slug}`}>
                  <article className="bg-card border border-border rounded-xl overflow-hidden hover:border-primary/50 transition-all duration-300 hover:-translate-y-1 cursor-pointer group h-full flex flex-col">
                    {post.coverImage && (
                      <div className="h-48 overflow-hidden">
                        <img
                          src={post.coverImage}
                          alt={post.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          loading="lazy"
                        />
                      </div>
                    )}
                    {!post.coverImage && (
                      <div className="h-48 bg-gradient-to-br from-primary/10 to-cyan-500/10 flex items-center justify-center">
                        <Tag className="w-12 h-12 text-primary/40" />
                      </div>
                    )}
                    <div className="p-6 flex flex-col flex-1">
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(post.createdAt).toLocaleDateString(language === "fr" ? "fr-FR" : language === "de" ? "de-DE" : language === "zh" ? "zh-CN" : "en-US")}
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs capitalize">
                          {post.category}
                        </span>
                      </div>
                      <h2 className="text-lg font-semibold text-foreground mb-2 line-clamp-2 group-hover:text-primary transition-colors">
                        {post.title}
                      </h2>
                      {post.excerpt && (
                        <p className="text-sm text-muted-foreground line-clamp-3 flex-1">
                          {post.excerpt}
                        </p>
                      )}
                      <div className="flex items-center gap-1 text-primary text-sm font-medium mt-4">
                        {language === "fr" ? "Lire l'article" : language === "en" ? "Read article" : language === "de" ? "Artikel lesen" : "阅读文章"}
                        <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                      </div>
                    </div>
                  </article>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
