import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const testimonials = [
  // French testimonials
  {
    authorName: "M. P.",
    rating: 5,
    title: "Professionnel d'exception",
    content:
      "Dr. Ben Lallahom m'a suivi lors d'une intervention délicate. Son expertise et son calme m'ont rassuré. Je recommande vivement ses services.",
    specialty: "Chirurgie générale",
    language: "fr",
    featured: 1,
    verified: 1,
  },
  {
    authorName: "Mme L.",
    rating: 5,
    title: "Excellent médecin",
    content:
      "Très professionnel, à l'écoute et compétent. Dr. Ben Lallahom a pris le temps de m'expliquer chaque étape. Merci pour cette excellente prise en charge.",
    specialty: "Anesthésie",
    language: "fr",
    featured: 1,
    verified: 1,
  },
  {
    authorName: "M. D.",
    rating: 4,
    title: "Très satisfait",
    content:
      "Consultation très professionnelle. Dr. Ben Lallahom a répondu à toutes mes questions avec clarté et bienveillance.",
    specialty: "Consultation générale",
    language: "fr",
    featured: 0,
    verified: 1,
  },

  // English testimonials
  {
    authorName: "Mr. J.",
    rating: 5,
    title: "Outstanding professional",
    content:
      "Dr. Ben Lallahom provided exceptional care during my procedure. His expertise and attention to detail are remarkable. Highly recommended.",
    specialty: "Anesthesiology",
    language: "en",
    featured: 1,
    verified: 1,
  },
  {
    authorName: "Ms. S.",
    rating: 5,
    title: "Excellent doctor",
    content:
      "Very professional and caring. Dr. Ben Lallahom took time to explain everything clearly. I felt confident in his hands.",
    specialty: "General consultation",
    language: "en",
    featured: 0,
    verified: 1,
  },
  {
    authorName: "Mr. T.",
    rating: 4,
    title: "Very satisfied",
    content:
      "Great experience overall. Dr. Ben Lallahom is knowledgeable and compassionate. Would definitely return for future consultations.",
    specialty: "Medical consultation",
    language: "en",
    featured: 0,
    verified: 1,
  },

  // German testimonials
  {
    authorName: "Herr K.",
    rating: 5,
    title: "Außergewöhnlicher Fachmann",
    content:
      "Dr. Ben Lallahom hat mich während meines Eingriffs hervorragend betreut. Seine Fachkompetenz und Ruhe gaben mir Vertrauen.",
    specialty: "Anästhesiologie",
    language: "de",
    featured: 1,
    verified: 1,
  },
  {
    authorName: "Frau M.",
    rating: 5,
    title: "Ausgezeichneter Arzt",
    content:
      "Sehr professionell und einfühlsam. Dr. Ben Lallahom hat sich Zeit genommen, alles verständlich zu erklären.",
    specialty: "Allgemeine Beratung",
    language: "de",
    featured: 0,
    verified: 1,
  },

  // Chinese testimonials
  {
    authorName: "王先生",
    rating: 5,
    title: "杰出的专业人士",
    content:
      "本·拉拉霍姆医生在我的手术期间提供了卓越的护理。他的专业知识和冷静让我感到放心。强烈推荐。",
    specialty: "麻醉学",
    language: "zh",
    featured: 1,
    verified: 1,
  },
  {
    authorName: "李女士",
    rating: 5,
    title: "优秀的医生",
    content:
      "非常专业和体贴。本·拉拉霍姆医生花时间清楚地解释了一切。我对他的医疗技能充满信心。",
    specialty: "一般咨询",
    language: "zh",
    featured: 0,
    verified: 1,
  },
];

async function seedTestimonials() {
  const connection = await mysql.createConnection(process.env.DATABASE_URL);

  try {
    console.log("🌱 Seeding testimonials...");

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
        testimonial.specialty || null,
        testimonial.language,
        testimonial.featured,
        testimonial.verified,
        "approved",
      ]);
    }

    console.log(`✅ Successfully seeded ${testimonials.length} testimonials!`);
  } catch (error) {
    console.error("❌ Error seeding testimonials:", error);
    throw error;
  } finally {
    await connection.end();
  }
}

seedTestimonials();
