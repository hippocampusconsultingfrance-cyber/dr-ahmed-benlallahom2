import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const testimonials = [
  {
    authorName: "Dr. M.E.",
    rating: 5,
    title: "A Trusted Partner in Medical Recruitment",
    content: "I had the opportunity to collaborate with Dr. Ben Lallahom in medical recruitment and professional development. I particularly appreciated his professionalism, availability, and the quality of his follow-up throughout the process. His expertise, responsiveness, and listening skills make him a trusted partner that I recommend without hesitation.",
    specialty: "Emergency Medicine Physician",
    language: "en",
    featured: 1,
    verified: 1,
  },
  {
    authorName: "Dr. M.E.",
    rating: 5,
    title: "Un partenaire de confiance dans le recrutement médical",
    content: "J'ai eu l'occasion de collaborer avec Dr. Ben Lallahom dans le cadre du recrutement médical et de l'accompagnement professionnel. J'ai particulièrement apprécié son professionnalisme, sa disponibilité et la qualité de son suivi tout au long des démarches. Son expertise, sa réactivité et son sens de l'écoute font de lui un partenaire de confiance que je recommande sans hésitation.",
    specialty: "Médecin urgentiste",
    language: "fr",
    featured: 1,
    verified: 1,
  },
  {
    authorName: "Dr. M.E.",
    rating: 5,
    title: "Ein vertrauenswürdiger Partner in der medizinischen Personalvermittlung",
    content: "Ich hatte die Gelegenheit, mit Dr. Ben Lallahom in der medizinischen Personalvermittlung und beruflichen Entwicklung zusammenzuarbeiten. Ich schätzte besonders seinen Professionalismus, seine Verfügbarkeit und die Qualität seiner Betreuung während des gesamten Prozesses. Seine Expertise, Reaktionsfähigkeit und sein Einfühlungsvermögen machen ihn zu einem vertrauenswürdigen Partner, den ich ohne Zögern empfehle.",
    specialty: "Notfallmediziner",
    language: "de",
    featured: 1,
    verified: 1,
  },
  {
    authorName: "Dr. M.E.",
    rating: 5,
    title: "医疗招聘中的可信赖合作伙伴",
    content: "我有机会与本·拉拉霍姆医生在医疗招聘和专业发展方面进行合作。我特别欣赏他的专业精神、可用性以及在整个过程中的优质跟进。他的专业知识、反应能力和倾听能力使他成为我毫不犹豫推荐的可信赖合作伙伴。",
    specialty: "急诊医学医生",
    language: "zh",
    featured: 1,
    verified: 1,
  },
];

async function addTestimonials() {
  const connection = await mysql.createConnection(process.env.DATABASE_URL);

  try {
    console.log("🌱 Adding Dr. M.E. testimonials in all languages...");

    for (const testimonial of testimonials) {
      const query = `
        INSERT INTO testimonials (
          author_name,
          rating,
          title,
          content,
          specialty,
          language,
          featured,
          verified,
          status,
          createdAt,
          updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      `;

      await connection.execute(query, [
        testimonial.authorName,
        testimonial.rating,
        testimonial.title,
        testimonial.content,
        testimonial.specialty,
        testimonial.language,
        testimonial.featured,
        testimonial.verified,
        "approved",
      ]);

      console.log(`✅ Added: ${testimonial.language.toUpperCase()} - "${testimonial.title}"`);
    }

    console.log("\n✅ All Dr. M.E. testimonials added successfully!");
  } catch (error) {
    console.error("❌ Error adding testimonials:", error);
    throw error;
  } finally {
    await connection.end();
  }
}

addTestimonials();
