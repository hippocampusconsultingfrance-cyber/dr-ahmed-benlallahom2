import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useLanguage } from "@/contexts/LanguageContext";
import { Calendar, Clock, User, Mail, Phone, FileText } from "lucide-react";

const bookingContent = {
  fr: {
    title: "Réserver une Consultation",
    subtitle: "Conseil en santé - 30 minutes",
    form: {
      name: "Nom complet",
      email: "Email",
      phone: "Numéro de téléphone",
      date: "Date et heure",
      details: "Détails de votre demande",
      detailsPlaceholder: "Décrivez brièvement votre situation...",
      submit: "Procéder au paiement",
      loading: "Traitement...",
    },
    pricing: {
      title: "Tarification",
      dayRate: "Tarif jour (8h-18h)",
      nightRate: "Tarif nuit (18h-8h)",
      eur: "€",
    },
    success: "Réservation créée avec succès!",
    error: "Erreur lors de la création de la réservation",
  },
  en: {
    title: "Book a Consultation",
    subtitle: "Health Advice - 30 minutes",
    form: {
      name: "Full Name",
      email: "Email",
      phone: "Phone Number",
      date: "Date and Time",
      details: "Request Details",
      detailsPlaceholder: "Briefly describe your situation...",
      submit: "Proceed to Payment",
      loading: "Processing...",
    },
    pricing: {
      title: "Pricing",
      dayRate: "Day Rate (8am-6pm)",
      nightRate: "Night Rate (6pm-8am)",
      eur: "€",
    },
    success: "Booking created successfully!",
    error: "Error creating booking",
  },
  de: {
    title: "Beratung buchen",
    subtitle: "Gesundheitsberatung - 30 Minuten",
    form: {
      name: "Vollständiger Name",
      email: "E-Mail",
      phone: "Telefonnummer",
      date: "Datum und Uhrzeit",
      details: "Anforderungsdetails",
      detailsPlaceholder: "Beschreiben Sie kurz Ihre Situation...",
      submit: "Zur Zahlung übergehen",
      loading: "Verarbeitung läuft...",
    },
    pricing: {
      title: "Preisgestaltung",
      dayRate: "Tagestarif (8:00-18:00)",
      nightRate: "Nachttarif (18:00-8:00)",
      eur: "€",
    },
    success: "Buchung erfolgreich erstellt!",
    error: "Fehler beim Erstellen der Buchung",
  },
  zh: {
    title: "预订咨询",
    subtitle: "健康建议 - 30分钟",
    form: {
      name: "全名",
      email: "电子邮件",
      phone: "电话号码",
      date: "日期和时间",
      details: "请求详情",
      detailsPlaceholder: "简要描述您的情况...",
      submit: "进行支付",
      loading: "处理中...",
    },
    pricing: {
      title: "定价",
      dayRate: "日间费率 (8:00-18:00)",
      nightRate: "夜间费率 (18:00-8:00)",
      eur: "€",
    },
    success: "预订成功创建!",
    error: "创建预订时出错",
  },
};

export default function BookingPage() {
  const { language } = useLanguage();
  const content = bookingContent[language as keyof typeof bookingContent] || bookingContent.en;

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    date: "",
    details: "",
  });

  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const calculatePrice = trpc.appointments.calculatePrice.useQuery(
    { appointmentDate: selectedDate?.toISOString() || "" },
    { enabled: !!selectedDate }
  );

  const createAppointment = trpc.appointments.create.useMutation({
    onSuccess: (data) => {
      alert(content.success);
      console.log("Appointment created:", data);
    },
    onError: (error) => {
      alert(content.error + ": " + error.message);
    },
  });

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const dateStr = e.target.value;
    if (dateStr) {
      const date = new Date(dateStr);
      setSelectedDate(date);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedDate) {
      alert("Please select a date and time");
      return;
    }

    createAppointment.mutate({
      customerName: formData.name,
      customerEmail: formData.email,
      customerPhone: formData.phone,
      appointmentDate: selectedDate.toISOString(),
      requestDetails: formData.details,
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-950 pt-24 pb-16">
      <div className="max-w-4xl mx-auto px-4">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
            {content.title}
          </h1>
          <p className="text-gray-400 text-lg">{content.subtitle}</p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {/* Form */}
          <div className="md:col-span-2">
            <Card className="border-cyan-500/30 bg-slate-800/50 backdrop-blur p-8">
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    <User className="inline mr-2 w-4 h-4" />
                    {content.form.name}
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    <Mail className="inline mr-2 w-4 h-4" />
                    {content.form.email}
                  </label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    <Phone className="inline mr-2 w-4 h-4" />
                    {content.form.phone}
                  </label>
                  <input
                    type="tel"
                    required
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                {/* Date & Time */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    <Calendar className="inline mr-2 w-4 h-4" />
                    {content.form.date}
                  </label>
                  <input
                    type="datetime-local"
                    required
                    onChange={handleDateChange}
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                {/* Details */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    <FileText className="inline mr-2 w-4 h-4" />
                    {content.form.details}
                  </label>
                  <textarea
                    required
                    value={formData.details}
                    onChange={(e) => setFormData({ ...formData, details: e.target.value })}
                    placeholder={content.form.detailsPlaceholder}
                    rows={4}
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                {/* Submit Button */}
                <Button
                  type="submit"
                  disabled={createAppointment.isPending || !selectedDate}
                  className="w-full bg-cyan-500 hover:bg-cyan-600 text-white font-semibold py-3 rounded-lg transition"
                >
                  {createAppointment.isPending ? content.form.loading : content.form.submit}
                </Button>
              </form>
            </Card>
          </div>

          {/* Pricing Sidebar */}
          <div>
            <Card className="border-cyan-500/30 bg-slate-800/50 backdrop-blur p-6 sticky top-24">
              <h3 className="text-lg font-bold text-white mb-6">{content.pricing.title}</h3>

              <div className="space-y-4">
                <div className="flex justify-between items-center pb-4 border-b border-slate-700">
                  <span className="text-gray-400">{content.pricing.dayRate}</span>
                  <span className="text-cyan-400 font-bold">100{content.pricing.eur}</span>
                </div>

                <div className="flex justify-between items-center pb-4 border-b border-slate-700">
                  <span className="text-gray-400">{content.pricing.nightRate}</span>
                  <span className="text-orange-400 font-bold">150{content.pricing.eur}</span>
                </div>

                {calculatePrice.data && (
                  <div className="mt-6 p-4 bg-cyan-500/10 border border-cyan-500/30 rounded-lg">
                    <p className="text-sm text-gray-400 mb-2">
                      {calculatePrice.data.isNightRate ? "🌙 " : "☀️ "}
                      {calculatePrice.data.isNightRate ? content.pricing.nightRate : content.pricing.dayRate}
                    </p>
                    <p className="text-2xl font-bold text-cyan-400">
                      {calculatePrice.data.finalPrice}{content.pricing.eur}
                    </p>
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
