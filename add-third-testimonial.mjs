import mysql from 'mysql2/promise';

const connection = await mysql.createConnection({
  host: process.env.DATABASE_URL?.split('@')[1]?.split('/')[0] || 'localhost',
  user: process.env.DATABASE_URL?.split('//')[1]?.split(':')[0] || 'root',
  password: process.env.DATABASE_URL?.split(':')[2]?.split('@')[0] || '',
  database: process.env.DATABASE_URL?.split('/').pop() || 'db',
});

const testimonials = [
  {
    firstName: 'Dr. L.F.',
    rating: 5,
    title: 'Excellence médicale et esprit entrepreneurial',
    content: 'J\'ai eu l\'occasion de collaborer avec ce médecin dans plusieurs projets et j\'ai été impressionnée par son professionnalisme, sa rigueur et sa capacité à transformer des idées ambitieuses en réalisations concrètes. Son sens de l\'organisation, son engagement et sa vision font de lui un partenaire de confiance, aussi compétent sur le plan médical qu\'entrepreneurial.',
    specialty: 'Pédiatre',
    language: 'fr',
    featured: 1,
    verified: 1,
    status: 'approved',
  },
  {
    firstName: 'Dr. L.F.',
    rating: 5,
    title: 'Medical Excellence and Entrepreneurial Spirit',
    content: 'I had the opportunity to collaborate with this doctor on several projects and was impressed by his professionalism, rigor, and ability to transform ambitious ideas into concrete achievements. His organizational skills, commitment, and vision make him a trusted partner, equally competent in both medical and entrepreneurial fields.',
    specialty: 'Pediatrician',
    language: 'en',
    featured: 1,
    verified: 1,
    status: 'approved',
  },
  {
    firstName: 'Dr. L.F.',
    rating: 5,
    title: 'Medizinische Exzellenz und unternehmerischer Geist',
    content: 'Ich hatte die Gelegenheit, mit diesem Arzt an mehreren Projekten zusammenzuarbeiten, und war von seinem Professionalismus, seiner Genauigkeit und seiner Fähigkeit beeindruckt, ehrgeizige Ideen in konkrete Ergebnisse umzuwandeln. Seine Organisationsfähigkeiten, sein Engagement und seine Vision machen ihn zu einem vertrauenswürdigen Partner, der sowohl im medizinischen als auch im unternehmerischen Bereich gleich kompetent ist.',
    specialty: 'Kinderarzt',
    language: 'de',
    featured: 1,
    verified: 1,
    status: 'approved',
  },
  {
    firstName: 'Dr. L.F.',
    rating: 5,
    title: '医学卓越与创业精神',
    content: '我有机会与这位医生在多个项目上合作，对他的专业精神、严谨性和将宏大想法转化为具体成果的能力印象深刻。他的组织能力、承诺和远见使他成为值得信赖的合作伙伴，在医学和创业领域都同样胜任。',
    specialty: '儿科医生',
    language: 'zh',
    featured: 1,
    verified: 1,
    status: 'approved',
  },
];

for (const testimonial of testimonials) {
  await connection.execute(
    `INSERT INTO testimonials (firstName, rating, title, content, specialty, language, featured, verified, status) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      testimonial.firstName,
      testimonial.rating,
      testimonial.title,
      testimonial.content,
      testimonial.specialty,
      testimonial.language,
      testimonial.featured,
      testimonial.verified,
      testimonial.status,
    ]
  );
}

console.log('✅ Troisième témoignage (Dr. L.F.) ajouté en 4 langues');
await connection.end();
