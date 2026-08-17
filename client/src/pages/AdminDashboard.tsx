import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { startLogin } from "@/const";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar, MessageSquare, Shield, DollarSign, Eye, CheckCircle, XCircle, Clock, ArrowLeft, Star, Trash2, FileText, CalendarDays, Plus, Edit, Trash, Globe, UserRound, BriefcaseBusiness } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import RecruitmentTab from "@/components/RecruitmentTab";
import EmployerBriefsTab from "@/components/EmployerBriefsTab";

type Tab = "overview" | "appointments" | "contacts" | "gdpr" | "testimonials" | "blog" | "availability" | "recruitment" | "employerBriefs";

export default function AdminDashboard() {
  const { user, loading, refresh } = useAuth();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Chargement...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold text-foreground mb-4">Connexion administrateur requise</h1>
          <p className="text-muted-foreground mb-6">Connectez-vous avec le compte propriétaire pour accéder aux candidatures et aux missions.</p>
          <Button onClick={startLogin}>
            Se connecter
          </Button>
        </div>
      </div>
    );
  }

  if (user.role !== "admin") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold text-foreground mb-4">Accès refusé</h1>
          <p className="text-muted-foreground mb-6">Votre session ne possède pas les permissions nécessaires. Si votre rôle vient d’être mis à jour, actualisez l’accès ou reconnectez-vous.</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button variant="outline" onClick={() => void refresh()}>
              Actualiser l’accès
            </Button>
            <Button onClick={startLogin}>Se reconnecter</Button>
            <Button variant="ghost" onClick={() => setLocation("/")}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Accueil
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: "overview" as Tab, label: "Vue d'ensemble", icon: DollarSign },
    { id: "appointments" as Tab, label: "Réservations", icon: Calendar },
    { id: "contacts" as Tab, label: "Messages", icon: MessageSquare },
    { id: "gdpr" as Tab, label: "RGPD", icon: Shield },
    { id: "testimonials" as Tab, label: "Témoignages", icon: Star },
    { id: "blog" as Tab, label: "Blog", icon: FileText },
    { id: "availability" as Tab, label: "Disponibilités", icon: CalendarDays },
    { id: "recruitment" as Tab, label: "Candidatures", icon: UserRound },
    { id: "employerBriefs" as Tab, label: "Missions", icon: BriefcaseBusiness },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => setLocation("/")}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Site
            </Button>
            <h1 className="text-xl font-bold text-foreground">Administration</h1>
          </div>
          <span className="text-sm text-muted-foreground">{user.name}</span>
        </div>
      </header>

      {/* Tabs */}
      <nav className="border-b border-border bg-card/30">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex gap-1 overflow-x-auto">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    activeTab === tab.id
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {activeTab === "overview" && <OverviewTab />}
        {activeTab === "appointments" && <AppointmentsTab />}
        {activeTab === "contacts" && <ContactsTab />}
        {activeTab === "gdpr" && <GdprTab />}
        {activeTab === "testimonials" && <TestimonialsTab />}
        {activeTab === "blog" && <BlogTab />}
        {activeTab === "availability" && <AvailabilityTab />}
        {activeTab === "recruitment" && <RecruitmentTab />}
        {activeTab === "employerBriefs" && <EmployerBriefsTab />}
      </main>
    </div>
  );
}

function OverviewTab() {
  const { data: stats, isLoading, error } = trpc.admin.stats.useQuery();

  if (error) {
    return <div className="text-center py-8 text-red-400">Erreur de chargement : {error.message}</div>;
  }

  if (isLoading) {
    return <div className="grid grid-cols-1 md:grid-cols-4 gap-6">{[1, 2, 3, 4].map(i => <div key={i} className="h-32 bg-card rounded-lg animate-pulse" />)}</div>;
  }

  const cards = [
    { label: "Réservations", value: stats?.appointments || 0, icon: Calendar, color: "text-cyan-400" },
    { label: "Messages", value: stats?.contacts || 0, icon: MessageSquare, color: "text-green-400" },
    { label: "Demandes RGPD", value: stats?.gdpr || 0, icon: Shield, color: "text-yellow-400" },
    { label: "Revenus", value: `${stats?.revenue || 0}€`, icon: DollarSign, color: "text-emerald-400" },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div key={card.label} className="bg-card border border-border rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <Icon className={`w-6 h-6 ${card.color}`} />
            </div>
            <p className="text-3xl font-bold text-foreground">{card.value}</p>
            <p className="text-sm text-muted-foreground mt-1">{card.label}</p>
          </div>
        );
      })}
    </div>
  );
}

function AppointmentsTab() {
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const utils = trpc.useUtils();
  const { data, isLoading, error } = trpc.admin.appointments.list.useQuery({
    status: statusFilter as any,
  });
  const updateStatus = trpc.admin.appointments.updateStatus.useMutation({
    onSuccess: () => {
      toast.success("Statut mis à jour");
      utils.admin.appointments.list.invalidate();
      utils.admin.stats.invalidate();
    },
  });
  const refundAppointment = trpc.admin.appointments.refund.useMutation({
    onSuccess: ({ refundAmount }) => {
      toast.success(`Remboursement confirmé : ${refundAmount} €`);
      utils.admin.appointments.list.invalidate();
      utils.admin.stats.invalidate();
    },
    onError: (mutationError) => {
      toast.error(mutationError.message);
    },
  });

  if (error) {
    return <div className="text-center py-8 text-red-400">Erreur de chargement : {error.message}</div>;
  }

  const statusColors: Record<string, string> = {
    pending: "bg-yellow-500/20 text-yellow-400",
    completed: "bg-green-500/20 text-green-400",
    failed: "bg-red-500/20 text-red-400",
    refunded: "bg-purple-500/20 text-purple-400",
  };

  const appointmentStatusColors: Record<string, string> = {
    confirmed: "bg-blue-500/20 text-blue-400",
    cancelled: "bg-red-500/20 text-red-400",
    completed: "bg-green-500/20 text-green-400",
    no_show: "bg-gray-500/20 text-gray-400",
  };

  if (isLoading) {
    return <div className="space-y-4">{[1, 2, 3].map(i => <div key={i} className="h-20 bg-card rounded-lg animate-pulse" />)}</div>;
  }

  return (
    <div>
      {/* Filters */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {[undefined, "pending", "completed", "failed", "refunded"].map((s) => (
          <button
            key={s || "all"}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              statusFilter === s ? "bg-primary text-primary-foreground" : "bg-card border border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {s === undefined ? "Tous" : s === "pending" ? "En attente" : s === "completed" ? "Payé" : s === "failed" ? "Échoué" : "Remboursé"}
          </button>
        ))}
      </div>

      <p className="text-sm text-muted-foreground mb-4">{data?.total || 0} réservation(s)</p>

      {/* Table */}
      <div className="space-y-3">
        {data?.items.map((apt) => (
          <div key={apt.id} className="bg-card border border-border rounded-lg p-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1">
                  <span className="font-semibold text-foreground">{apt.customerName}</span>
                  <span className="text-xs text-muted-foreground font-mono">{apt.trackingId}</span>
                </div>
                <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                  <span>{apt.customerEmail}</span>
                  <span>{apt.customerPhone}</span>
                  <span>{new Date(apt.appointmentDate).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}</span>
                  <span className="font-semibold text-foreground">{apt.finalPrice}€</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-2 py-1 rounded text-xs font-medium ${statusColors[apt.paymentStatus] || ""}`}>
                  {apt.paymentStatus}
                </span>
                <span className={`px-2 py-1 rounded text-xs font-medium ${appointmentStatusColors[apt.appointmentStatus] || ""}`}>
                  {apt.appointmentStatus}
                </span>
                {apt.appointmentStatus === "confirmed" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => updateStatus.mutate({ trackingId: apt.trackingId, appointmentStatus: "completed" })}
                  >
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Terminer
                  </Button>
                )}
                {apt.paymentStatus === "completed" && apt.appointmentStatus === "confirmed" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={refundAppointment.isPending}
                    onClick={() => {
                      if (!window.confirm(`Confirmer le remboursement de ${apt.finalPrice} € pour ${apt.trackingId} ?`)) return;
                      refundAppointment.mutate({
                        trackingId: apt.trackingId,
                        reason: "Remboursement demandé par l’administration",
                      });
                    }}
                  >
                    <DollarSign className="w-3 h-3 mr-1" />
                    Rembourser
                  </Button>
                )}
              </div>
            </div>
            {apt.requestDetails && (
              <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{apt.requestDetails}</p>
            )}
          </div>
        ))}
        {(!data?.items || data.items.length === 0) && (
          <p className="text-center text-muted-foreground py-8">Aucune réservation</p>
        )}
      </div>
    </div>
  );
}

function ContactsTab() {
  const utils = trpc.useUtils();
  const { data, isLoading, error } = trpc.admin.contacts.list.useQuery({});
  const markRead = trpc.admin.contacts.markRead.useMutation({
    onSuccess: () => {
      toast.success("Marqué comme lu");
      utils.admin.contacts.list.invalidate();
    },
  });

  if (error) {
    return <div className="text-center py-8 text-red-400">Erreur de chargement : {error.message}</div>;
  }

  if (isLoading) {
    return <div className="space-y-4">{[1, 2, 3].map(i => <div key={i} className="h-20 bg-card rounded-lg animate-pulse" />)}</div>;
  }

  return (
    <div>
      <p className="text-sm text-muted-foreground mb-4">{data?.total || 0} message(s)</p>
      <div className="space-y-3">
        {data?.items.map((msg) => (
          <div key={msg.id} className={`bg-card border rounded-lg p-4 ${msg.read === 0 ? "border-primary/50" : "border-border"}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1">
                  <span className="font-semibold text-foreground">{msg.name}</span>
                  {msg.read === 0 && <span className="w-2 h-2 rounded-full bg-primary" />}
                  <span className="text-xs text-muted-foreground font-mono">{msg.trackingId}</span>
                </div>
                <div className="flex gap-3 text-sm text-muted-foreground mb-2">
                  <span>{msg.email}</span>
                  {msg.phone && <span>{msg.phone}</span>}
                  <span>{new Date(msg.createdAt).toLocaleString("fr-FR")}</span>
                </div>
                <p className="text-sm text-foreground">{msg.message}</p>
              </div>
              {msg.read === 0 && (
                <Button size="sm" variant="outline" onClick={() => markRead.mutate({ id: msg.id })}>
                  <Eye className="w-3 h-3 mr-1" />
                  Lu
                </Button>
              )}
            </div>
          </div>
        ))}
        {(!data?.items || data.items.length === 0) && (
          <p className="text-center text-muted-foreground py-8">Aucun message</p>
        )}
      </div>
    </div>
  );
}

function GdprTab() {
  const utils = trpc.useUtils();
  const { data, isLoading, error } = trpc.admin.gdprRequests.list.useQuery({});
  const updateStatus = trpc.admin.gdprRequests.updateStatus.useMutation({
    onSuccess: () => {
      toast.success("Statut mis à jour");
      utils.admin.gdprRequests.list.invalidate();
    },
  });

  if (error) {
    return <div className="text-center py-8 text-red-400">Erreur de chargement : {error.message}</div>;
  }

  const statusColors: Record<string, string> = {
    pending: "bg-yellow-500/20 text-yellow-400",
    in_progress: "bg-blue-500/20 text-blue-400",
    completed: "bg-green-500/20 text-green-400",
    rejected: "bg-red-500/20 text-red-400",
  };

  const typeLabels: Record<string, string> = {
    access: "Accès",
    rectification: "Rectification",
    deletion: "Suppression",
    portability: "Portabilité",
    objection: "Opposition",
  };

  if (isLoading) {
    return <div className="space-y-4">{[1, 2, 3].map(i => <div key={i} className="h-20 bg-card rounded-lg animate-pulse" />)}</div>;
  }

  return (
    <div>
      <p className="text-sm text-muted-foreground mb-4">{data?.total || 0} demande(s) RGPD</p>
      <div className="space-y-3">
        {data?.items.map((req) => (
          <div key={req.id} className="bg-card border border-border rounded-lg p-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1">
                  <span className="font-semibold text-foreground">{req.name}</span>
                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-700 text-slate-200">
                    {typeLabels[req.requestType] || req.requestType}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[req.status] || ""}`}>
                    {req.status}
                  </span>
                </div>
                <div className="flex gap-3 text-sm text-muted-foreground">
                  <span>{req.email}</span>
                  <span>{new Date(req.createdAt).toLocaleString("fr-FR")}</span>
                </div>
                {req.description && (
                  <p className="text-sm text-foreground mt-2">{req.description}</p>
                )}
              </div>
              <div className="flex gap-2">
                {req.status === "pending" && (
                  <Button size="sm" variant="outline" onClick={() => updateStatus.mutate({ id: req.id, status: "in_progress" })}>
                    <Clock className="w-3 h-3 mr-1" />
                    En cours
                  </Button>
                )}
                {(req.status === "pending" || req.status === "in_progress") && (
                  <Button size="sm" onClick={() => updateStatus.mutate({ id: req.id, status: "completed" })}>
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Traité
                  </Button>
                )}
              </div>
            </div>
          </div>
        ))}
        {(!data?.items || data.items.length === 0) && (
          <p className="text-center text-muted-foreground py-8">Aucune demande RGPD</p>
        )}
      </div>
    </div>
  );
}

function TestimonialsTab() {
  const { data: testimonialsList, isLoading } = trpc.admin.testimonials.list.useQuery();
  const utils = trpc.useUtils();
  const updateStatus = trpc.admin.testimonials.updateStatus.useMutation({
    onSuccess: () => {
      toast.success("Témoignage mis à jour");
      utils.admin.testimonials.list.invalidate();
    },
  });
  const deleteTestimonial = trpc.admin.testimonials.delete.useMutation({
    onSuccess: () => {
      toast.success("Témoignage supprimé");
      utils.admin.testimonials.list.invalidate();
    },
  });

  const statusColors: Record<string, string> = {
    pending: "bg-yellow-500/20 text-yellow-400",
    approved: "bg-green-500/20 text-green-400",
    rejected: "bg-red-500/20 text-red-400",
  };

  if (isLoading) {
    return <div className="space-y-4">{[1, 2, 3].map(i => <div key={i} className="h-20 bg-card rounded-lg animate-pulse" />)}</div>;
  }

  return (
    <div>
      <p className="text-sm text-muted-foreground mb-4">{testimonialsList?.length || 0} témoignage(s)</p>
      <div className="space-y-3">
        {testimonialsList?.map((t) => (
          <div key={t.id} className="bg-card border border-border rounded-lg p-4">
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1">
                  <span className="font-semibold text-foreground">{t.authorName}</span>
                  <div className="flex">
                    {Array.from({ length: t.rating }).map((_, i) => (
                      <Star key={i} className="w-3 h-3 fill-cyan-400 text-cyan-400" />
                    ))}
                  </div>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[t.status] || ""}`}>
                    {t.status}
                  </span>
                  {t.featured === 1 && <span className="px-2 py-0.5 rounded text-xs font-medium bg-cyan-500/20 text-cyan-400">Featured</span>}
                </div>
                <p className="text-sm font-medium text-foreground">{t.title}</p>
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{t.content}</p>
              </div>
              <div className="flex gap-2 shrink-0">
                {t.status !== "approved" && (
                  <Button size="sm" onClick={() => updateStatus.mutate({ id: t.id, status: "approved" })}>
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Approuver
                  </Button>
                )}
                {t.status !== "rejected" && (
                  <Button size="sm" variant="outline" onClick={() => updateStatus.mutate({ id: t.id, status: "rejected" })}>
                    <XCircle className="w-3 h-3 mr-1" />
                    Rejeter
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => updateStatus.mutate({ id: t.id, status: t.status, featured: t.featured === 1 ? 0 : 1 })}
                >
                  {t.featured === 1 ? "Retirer" : "Mettre en avant"}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    if (confirm("Supprimer ce témoignage ?")) {
                      deleteTestimonial.mutate({ id: t.id });
                    }
                  }}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </div>
          </div>
        ))}
        {(!testimonialsList || testimonialsList.length === 0) && (
          <p className="text-center text-muted-foreground py-8">Aucun témoignage</p>
        )}
      </div>
    </div>
  );
}

function BlogTab() {
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
    return <div className="space-y-4">{[1, 2, 3].map(i => <div key={i} className="h-20 bg-card rounded-lg animate-pulse" />)}</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-muted-foreground">{posts?.length || 0} article(s)</p>
        <Button onClick={() => { resetForm(); setShowForm(true); }}>
          <Plus className="w-4 h-4 mr-2" />
          Nouvel article
        </Button>
      </div>

      {showForm && (
        <div className="bg-card border border-border rounded-lg p-6 mb-6">
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
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={form.published}
                onChange={(e) => setForm({ ...form, published: e.target.checked })}
                className="rounded"
              />
              Publié
            </label>
            <div className="flex gap-2">
              <Button variant="outline" onClick={resetForm}>Annuler</Button>
              <Button onClick={handleSubmit} disabled={createPost.isPending || updatePost.isPending}>
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
              <div className="flex gap-2 shrink-0">
                <Button size="sm" variant="outline" onClick={() => handleEdit(post)}>
                  <Edit className="w-3 h-3 mr-1" />
                  Modifier
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
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

function AvailabilityTab() {
  const utils = trpc.useUtils();
  const { data: slots, isLoading: slotsLoading } = trpc.admin.availability.listSlots.useQuery();
  const { data: blockedDates, isLoading: blockedLoading } = trpc.admin.availability.listBlockedDates.useQuery();

  const [showSlotForm, setShowSlotForm] = useState(false);
  const [slotForm, setSlotForm] = useState({ dayOfWeek: 1, startTime: "09:00", endTime: "10:00" });
  const [showBlockForm, setShowBlockForm] = useState(false);
  const [blockForm, setBlockForm] = useState({ date: "", reason: "" });

  const createSlot = trpc.admin.availability.addSlot.useMutation({
    onSuccess: () => {
      toast.success("Créneau ajouté");
      utils.admin.availability.listSlots.invalidate();
      setShowSlotForm(false);
      setSlotForm({ dayOfWeek: 1, startTime: "09:00", endTime: "10:00" });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteSlot = trpc.admin.availability.deleteSlot.useMutation({
    onSuccess: () => {
      toast.success("Créneau supprimé");
      utils.admin.availability.listSlots.invalidate();
    },
  });

  const blockDate = trpc.admin.availability.addBlockedDate.useMutation({
    onSuccess: () => {
      toast.success("Date bloquée");
      utils.admin.availability.listBlockedDates.invalidate();
      setShowBlockForm(false);
      setBlockForm({ date: "", reason: "" });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const unblockDate = trpc.admin.availability.removeBlockedDate.useMutation({
    onSuccess: () => {
      toast.success("Date débloquée");
      utils.admin.availability.listBlockedDates.invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const dayNames = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

  if (slotsLoading || blockedLoading) {
    return <div className="space-y-4">{[1, 2, 3].map(i => <div key={i} className="h-20 bg-card rounded-lg animate-pulse" />)}</div>;
  }

  return (
    <div className="space-y-8">
      {/* Créneaux hebdomadaires */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-foreground">Créneaux hebdomadaires</h3>
          <Button size="sm" onClick={() => setShowSlotForm(!showSlotForm)}>
            <Plus className="w-4 h-4 mr-2" />
            Ajouter un créneau
          </Button>
        </div>

        {showSlotForm && (
          <div className="bg-card border border-border rounded-lg p-4 mb-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <div>
                <label className="text-sm text-muted-foreground block mb-1">Jour</label>
                <select
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
                  value={slotForm.dayOfWeek}
                  onChange={(e) => setSlotForm({ ...slotForm, dayOfWeek: parseInt(e.target.value) })}
                >
                  {dayNames.map((name, i) => (
                    <option key={i} value={i}>{name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm text-muted-foreground block mb-1">Début</label>
                <input
                  type="time"
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
                  value={slotForm.startTime}
                  onChange={(e) => setSlotForm({ ...slotForm, startTime: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground block mb-1">Fin</label>
                <input
                  type="time"
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
                  value={slotForm.endTime}
                  onChange={(e) => setSlotForm({ ...slotForm, endTime: e.target.value })}
                />
              </div>
              <Button onClick={() => createSlot.mutate(slotForm)} disabled={createSlot.isPending}>
                Ajouter
              </Button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {slots?.map((slot) => (
            <div key={slot.id} className="bg-card border border-border rounded-lg p-3 flex items-center justify-between">
              <div>
                <span className="font-medium text-foreground">{dayNames[slot.dayOfWeek]}</span>
                <span className="text-sm text-muted-foreground ml-2">{slot.startTime} - {slot.endTime}</span>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => deleteSlot.mutate({ id: slot.id })}
              >
                <Trash className="w-3 h-3 text-red-400" />
              </Button>
            </div>
          ))}
          {(!slots || slots.length === 0) && (
            <p className="text-muted-foreground col-span-full text-center py-4">Aucun créneau configuré</p>
          )}
        </div>
      </section>

      {/* Dates bloquées */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-foreground">Dates bloquées</h3>
          <Button size="sm" onClick={() => setShowBlockForm(!showBlockForm)}>
            <Plus className="w-4 h-4 mr-2" />
            Bloquer une date
          </Button>
        </div>

        {showBlockForm && (
          <div className="bg-card border border-border rounded-lg p-4 mb-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              <div>
                <label className="text-sm text-muted-foreground block mb-1">Date</label>
                <input
                  type="date"
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
                  value={blockForm.date}
                  onChange={(e) => setBlockForm({ ...blockForm, date: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground block mb-1">Raison (optionnel)</label>
                <input
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
                  value={blockForm.reason}
                  onChange={(e) => setBlockForm({ ...blockForm, reason: e.target.value })}
                  placeholder="Congés, formation..."
                />
              </div>
              <Button onClick={() => blockDate.mutate(blockForm)} disabled={blockDate.isPending || !blockForm.date}>
                Bloquer
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {blockedDates?.map((bd) => (
            <div key={bd.id} className="bg-card border border-border rounded-lg p-3 flex items-center justify-between">
              <div>
                <span className="font-medium text-foreground">{new Date(bd.date + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</span>
                {bd.reason && <span className="text-sm text-muted-foreground ml-3">{bd.reason}</span>}
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => unblockDate.mutate({ id: bd.id })}
              >
                <XCircle className="w-4 h-4 text-red-400" />
              </Button>
            </div>
          ))}
          {(!blockedDates || blockedDates.length === 0) && (
            <p className="text-muted-foreground text-center py-4">Aucune date bloquée</p>
          )}
        </div>
      </section>
    </div>
  );
}
