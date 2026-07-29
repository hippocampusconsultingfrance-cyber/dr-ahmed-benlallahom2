#!/bin/bash

# Ajouter les 4 témoignages de Dr. L.F. via tRPC
curl -X POST http://localhost:3000/api/trpc/testimonials.create \
  -H "Content-Type: application/json" \
  -d '{"authorName":"Dr. L.F.","rating":5,"title":"Excellence médicale et esprit entrepreneurial","content":"J'"'"'ai eu l'"'"'occasion de collaborer avec ce médecin dans plusieurs projets et j'"'"'ai été impressionnée par son professionnalisme, sa rigueur et sa capacité à transformer des idées ambitieuses en réalisations concrètes. Son sens de l'"'"'organisation, son engagement et sa vision font de lui un partenaire de confiance, aussi compétent sur le plan médical qu'"'"'entrepreneurial.","specialty":"Pédiatre","language":"fr","featured":1}'

curl -X POST http://localhost:3000/api/trpc/testimonials.create \
  -H "Content-Type: application/json" \
  -d '{"authorName":"Dr. L.F.","rating":5,"title":"Medical Excellence and Entrepreneurial Spirit","content":"I had the opportunity to collaborate with this doctor on several projects and was impressed by his professionalism, rigor, and ability to transform ambitious ideas into concrete achievements. His organizational skills, commitment, and vision make him a trusted partner, equally competent in both medical and entrepreneurial fields.","specialty":"Pediatrician","language":"en","featured":1}'

curl -X POST http://localhost:3000/api/trpc/testimonials.create \
  -H "Content-Type: application/json" \
  -d '{"authorName":"Dr. L.F.","rating":5,"title":"Medizinische Exzellenz und unternehmerischer Geist","content":"Ich hatte die Gelegenheit, mit diesem Arzt an mehreren Projekten zusammenzuarbeiten, und war von seinem Professionalismus, seiner Genauigkeit und seiner Fähigkeit beeindruckt, ehrgeizige Ideen in konkrete Ergebnisse umzuwandeln. Seine Organisationsfähigkeiten, sein Engagement und seine Vision machen ihn zu einem vertrauenswürdigen Partner, der sowohl im medizinischen als auch im unternehmerischen Bereich gleich kompetent ist.","specialty":"Kinderarzt","language":"de","featured":1}'

curl -X POST http://localhost:3000/api/trpc/testimonials.create \
  -H "Content-Type: application/json" \
  -d '{"authorName":"Dr. L.F.","rating":5,"title":"医学卓越与创业精神","content":"我有机会与这位医生在多个项目上合作，对他的专业精神、严谨性和将宏大想法转化为具体成果的能力印象深刻。他的组织能力、承诺和远见使他成为值得信赖的合作伙伴，在医学和创业领域都同样胜任。","specialty":"儿科医生","language":"zh","featured":1}'

echo "✅ Témoignages Dr. L.F. ajoutés en 4 langues"
