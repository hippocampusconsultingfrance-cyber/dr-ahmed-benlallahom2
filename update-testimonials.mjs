import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const testimonials = [
  {
    authorName: "W.D.",
    rating: 5,
    title: "Excellent Doctor",
    content: "Working alongside Dr. Ahmed Ben Lallahom has been a truly rewarding experience. His unique ability to bridge medical expertise with strategic thinking, combined with his integrity, professionalism, and commitment to innovation, makes him an exceptional leader. I confidently recommend Dr. Ben Lallahom to any organization seeking excellence, vision, and meaningful impact.",
    specialty: "Co-Founder, NOVARENA & SAWA4YOU",
    language: "en",
    featured: 1,
    verified: 1,
  },
  {
    authorName: "W.D.",
    rating: 5,
    title: "Excellent Médecin",
    content: "Travailler aux côtés du Dr. Ahmed Ben Lallahom a été une expérience véritablement enrichissante. Sa capacité unique à combiner l'expertise médicale avec la réflexion stratégique, associée à son intégrité, son professionnalisme et son engagement envers l'innovation, en fait un leader exceptionnel. Je recommande vivement le Dr. Ben Lallahom à toute organisation recherchant l'excellence, la vision et un impact significatif.",
    specialty: "Co-Fondateur, NOVARENA & SAWA4YOU",
    language: "fr",
    featured: 1,
    verified: 1,
  },
  {
    authorName: "W.D.",
    rating: 5,
    title: "Ausgezeichneter Arzt",
    content: "Die Zusammenarbeit mit Dr. Ahmed Ben Lallahom war eine wirklich bereichernde Erfahrung. Seine einzigartige Fähigkeit, medizinische Expertise mit strategischem Denken zu verbinden, gepaart mit seiner Integrität, seinem Professionalismus und seinem Engagement für Innovation, macht ihn zu einem außergewöhnlichen Anführer. Ich empfehle Dr. Ben Lallahom jeder Organisation, die Exzellenz, Vision und bedeutungsvolle Auswirkungen anstrebt.",
    specialty: "Mitbegründer, NOVARENA & SAWA4YOU",
    language: "de",
    featured: 1,
    verified: 1,
  },
  {
    authorName: "W.D.",
    rating: 5,
    title: "杰出医生",
    content: "与艾哈迈德·本·拉拉霍姆医生合作是一次真正充实的经历。他独特的能力将医学专业知识与战略思维相结合，加上他的正直、专业精神和对创新的承诺，使他成为一位杰出的领导者。我真诚地向任何寻求卓越、远见和有意义影响的组织推荐本·拉拉霍姆医生。",
    specialty: "联合创始人，NOVARENA & SAWA4YOU",
    language: "zh",
    featured: 1,
    verified: 1,
  },
];

async function updateTestimonials() {
  const connection = await mysql.createConnection(process.env.DATABASE_URL);

  try {
    console.log("🗑️  Deleting all existing testimonials...");
    await connection.execute("DELETE FROM testimonials");
    console.log("✅ All testimonials deleted!");

    console.log("\n🌱 Adding W.D. testimonials in all languages...");

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

    console.log("\n✅ All testimonials updated successfully!");
  } catch (error) {
    console.error("❌ Error updating testimonials:", error);
    throw error;
  } finally {
    await connection.end();
  }
}

updateTestimonials();
