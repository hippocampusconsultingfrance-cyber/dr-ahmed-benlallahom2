import { trpc } from "@/lib/trpc";
import { useLanguage } from "@/contexts/LanguageContext";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import Breadcrumb from "@/components/Breadcrumb";
import { Calendar, ExternalLink, ArrowLeft } from "lucide-react";
import { useRoute, Link } from "wouter";
import { Streamdown } from "streamdown";

export default function BlogPostPage() {
  const { language } = useLanguage();
  const [, params] = useRoute("/blog/:slug");
  const slug = params?.slug || "";

  const { data: post, isLoading, error } = trpc.blog.getBySlug.useQuery({ slug });

  const breadcrumbItems = [
    { label: language === "fr" ? "Accueil" : language === "en" ? "Home" : language === "de" ? "Startseite" : "首页", href: "/" },
    { label: language === "fr" ? "Actualités" : language === "en" ? "News" : language === "de" ? "Nachrichten" : "新闻", href: "/blog" },
    { label: post?.title || "..." },
  ];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <main className="pt-24 pb-16">
          <div className="container max-w-4xl mx-auto px-4">
            <div className="animate-pulse space-y-6">
              <div className="h-8 bg-muted rounded w-1/3" />
              <div className="h-12 bg-muted rounded w-3/4" />
              <div className="h-64 bg-muted rounded" />
              <div className="space-y-3">
                <div className="h-4 bg-muted rounded" />
                <div className="h-4 bg-muted rounded w-5/6" />
                <div className="h-4 bg-muted rounded w-4/6" />
              </div>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <main className="pt-24 pb-16">
          <div className="container max-w-4xl mx-auto px-4 text-center">
            <h1 className="text-2xl font-bold text-foreground mb-4">
              {language === "fr" ? "Article non trouvé" : "Article not found"}
            </h1>
            <Link href="/blog">
              <span className="text-primary hover:underline flex items-center gap-2 justify-center cursor-pointer">
                <ArrowLeft className="w-4 h-4" />
                {language === "fr" ? "Retour aux actualités" : "Back to news"}
              </span>
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="pt-24 pb-16">
        <div className="container max-w-4xl mx-auto px-4">
          <Breadcrumb items={breadcrumbItems} />

          {post.coverImage && (
            <div className="rounded-xl overflow-hidden mb-8 max-h-96">
              <img
                src={post.coverImage}
                alt={post.title}
                className="w-full h-full object-cover"
              />
            </div>
          )}

          <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
            <span className="flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              {new Date(post.createdAt).toLocaleDateString(language === "fr" ? "fr-FR" : language === "de" ? "de-DE" : language === "zh" ? "zh-CN" : "en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </span>
            <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs capitalize">
              {post.category}
            </span>
          </div>

          <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-6">
            {post.title}
          </h1>

          {post.source && (
            <a
              href={post.source}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-primary hover:underline mb-8"
            >
              <ExternalLink className="w-4 h-4" />
              {language === "fr" ? "Source originale" : "Original source"}
            </a>
          )}

          <article className="prose prose-invert max-w-none prose-headings:text-foreground prose-p:text-muted-foreground prose-a:text-primary prose-strong:text-foreground">
            <Streamdown>{post.content}</Streamdown>
          </article>

          <div className="mt-12 pt-8 border-t border-border">
            <Link href="/blog">
              <span className="text-primary hover:underline flex items-center gap-2 cursor-pointer">
                <ArrowLeft className="w-4 h-4" />
                {language === "fr" ? "Retour aux actualités" : language === "en" ? "Back to news" : language === "de" ? "Zurück zu Nachrichten" : "返回新闻"}
              </span>
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
