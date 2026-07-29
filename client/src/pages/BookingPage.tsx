import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useLanguage } from "@/contexts/LanguageContext";
import { Calendar, Clock, User, Mail, Phone, FileText, CheckCircle, AlertCircle } from "lucide-react";

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
    paymentSuccess: "Paiement réussi! Votre consultation a été confirmée.",
    paymentCanceled: "Paiement annulé. Votre réservation n'a pas été finalisée.",
    trackingId: "Numéro de suivi:",
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
    paymentSuccess: "Payment successful! Your consultation has been confirmed.",
    paymentCanceled: "Payment canceled. Your booking was not finalized.",
    trackingId: "Tracking ID:",
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
      detailsPlaceholder: "Beschreiben Sie Ihre Situation kurz...",
      submit: "Zur Zahlung übergehen",
      loading: "Verarbeitung...",
    },
    pricing: {
      title: "Preisgestaltung",
      dayRate: "Tagessatz (8:00-18:00)",
      nightRate: "Nachtsatz (18:00-8:00)",
      eur: "€",
    },
    success: "Buchung erfolgreich erstellt!",
    error: "Fehler beim Erstellen der Buchung",
    paymentSuccess: "Zahlung erfolgreich! Ihre Beratung wurde bestätigt.",
    paymentCanceled: "Zahlung abgebrochen. Ihre Buchung wurde nicht abgeschlossen.",
    trackingId: "Verfolgungsnummer:",
  },
  zh: {
    title: "预订咨询",
    subtitle: "健康咨询 - 30 分钟",
    form: {
      name: "全名",
      email: "电子邮件",
      phone: "电话号码",
      date: "日期和时间",
      details: "请求详情",
      detailsPlaceholder: "简要描述您的情况...",
      submit: "继续付款",
      loading: "处理中...",
    },
    pricing: {
      title: "价格",
      dayRate: "日间费率 (8:00-18:00)",
      nightRate: "夜间费率 (18:00-8:00)",
      eur: "€",
    },
    success: "预订成功创建!",
    error: "创建预订时出错",
    paymentSuccess: "付款成功！您的咨询已确认。",
    paymentCanceled: "付款已取消。您的预订未最终确定。",
    trackingId: "跟踪 ID:",
  },
};

export default function BookingPage() {
  const { language } = useLanguage();
  const [location, setLocation] = useLocation();
  const content = bookingContent[language as keyof typeof bookingContent] || bookingContent.en;

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    date: "",
    details: "",
  });

  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<"success" | "canceled" | null>(null);
  const [trackingId, setTrackingId] = useState<string | null>(null);

  // Handle Stripe redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const success = params.get("success");
    const canceled = params.get("canceled");
    const tid = params.get("trackingId");

    if (success === "true") {
      setPaymentStatus("success");
      setTrackingId(tid);
      // Clear URL params
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (canceled === "true") {
      setPaymentStatus("canceled");
      // Clear URL params
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const calculatePrice = trpc.appointments.calculatePrice.useQuery(
    { appointmentDate: selectedDate?.toISOString() || "" },
    { enabled: !!selectedDate }
  );

  const createAppointment = trpc.appointments.create.useMutation();

  const createCheckoutSession = trpc.appointments.createCheckoutSession.useMutation({
    onSuccess: (data) => {
      if (data.checkoutUrl) {
        window.open(data.checkoutUrl, "_blank");
      }
    },
    onError: (error) => {
      alert("Payment error: " + error.message);
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

    if (!calculatePrice.data) {
      alert("Unable to calculate price");
      return;
    }

    try {
      const appointmentResult = await createAppointment.mutateAsync({
        customerName: formData.name,
        customerEmail: formData.email,
        customerPhone: formData.phone,
        appointmentDate: selectedDate.toISOString(),
        requestDetails: formData.details,
      });

      if (appointmentResult.success) {
        await createCheckoutSession.mutateAsync({
          trackingId: appointmentResult.trackingId,
          finalPrice: appointmentResult.finalPrice,
          customerEmail: formData.email,
          customerName: formData.name,
        });
      }
    } catch (error) {
      console.error("Booking error:", error);
    }
  };

  const handleReset = () => {
    setFormData({ name: "", email: "", phone: "", date: "", details: "" });
    setSelectedDate(null);
    setPaymentStatus(null);
    setTrackingId(null);
  };

  const isLoading = createAppointment.isPending || createCheckoutSession.isPending;

  return (
    <div className="min-h-screen bg-background py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Payment Success Message */}
        {paymentStatus === "success" && (
          <Card className="mb-6 p-6 border-green-500 bg-green-50">
            <div className="flex items-start gap-4">
              <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0 mt-1" />
              <div>
                <h3 className="font-semibold text-green-900 mb-2">{content.paymentSuccess}</h3>
                {trackingId && (
                  <p className="text-green-800">
                    {content.trackingId} <span className="font-mono">{trackingId}</span>
                  </p>
                )}
              </div>
            </div>
          </Card>
        )}

        {/* Payment Canceled Message */}
        {paymentStatus === "canceled" && (
          <Card className="mb-6 p-6 border-orange-500 bg-orange-50">
            <div className="flex items-start gap-4">
              <AlertCircle className="w-6 h-6 text-orange-600 flex-shrink-0 mt-1" />
              <div>
                <h3 className="font-semibold text-orange-900">{content.paymentCanceled}</h3>
              </div>
            </div>
          </Card>
        )}

        <Card className="p-8">
          <h1 className="text-3xl font-bold mb-2">{content.title}</h1>
          <p className="text-muted-foreground mb-8">{content.subtitle}</p>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                <User className="w-4 h-4" />
                {content.form.name}
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                <Mail className="w-4 h-4" />
                {content.form.email}
              </label>
              <input
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            {/* Phone */}
            <div>
              <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                <Phone className="w-4 h-4" />
                {content.form.phone}
              </label>
              <input
                type="tel"
                required
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            {/* Date */}
            <div>
              <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                {content.form.date}
              </label>
              <input
                type="datetime-local"
                required
                value={formData.date}
                onChange={(e) => {
                  setFormData({ ...formData, date: e.target.value });
                  handleDateChange(e);
                }}
                className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            {/* Price Display */}
            {calculatePrice.data && (
              <Card className="p-4 bg-muted">
                <h3 className="font-semibold mb-3">{content.pricing.title}</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>{content.pricing.dayRate}:</span>
                    <span>100 {content.pricing.eur}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{content.pricing.nightRate}:</span>
                    <span>150 {content.pricing.eur}</span>
                  </div>
                  <div className="border-t border-border pt-2 mt-2 flex justify-between font-bold">
                    <span>Total:</span>
                    <span>{calculatePrice.data.finalPrice} {content.pricing.eur}</span>
                  </div>
                </div>
              </Card>
            )}

            {/* Details */}
            <div>
              <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                {content.form.details}
              </label>
              <textarea
                required
                value={formData.details}
                onChange={(e) => setFormData({ ...formData, details: e.target.value })}
                placeholder={content.form.detailsPlaceholder}
                rows={4}
                className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              disabled={isLoading || !selectedDate || !calculatePrice.data}
              className="w-full"
              size="lg"
            >
              {isLoading ? content.form.loading : content.form.submit}
            </Button>
          </form>

          {paymentStatus && (
            <Button
              onClick={handleReset}
              variant="outline"
              className="w-full mt-4"
            >
              Nouvelle réservation / New Booking
            </Button>
          )}
        </Card>
      </div>
    </div>
  );
}
