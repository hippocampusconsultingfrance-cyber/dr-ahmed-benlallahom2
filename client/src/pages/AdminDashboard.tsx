import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar, MessageSquare, Shield, DollarSign, Eye, CheckCircle, XCircle, Clock, ArrowLeft, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

type Tab = "overview" | "appointments" | "contacts" | "gdpr" | "testimonials";

export default function AdminDashboard() {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Chargement...</div>
      </div>
    );
  }

  if (!user || user.role !== "admin") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground mb-4">Accès refusé</h1>
          <p className="text-muted-foreground mb-6">Vous n'avez pas les permissions nécessaires.</p>
          <Button onClick={() => setLocation("/")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Retour à l'accueil
          </Button>
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
                  <span>{new Date(apt.appointmentDate).toLocaleString("fr-FR")}</span>
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
