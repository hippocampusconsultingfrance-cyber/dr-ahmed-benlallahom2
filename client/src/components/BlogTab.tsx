import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Edit, Trash, Globe } from "lucide-react";
import { toast } from "sonner";
import PublicContentSkeleton from "@/components/PublicContentSkeleton";

/** Not shown in the dashboard: kept as is, like BlogPage and BlogPostPage, until the owner decides on the blog (CODE-05). */
export default function BlogTab() {
  const utils = trpc.useUtils();
  const { data: posts, isLoading, error } = trpc.admin.blog.list.useQuery();
  const [showForm, setShowForm] = useState(false);
  const [editingPost, setEditingPost] = useState<any>(null);
  const [form, setForm] = useState({ title: "", slug: "", excerpt: "", content: "", category: "anesthesie", language: "fr", source: "", coverImage: "", published: true });

  const createPost = trpc.admin.blog.create.useMutation({
    onSuccess: () => {
      toast.success("Article créé");
      utils.admin.blog.list.invalidate();
      resetForm();
    },
    onError: (e) => toast.error(e.message),
  });

  const updatePost = trpc.admin.blog.update.useMutation({
    onSuccess: () => {
      toast.success("Article mis à jour");
      utils.admin.blog.list.invalidate();
      resetForm();
    },
    onError: (e) => toast.error(e.message),
  });

  const deletePost = trpc.admin.blog.delete.useMutation({
    onSuccess: () => {
      toast.success("Article supprimé");
      utils.admin.blog.list.invalidate();
    },
  });

  const resetForm = () => {
    setShowForm(false);
    setEditingPost(null);
    setForm({ title: "", slug: "", excerpt: "", content: "", category: "anesthesie", language: "fr", source: "", coverImage: "", published: true });
  };

  const handleEdit = (post: any) => {
    setEditingPost(post);
    setForm({
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt || "",
      content: post.content,
      category: post.category,
      language: post.language || "fr",
      source: post.source || "",
      coverImage: post.coverImage || "",
      published: post.published === 1,
    });
    setShowForm(true);
  };

  const handleSubmit = () => {
    if (!form.title || !form.slug || !form.content) {
      toast.error("Titre, slug et contenu sont obligatoires");
      return;
    }
    if (editingPost) {
      updatePost.mutate({ id: editingPost.id, ...form, published: form.published ? 1 : 0 });
    } else {
      createPost.mutate({ ...form, published: form.published ? 1 : 0 });
    }
  };

  const generateSlug = (title: string) => {
    return title
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  };

  if (error) {
    return <div className="text-center py-8 text-red-400">Erreur : {error.message}</div>;
  }

  if (isLoading) {
    return <PublicContentSkeleton label="Chargement des contenus éditoriaux" />;
  }

  return (
      <div>
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">{posts?.length || 0} article(s)</p>
        <Button onClick={() => { resetForm(); setShowForm(true); }}>
          <Plus className="w-4 h-4 mr-2" />
          Nouvel article
        </Button>
      </div>

      {showForm && (
        <div className="bg-card border border-border rounded-lg p-4 sm:p-6 mb-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">
            {editingPost ? "Modifier l'article" : "Nouvel article"}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-sm text-muted-foreground block mb-1">Titre *</label>
              <input
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
                value={form.title}
                onChange={(e) => {
                  setForm({ ...form, title: e.target.value, slug: editingPost ? form.slug : generateSlug(e.target.value) });
                }}
                placeholder="Titre de l'article"
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground block mb-1">Slug *</label>
              <input
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
                placeholder="url-de-larticle"
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground block mb-1">Catégorie</label>
              <select
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                <option value="anesthesie">Anesthésie</option>
                <option value="reanimation">Réanimation</option>
                <option value="innovation">Innovation</option>
                <option value="recherche">Recherche</option>
                <option value="general">Général</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-muted-foreground block mb-1">Langue</label>
              <select
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
                value={form.language}
                onChange={(e) => setForm({ ...form, language: e.target.value })}
              >
                <option value="fr">Français</option>
                <option value="en">English</option>
                <option value="de">Deutsch</option>
                <option value="zh">中文</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-muted-foreground block mb-1">Source (URL)</label>
              <input
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
                value={form.source}
                onChange={(e) => setForm({ ...form, source: e.target.value })}
                placeholder="https://..."
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground block mb-1">Image de couverture (URL)</label>
              <input
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
                value={form.coverImage}
                onChange={(e) => setForm({ ...form, coverImage: e.target.value })}
                placeholder="https://..."
              />
            </div>
          </div>
          <div className="mb-4">
            <label className="text-sm text-muted-foreground block mb-1">Résumé</label>
            <textarea
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground h-20 resize-y"
              value={form.excerpt}
              onChange={(e) => setForm({ ...form, excerpt: e.target.value })}
              placeholder="Résumé court de l'article..."
            />
          </div>
          <div className="mb-4">
            <label className="text-sm text-muted-foreground block mb-1">Contenu * (Markdown)</label>
            <textarea
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground h-48 resize-y font-mono text-sm"
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              placeholder="Contenu de l'article en Markdown..."
            />
          </div>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={form.published}
                onChange={(e) => setForm({ ...form, published: e.target.checked })}
                className="rounded"
              />
              Publié
            </label>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button className="min-h-11 w-full sm:w-auto sm:min-h-0" variant="outline" onClick={resetForm}>Annuler</Button>
              <Button className="min-h-11 w-full sm:w-auto sm:min-h-0" onClick={handleSubmit} disabled={createPost.isPending || updatePost.isPending}>
                {editingPost ? "Mettre à jour" : "Créer"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {posts?.map((post) => (
          <div key={post.id} className="bg-card border border-border rounded-lg p-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1">
                  <span className="font-semibold text-foreground">{post.title}</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${post.published === 1 ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"}`}>
                    {post.published === 1 ? "Publié" : "Brouillon"}
                  </span>
                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-700 text-slate-200 capitalize">{post.category}</span>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Globe className="w-3 h-3" />{post.language?.toUpperCase() || "FR"}
                  </span>
                </div>
                <div className="flex gap-3 text-sm text-muted-foreground">
                  <span>/blog/{post.slug}</span>
                  <span>{new Date(post.createdAt).toLocaleDateString("fr-FR")}</span>
                </div>
                {post.excerpt && <p className="text-sm text-muted-foreground mt-1 line-clamp-1">{post.excerpt}</p>}
              </div>
              <div className="flex w-full gap-2 shrink-0 sm:w-auto">
                <Button size="sm" className="min-h-10 flex-1 sm:min-h-0 sm:flex-none" variant="outline" onClick={() => handleEdit(post)}>
                  <Edit className="w-3 h-3 mr-1" />
                  Modifier
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="min-h-10 sm:min-h-0"
                  onClick={() => {
                    if (confirm("Supprimer cet article ?")) {
                      deletePost.mutate({ id: post.id });
                    }
                  }}
                >
                  <Trash className="w-3 h-3" />
                </Button>
              </div>
            </div>
          </div>
        ))}
        {(!posts || posts.length === 0) && (
          <p className="text-center text-muted-foreground py-8">Aucun article. Cliquez sur "Nouvel article" pour commencer.</p>
        )}
      </div>
    </div>
  );
}
