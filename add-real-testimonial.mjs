import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const testimonial = {
  authorName: "W.D.",
  rating: 5,
  title: "Excellent Doctor",
  content: "Working alongside Dr. Ahmed Ben Lallahom has been a truly rewarding experience. His unique ability to bridge medical expertise with strategic thinking, combined with his integrity, professionalism, and commitment to innovation, makes him an exceptional leader. I confidently recommend Dr. Ben Lallahom to any organization seeking excellence, vision, and meaningful impact.",
  specialty: "Co-Founder, NOVARENA & SAWA4YOU",
  language: "en",
  featured: 1,
  verified: 1,
};

async function addTestimonial() {
  const connection = await mysql.createConnection(process.env.DATABASE_URL);

  try {
    console.log("🌱 Adding real testimonial from W.D...");

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

    console.log("✅ Real testimonial added successfully!");
  } catch (error) {
    console.error("❌ Error adding testimonial:", error);
    throw error;
  } finally {
    await connection.end();
  }
}

addTestimonial();
