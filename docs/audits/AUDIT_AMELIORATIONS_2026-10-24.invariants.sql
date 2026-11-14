-- Contrôles de cohérence de la base (audit d'amélioration du 24 octobre 2026, constats DATA-*).
-- La table appointment_invoices est créée au premier paiement : avant la première vente, ce fichier renvoie une erreur.
-- Lecture seule. Coller dans l'editeur SQL Neon (production) : chaque ligne > 0 = invariant viole.
SELECT 'FK' AS famille, 'cv_candidate_certifications sans candidature' AS invariant, 'code (effacement)' AS tenu_par, (SELECT count(*) FROM (select id from cv_candidate_certifications c where not exists (select 1 from cv_applications a where a.id=c.application_id)) q) AS violations
UNION ALL
SELECT 'FK' AS famille, 'cv_candidate_languages sans candidature' AS invariant, 'code (effacement)' AS tenu_par, (SELECT count(*) FROM (select id from cv_candidate_languages c where not exists (select 1 from cv_applications a where a.id=c.application_id)) q) AS violations
UNION ALL
SELECT 'FK' AS famille, 'cv_candidate_experiences sans candidature' AS invariant, 'code (effacement)' AS tenu_par, (SELECT count(*) FROM (select id from cv_candidate_experiences c where not exists (select 1 from cv_applications a where a.id=c.application_id)) q) AS violations
UNION ALL
SELECT 'FK' AS famille, 'cv_processing_jobs sans candidature' AS invariant, 'code (effacement)' AS tenu_par, (SELECT count(*) FROM (select id from cv_processing_jobs c where not exists (select 1 from cv_applications a where a.id=c.application_id)) q) AS violations
UNION ALL
SELECT 'FK' AS famille, 'cv_google_drive_export_jobs sans candidature (hors marqueur d''effacement Drive en attente)' AS invariant, 'code' AS tenu_par, (SELECT count(*) FROM (select id from cv_google_drive_export_jobs c where not exists (select 1 from cv_applications a where a.id=c.application_id) and coalesce(last_error,'') not like 'erasure_pending_drive_delete:%') q) AS violations
UNION ALL
SELECT 'FK' AS famille, 'client_brief_candidates sans candidature' AS invariant, 'code (effacement)' AS tenu_par, (SELECT count(*) FROM (select id from client_brief_candidates c where not exists (select 1 from cv_applications a where a.id=c.application_id)) q) AS violations
UNION ALL
SELECT 'FK' AS famille, 'client_brief_candidates sans mission' AS invariant, 'rien' AS tenu_par, (SELECT count(*) FROM (select id from client_brief_candidates c where not exists (select 1 from client_briefs b where b.id=c.brief_id)) q) AS violations
UNION ALL
SELECT 'FK' AS famille, 'recruitment_campaign_recipients sans campagne' AS invariant, 'rien' AS tenu_par, (SELECT count(*) FROM (select id from recruitment_campaign_recipients r where not exists (select 1 from recruitment_campaigns c where c.id=r.campaign_id)) q) AS violations
UNION ALL
SELECT 'FK' AS famille, 'recruitment_campaign_recipients sans candidature' AS invariant, 'code (effacement)' AS tenu_par, (SELECT count(*) FROM (select id from recruitment_campaign_recipients r where not exists (select 1 from cv_applications a where a.id=r.application_id)) q) AS violations
UNION ALL
SELECT 'FK' AS famille, 'recruitment_follow_up_tasks sans candidature' AS invariant, 'code (effacement)' AS tenu_par, (SELECT count(*) FROM (select id from recruitment_follow_up_tasks t where not exists (select 1 from cv_applications a where a.id=t.application_id)) q) AS violations
UNION ALL
SELECT 'FK' AS famille, 'recruitment_follow_up_tasks -> campagne absente' AS invariant, 'rien' AS tenu_par, (SELECT count(*) FROM (select id from recruitment_follow_up_tasks t where campaign_id is not null and not exists (select 1 from recruitment_campaigns c where c.id=t.campaign_id)) q) AS violations
UNION ALL
SELECT 'FK' AS famille, 'recruitment_email_events -> destinataire absent' AS invariant, 'rien' AS tenu_par, (SELECT count(*) FROM (select id from recruitment_email_events e where campaign_recipient_id is not null and not exists (select 1 from recruitment_campaign_recipients r where r.id=e.campaign_recipient_id)) q) AS violations
UNION ALL
SELECT 'FK' AS famille, 'recruitment_email_events -> candidature absente' AS invariant, 'code (effacement)' AS tenu_par, (SELECT count(*) FROM (select id from recruitment_email_events e where application_id is not null and not exists (select 1 from cv_applications a where a.id=e.application_id)) q) AS violations
UNION ALL
SELECT 'FK' AS famille, 'candidate_accounts.linked_application_id -> candidature absente' AS invariant, 'code (effacement)' AS tenu_par, (SELECT count(*) FROM (select id from candidate_accounts c where linked_application_id is not null and not exists (select 1 from cv_applications a where a.id=c.linked_application_id)) q) AS violations
UNION ALL
SELECT 'FK' AS famille, 'candidate_sessions sans compte' AS invariant, 'code (effacement)' AS tenu_par, (SELECT count(*) FROM (select id from candidate_sessions s where not exists (select 1 from candidate_accounts c where c.id=s.candidate_id)) q) AS violations
UNION ALL
SELECT 'FK' AS famille, 'candidate_documents sans compte' AS invariant, 'code (effacement)' AS tenu_par, (SELECT count(*) FROM (select id from candidate_documents d where not exists (select 1 from candidate_accounts c where c.id=d.candidate_id)) q) AS violations
UNION ALL
SELECT 'FK' AS famille, 'candidate_documents.application_id -> candidature absente' AS invariant, 'rien' AS tenu_par, (SELECT count(*) FROM (select id from candidate_documents d where application_id is not null and not exists (select 1 from cv_applications a where a.id=d.application_id)) q) AS violations
UNION ALL
SELECT 'FK' AS famille, 'candidate_document_processing_jobs sans document' AS invariant, 'code (effacement)' AS tenu_par, (SELECT count(*) FROM (select id from candidate_document_processing_jobs j where not exists (select 1 from candidate_documents d where d.id=j.document_id)) q) AS violations
UNION ALL
SELECT 'FK' AS famille, 'candidate_document_audit_logs -> document absent (hors preuves ''erased'')' AS invariant, 'code (effacement)' AS tenu_par, (SELECT count(*) FROM (select id from candidate_document_audit_logs l where document_id is not null and action <> 'erased' and not exists (select 1 from candidate_documents d where d.id=l.document_id)) q) AS violations
UNION ALL
SELECT 'FK' AS famille, 'appointment_fulfillment_jobs sans rendez-vous' AS invariant, 'rien' AS tenu_par, (SELECT count(*) FROM (select id from appointment_fulfillment_jobs j where not exists (select 1 from appointments a where a.id=j.appointment_id)) q) AS violations
UNION ALL
SELECT 'FK' AS famille, 'appointment_invoices sans rendez-vous (facture orpheline)' AS invariant, 'rien' AS tenu_par, (SELECT count(*) FROM (select id from appointment_invoices i where not exists (select 1 from appointments a where a.id=i.appointment_id)) q) AS violations
UNION ALL
SELECT 'FK' AS famille, 'medical_question_audit_logs sans question' AS invariant, 'rien' AS tenu_par, (SELECT count(*) FROM (select id from medical_question_audit_logs l where not exists (select 1 from medical_questions q where q.id=l.medical_question_id)) q) AS violations
UNION ALL
SELECT 'FK' AS famille, 'recruitment_audit_logs -> candidature absente (hors preuves ''erase'')' AS invariant, 'code (effacement)' AS tenu_par, (SELECT count(*) FROM (select id from recruitment_audit_logs l where application_id is not null and action <> 'erase' and not exists (select 1 from cv_applications a where a.id=l.application_id)) q) AS violations
UNION ALL
SELECT 'FK' AS famille, 'blog_posts.author_id -> utilisateur absent' AS invariant, 'rien' AS tenu_par, (SELECT count(*) FROM (select id from blog_posts b where author_id is not null and not exists (select 1 from users u where u.id=b.author_id)) q) AS violations
UNION ALL
SELECT 'FK' AS famille, 'security_events candidat -> compte absent' AS invariant, 'code (effacement, partiel)' AS tenu_par, (SELECT count(*) FROM (select id from security_events e where security_event_actor_kind='candidate' and actor_reference ~ '^[0-9]+$' and not exists (select 1 from candidate_accounts c where c.id::text=e.actor_reference)) q) AS violations
UNION ALL
SELECT 'METIER' AS famille, 'rendez-vous payé sans tâche de confirmation' AS invariant, 'code (rejeu Stripe uniquement)' AS tenu_par, (SELECT count(*) FROM (select a.id, a.tracking_id from appointments a where a.payment_status='completed' and not exists (select 1 from appointment_fulfillment_jobs j where j.appointment_id=a.id and j.job_type='confirmation')) q) AS violations
UNION ALL
SELECT 'METIER' AS famille, 'rendez-vous payé sans tâche de facture' AS invariant, 'code (rejeu Stripe uniquement)' AS tenu_par, (SELECT count(*) FROM (select a.id, a.tracking_id from appointments a where a.payment_status='completed' and not exists (select 1 from appointment_fulfillment_jobs j where j.appointment_id=a.id and j.job_type='invoice')) q) AS violations
UNION ALL
SELECT 'METIER' AS famille, 'tâche facture terminée sans numéro de facture' AS invariant, 'code' AS tenu_par, (SELECT count(*) FROM (select j.id, j.appointment_id from appointment_fulfillment_jobs j where j.job_type='invoice' and j.status='completed' and coalesce(j.last_error,'')='' and not exists (select 1 from appointment_invoices i where i.appointment_id=j.appointment_id)) q) AS violations
UNION ALL
SELECT 'METIER' AS famille, 'rendez-vous payé ou remboursé, emails après paiement en échec définitif' AS invariant, 'rien (aucune vue admin)' AS tenu_par, (SELECT count(*) FROM (select j.appointment_id, j.job_type from appointment_fulfillment_jobs j where j.status='failed') q) AS violations
UNION ALL
SELECT 'METIER' AS famille, 'paiement ''completed'' avec statut incohérent (held/cancelled)' AS invariant, 'code' AS tenu_par, (SELECT count(*) FROM (select id, tracking_id, appointment_status from appointments where payment_status='completed' and appointment_status in ('held','cancelled')) q) AS violations
UNION ALL
SELECT 'METIER' AS famille, 'remboursé sans date, montant ou PaymentIntent' AS invariant, 'code' AS tenu_par, (SELECT count(*) FROM (select id, tracking_id from appointments where payment_status='refunded' and (refunded_at is null or refund_amount is null or stripe_payment_intent_id is null)) q) AS violations
UNION ALL
SELECT 'METIER' AS famille, 'montant de remboursement > prix payé' AS invariant, 'rien' AS tenu_par, (SELECT count(*) FROM (select id, tracking_id from appointments where refund_amount is not null and refund_amount ~ '^[0-9]+(\.[0-9]+)?$' and final_price ~ '^[0-9]+(\.[0-9]+)?$' and refund_amount::numeric > final_price::numeric) q) AS violations
UNION ALL
SELECT 'METIER' AS famille, 'montants stockés en texte non numériques' AS invariant, 'rien' AS tenu_par, (SELECT count(*) FROM (select id, tracking_id from appointments where base_price !~ '^[0-9]+\.[0-9]{2}$' or final_price !~ '^[0-9]+\.[0-9]{2}$' or (refund_amount is not null and refund_amount !~ '^[0-9]+\.[0-9]{2}$')) q) AS violations
UNION ALL
SELECT 'METIER' AS famille, 'tarif hors grille (100.00 / 150.00) ou nuit incohérente' AS invariant, 'code' AS tenu_par, (SELECT count(*) FROM (select id, tracking_id from appointments where not ((is_night_rate=0 and final_price='100.00') or (is_night_rate=1 and final_price='150.00'))) q) AS violations
UNION ALL
SELECT 'METIER' AS famille, 'rendez-vous annulé avec slot_key encore posé (créneau bloqué)' AS invariant, 'code' AS tenu_par, (SELECT count(*) FROM (select id, tracking_id from appointments where appointment_status='cancelled' and slot_key is not null) q) AS violations
UNION ALL
SELECT 'METIER' AS famille, 'rendez-vous actif (held/confirmed payé) sans slot_key (créneau non protégé)' AS invariant, 'code' AS tenu_par, (SELECT count(*) FROM (select id, tracking_id from appointments where ((appointment_status='held') or (appointment_status='confirmed' and payment_status='completed')) and slot_key is null) q) AS violations
UNION ALL
SELECT 'METIER' AS famille, 'maintien ''held'' sans échéance' AS invariant, 'code' AS tenu_par, (SELECT count(*) FROM (select id, tracking_id from appointments where appointment_status='held' and (hold_expires_at is null or payment_status<>'pending')) q) AS violations
UNION ALL
SELECT 'METIER' AS famille, 'maintien ''held'' expiré depuis plus de 24 h (nettoyage en retard)' AS invariant, 'code (cron)' AS tenu_par, (SELECT count(*) FROM (select id, tracking_id from appointments where appointment_status='held' and hold_expires_at < (now() at time zone 'UTC') - interval '24 hours') q) AS violations
UNION ALL
SELECT 'METIER' AS famille, 'deux rendez-vous sur la même session ou le même PaymentIntent Stripe' AS invariant, 'rien (pas d''unicité)' AS tenu_par, (SELECT count(*) FROM (select stripe_session_id as k, count(*) from appointments where stripe_session_id is not null group by 1 having count(*)>1 union all select stripe_payment_intent_id, count(*) from appointments where stripe_payment_intent_id is not null group by 1 having count(*)>1) q) AS violations
UNION ALL
SELECT 'METIER' AS famille, 'trous dans la numérotation des factures (par série)' AS invariant, 'code (MAX+1)' AS tenu_par, (SELECT count(*) FROM (select invoice_series, count(*) n, max(invoice_sequence) maxseq from appointment_invoices group by 1 having count(*) <> max(invoice_sequence)) q) AS violations
UNION ALL
SELECT 'METIER' AS famille, 'facture émise avant le paiement ou numéro mal formé' AS invariant, 'code' AS tenu_par, (SELECT count(*) FROM (select id, invoice_number from appointment_invoices where issued_at < paid_at - interval '1 minute' or invoice_number <> invoice_series || '-' || lpad(invoice_sequence::text, 6, '0')) q) AS violations
UNION ALL
SELECT 'METIER' AS famille, 'facture d''un rendez-vous jamais payé' AS invariant, 'code' AS tenu_par, (SELECT count(*) FROM (select i.id, i.invoice_number from appointment_invoices i join appointments a on a.id=i.appointment_id where a.payment_status not in ('completed','refunded')) q) AS violations
UNION ALL
SELECT 'FILE' AS famille, 'candidature ''queued'' sans aucune tâche d''analyse' AS invariant, 'code (backfill cron, quarantaine seulement)' AS tenu_par, (SELECT count(*) FROM (select a.id, a.tracking_id from cv_applications a where a.analysis_status in ('queued','extracting','analyzing') and not exists (select 1 from cv_processing_jobs j where j.application_id=a.id)) q) AS violations
UNION ALL
SELECT 'FILE' AS famille, 'document du coffre ''queued'' sans tâche d''analyse (catégorie analysable)' AS invariant, 'rien' AS tenu_par, (SELECT count(*) FROM (select d.id, d.category from candidate_documents d where d.analysis_status='queued' and d.category in ('medical_license','diploma','certificate','professional_insurance','employment_evidence') and not exists (select 1 from candidate_document_processing_jobs j where j.document_id=d.id and j.status in ('queued','retry','running'))) q) AS violations
UNION ALL
SELECT 'FILE' AS famille, 'destinataire de campagne resté ''queued'' > 10 min' AS invariant, 'rien' AS tenu_par, (SELECT count(*) FROM (select id, campaign_id from recruitment_campaign_recipients where delivery_status='queued' and created_at < (now() at time zone 'UTC') - interval '10 minutes') q) AS violations
UNION ALL
SELECT 'FILE' AS famille, 'campagne restée ''sending'' > 10 min' AS invariant, 'rien' AS tenu_par, (SELECT count(*) FROM (select id from recruitment_campaigns where status='sending' and created_at < (now() at time zone 'UTC') - interval '10 minutes') q) AS violations
UNION ALL
SELECT 'FILE' AS famille, 'recipient_count différent du nombre de destinataires' AS invariant, 'rien' AS tenu_par, (SELECT count(*) FROM (select c.id, c.recipient_count, (select count(*) from recruitment_campaign_recipients r where r.campaign_id=c.id) n from recruitment_campaigns c where c.recipient_count <> (select count(*) from recruitment_campaign_recipients r where r.campaign_id=c.id)) q) AS violations
UNION ALL
SELECT 'FILE' AS famille, 'tâche terminée sans finished_at / en cours sans started_at / tentatives > max' AS invariant, 'code' AS tenu_par, (SELECT count(*) FROM (select 'fulfillment' t, id from appointment_fulfillment_jobs where (status in ('completed','failed') and finished_at is null) or (status='running' and started_at is null) or attempts > max_attempts union all select 'cv', id from cv_processing_jobs where (job_status in ('completed','failed') and finished_at is null) or (job_status='running' and started_at is null) or attempts > max_attempts union all select 'doc', id from candidate_document_processing_jobs where (status in ('completed') and finished_at is null) or attempts > max_attempts) q) AS violations
UNION ALL
SELECT 'UNIQ' AS famille, 'client_brief_candidates en double (même mission, même candidat)' AS invariant, 'rien (select puis insert)' AS tenu_par, (SELECT count(*) FROM (select brief_id, application_id, count(*) from client_brief_candidates group by 1,2 having count(*)>1) q) AS violations
UNION ALL
SELECT 'UNIQ' AS famille, 'candidatures en double (même email, spécialité, CV)' AS invariant, 'code (select puis insert, CAND-19)' AS tenu_par, (SELECT count(*) FROM (select lower(email), lower(specialty), file_checksum, count(*) from cv_applications where file_checksum is not null group by 1,2,3 having count(*)>1) q) AS violations
UNION ALL
SELECT 'UNIQ' AS famille, 'documents du coffre en double (même compte, même empreinte)' AS invariant, 'rien' AS tenu_par, (SELECT count(*) FROM (select candidate_id, checksum, count(*) from candidate_documents group by 1,2 having count(*)>1) q) AS violations
UNION ALL
SELECT 'UNIQ' AS famille, 'plusieurs tâches d''analyse actives pour une candidature' AS invariant, 'code' AS tenu_par, (SELECT count(*) FROM (select application_id, count(*) from cv_processing_jobs where job_status in ('queued','retry','running') group by 1 having count(*)>1) q) AS violations
UNION ALL
SELECT 'UNIQ' AS famille, 'plusieurs tâches actives pour un document' AS invariant, 'rien' AS tenu_par, (SELECT count(*) FROM (select document_id, count(*) from candidate_document_processing_jobs where status in ('queued','retry','running') group by 1 having count(*)>1) q) AS violations
UNION ALL
SELECT 'UNIQ' AS famille, 'dates bloquées en double' AS invariant, 'rien' AS tenu_par, (SELECT count(*) FROM (select date, count(*) from blocked_dates group by 1 having count(*)>1) q) AS violations
UNION ALL
SELECT 'ETAT' AS famille, 'question médicale répondue/publiée sans date d''envoi' AS invariant, 'code' AS tenu_par, (SELECT count(*) FROM (select id, status from medical_questions where status in ('answered','published') and response_sent_at is null) q) AS violations
UNION ALL
SELECT 'ETAT' AS famille, 'question médicale avec réponse envoyée mais statut non répondu' AS invariant, 'rien (email puis update)' AS tenu_par, (SELECT count(*) FROM (select id, status from medical_questions where response_sent_at is not null and status not in ('answered','published')) q) AS violations
UNION ALL
SELECT 'ETAT' AS famille, 'question publiée sans consentement ou sans texte public' AS invariant, 'code' AS tenu_par, (SELECT count(*) FROM (select id from medical_questions where status='published' and (publication_consent<>1 or public_question is null or public_response is null)) q) AS violations
UNION ALL
SELECT 'ETAT' AS famille, 'compte candidat ''erased''/''disabled'' avec session active' AS invariant, 'code' AS tenu_par, (SELECT count(*) FROM (select c.id from candidate_accounts c join candidate_sessions s on s.candidate_id=c.id where c.status<>'active' and s.revoked_at is null and s.expires_at > (now() at time zone 'UTC')) q) AS violations
UNION ALL
SELECT 'ETAT' AS famille, 'demande RGPD ''completed'' sans date de réponse' AS invariant, 'code' AS tenu_par, (SELECT count(*) FROM (select id from gdpr_requests where status='completed' and response_date is null) q) AS violations
UNION ALL
SELECT 'MAJ' AS famille, 'appointments modifiés mais updatedAt = createdAt' AS invariant, 'rien (pas de \$onUpdate ni déclencheur)' AS tenu_par, (SELECT count(*) FROM (select id, tracking_id from appointments where "updatedAt" = "createdAt" and (cancelled_at is not null or refunded_at is not null or payment_status<>'pending' or appointment_status<>'held' or email_sent=1 or reminder_sent=1)) q) AS violations
UNION ALL
SELECT 'MAJ' AS famille, 'medical_questions modifiées mais updated_at = created_at' AS invariant, 'rien' AS tenu_par, (SELECT count(*) FROM (select id from medical_questions where updated_at = created_at and (status<>'submitted' or response_sent_at is not null)) q) AS violations
UNION ALL
SELECT 'MAJ' AS famille, 'candidate_documents modifiés mais updated_at = created_at' AS invariant, 'rien' AS tenu_par, (SELECT count(*) FROM (select id from candidate_documents where updated_at = created_at and (status<>'uploaded' or reviewed_at is not null or analyzed_at is not null)) q) AS violations
UNION ALL
SELECT 'MAJ' AS famille, 'cv_processing_jobs modifiées mais updated_at = created_at' AS invariant, 'rien' AS tenu_par, (SELECT count(*) FROM (select id from cv_processing_jobs where updated_at = created_at and (job_status<>'queued' or attempts>0)) q) AS violations
UNION ALL
SELECT 'MAJ' AS famille, 'gdpr_requests traitées mais updatedAt = createdAt' AS invariant, 'rien' AS tenu_par, (SELECT count(*) FROM (select id from gdpr_requests where "updatedAt" = "createdAt" and status<>'pending') q) AS violations
UNION ALL
SELECT 'MAJ' AS famille, 'candidate_document_processing_jobs modifiées mais updated_at = created_at' AS invariant, 'rien' AS tenu_par, (SELECT count(*) FROM (select id from candidate_document_processing_jobs where updated_at = created_at and (status<>'queued' or attempts>0)) q) AS violations
UNION ALL
SELECT 'ENUM', 'users.role hors liste', 'code (TypeScript)', (SELECT count(*) FROM "users" WHERE "role" NOT IN ('user','admin'))
UNION ALL
SELECT 'ENUM', 'gdpr_requests.request_type hors liste', 'code (TypeScript)', (SELECT count(*) FROM "gdpr_requests" WHERE "request_type" NOT IN ('access','rectification','deletion','portability','objection'))
UNION ALL
SELECT 'ENUM', 'gdpr_requests.status hors liste', 'code (TypeScript)', (SELECT count(*) FROM "gdpr_requests" WHERE "status" NOT IN ('pending','in_progress','completed','rejected'))
UNION ALL
SELECT 'ENUM', 'medical_questions.status hors liste', 'code (TypeScript)', (SELECT count(*) FROM "medical_questions" WHERE "status" NOT IN ('submitted','drafting','answered','published','rejected'))
UNION ALL
SELECT 'ENUM', 'testimonials.status hors liste', 'code (TypeScript)', (SELECT count(*) FROM "testimonials" WHERE "status" NOT IN ('pending','approved','rejected'))
UNION ALL
SELECT 'ENUM', 'appointments.payment_status hors liste', 'code (TypeScript)', (SELECT count(*) FROM "appointments" WHERE "payment_status" NOT IN ('pending','completed','failed','refunded'))
UNION ALL
SELECT 'ENUM', 'appointments.appointment_status hors liste', 'code (TypeScript)', (SELECT count(*) FROM "appointments" WHERE "appointment_status" NOT IN ('held','confirmed','cancelled','completed','no_show'))
UNION ALL
SELECT 'ENUM', 'appointment_fulfillment_jobs.job_type hors liste', 'code (TypeScript)', (SELECT count(*) FROM "appointment_fulfillment_jobs" WHERE "job_type" NOT IN ('owner','confirmation','invoice'))
UNION ALL
SELECT 'ENUM', 'appointment_fulfillment_jobs.status hors liste', 'code (TypeScript)', (SELECT count(*) FROM "appointment_fulfillment_jobs" WHERE "status" NOT IN ('queued','running','retry','completed','failed'))
UNION ALL
SELECT 'ENUM', 'cv_applications.file_validation_status hors liste', 'code (TypeScript)', (SELECT count(*) FROM "cv_applications" WHERE "file_validation_status" NOT IN ('quarantined','accepted','rejected','validation_failed'))
UNION ALL
SELECT 'ENUM', 'cv_applications.status hors liste', 'code (TypeScript)', (SELECT count(*) FROM "cv_applications" WHERE "status" NOT IN ('new','reviewing','shortlisted','placed','rejected','archived'))
UNION ALL
SELECT 'ENUM', 'cv_applications.analysis_status hors liste', 'code (TypeScript)', (SELECT count(*) FROM "cv_applications" WHERE "analysis_status" NOT IN ('queued','extracting','analyzing','completed','needs_review','failed'))
UNION ALL
SELECT 'ENUM', 'cv_candidate_certifications.source hors liste', 'code (TypeScript)', (SELECT count(*) FROM "cv_candidate_certifications" WHERE "source" NOT IN ('declared','extracted'))
UNION ALL
SELECT 'ENUM', 'cv_candidate_languages.proficiency hors liste', 'code (TypeScript)', (SELECT count(*) FROM "cv_candidate_languages" WHERE "proficiency" NOT IN ('basic','working','professional','fluent','native','unknown'))
UNION ALL
SELECT 'ENUM', 'cv_candidate_languages.source hors liste', 'code (TypeScript)', (SELECT count(*) FROM "cv_candidate_languages" WHERE "source" NOT IN ('declared','extracted'))
UNION ALL
SELECT 'ENUM', 'cv_candidate_experiences.employment_type hors liste', 'code (TypeScript)', (SELECT count(*) FROM "cv_candidate_experiences" WHERE "employment_type" NOT IN ('permanent','temporary','locum','internship','fellowship','rotation','volunteer','unknown'))
UNION ALL
SELECT 'ENUM', 'cv_processing_jobs.job_type hors liste', 'code (TypeScript)', (SELECT count(*) FROM "cv_processing_jobs" WHERE "job_type" NOT IN ('analyze_cv'))
UNION ALL
SELECT 'ENUM', 'cv_processing_jobs.job_status hors liste', 'code (TypeScript)', (SELECT count(*) FROM "cv_processing_jobs" WHERE "job_status" NOT IN ('queued','running','completed','retry','failed'))
UNION ALL
SELECT 'ENUM', 'cv_google_drive_export_jobs.status hors liste', 'code (TypeScript)', (SELECT count(*) FROM "cv_google_drive_export_jobs" WHERE "status" NOT IN ('queued','running','retry','completed','failed'))
UNION ALL
SELECT 'ENUM', 'recruitment_audit_logs.action hors liste', 'code (TypeScript)', (SELECT count(*) FROM "recruitment_audit_logs" WHERE "action" NOT IN ('download','reanalyze','erase','email','status_update','retention_cleanup','export','unsubscribe'))
UNION ALL
SELECT 'ENUM', 'client_briefs.brief_status hors liste', 'code (TypeScript)', (SELECT count(*) FROM "client_briefs" WHERE "brief_status" NOT IN ('new','reviewing','shortlist_sent','contract_signed','closed'))
UNION ALL
SELECT 'ENUM', 'client_brief_candidates.association_status hors liste', 'code (TypeScript)', (SELECT count(*) FROM "client_brief_candidates" WHERE "association_status" NOT IN ('suggested','reviewing','shortlisted','declined'))
UNION ALL
SELECT 'ENUM', 'recruitment_campaigns.language hors liste', 'code (TypeScript)', (SELECT count(*) FROM "recruitment_campaigns" WHERE "language" NOT IN ('fr','en'))
UNION ALL
SELECT 'ENUM', 'recruitment_campaigns.audience_mode hors liste', 'code (TypeScript)', (SELECT count(*) FROM "recruitment_campaigns" WHERE "audience_mode" NOT IN ('selected','all_eligible','filtered'))
UNION ALL
SELECT 'ENUM', 'recruitment_campaigns.status hors liste', 'code (TypeScript)', (SELECT count(*) FROM "recruitment_campaigns" WHERE "status" NOT IN ('draft','sending','sent','partially_sent','failed'))
UNION ALL
SELECT 'ENUM', 'recruitment_offer_templates.category hors liste', 'code (TypeScript)', (SELECT count(*) FROM "recruitment_offer_templates" WHERE "category" NOT IN ('europe','canada','middle_east','vvip_offshore','paramedical','general'))
UNION ALL
SELECT 'ENUM', 'recruitment_offer_templates.language hors liste', 'code (TypeScript)', (SELECT count(*) FROM "recruitment_offer_templates" WHERE "language" NOT IN ('fr','en'))
UNION ALL
SELECT 'ENUM', 'recruitment_campaign_recipients.delivery_status hors liste', 'code (TypeScript)', (SELECT count(*) FROM "recruitment_campaign_recipients" WHERE "delivery_status" NOT IN ('queued','sent','delivered','delayed','bounced','complained','failed','suppressed','skipped'))
UNION ALL
SELECT 'ENUM', 'recruitment_follow_up_tasks.kind hors liste', 'code (TypeScript)', (SELECT count(*) FROM "recruitment_follow_up_tasks" WHERE "kind" NOT IN ('follow_up_7','follow_up_14','custom'))
UNION ALL
SELECT 'ENUM', 'recruitment_follow_up_tasks.status hors liste', 'code (TypeScript)', (SELECT count(*) FROM "recruitment_follow_up_tasks" WHERE "status" NOT IN ('suggested','completed','dismissed'))
UNION ALL
SELECT 'ENUM', 'candidate_accounts.status hors liste', 'code (TypeScript)', (SELECT count(*) FROM "candidate_accounts" WHERE "status" NOT IN ('active','disabled','erased'))
UNION ALL
SELECT 'ENUM', 'candidate_documents.category hors liste', 'code (TypeScript)', (SELECT count(*) FROM "candidate_documents" WHERE "category" NOT IN ('identity_document','medical_license','diploma','certificate','professional_insurance','vaccination_record','criminal_record','employment_evidence','proof_of_address','other'))
UNION ALL
SELECT 'ENUM', 'candidate_documents.validation_status hors liste', 'code (TypeScript)', (SELECT count(*) FROM "candidate_documents" WHERE "validation_status" NOT IN ('quarantined','accepted','rejected','validation_failed'))
UNION ALL
SELECT 'ENUM', 'candidate_documents.malware_scan_status hors liste', 'code (TypeScript)', (SELECT count(*) FROM "candidate_documents" WHERE "malware_scan_status" NOT IN ('pending','clean','suspicious','unavailable'))
UNION ALL
SELECT 'ENUM', 'candidate_documents.status hors liste', 'code (TypeScript)', (SELECT count(*) FROM "candidate_documents" WHERE "status" NOT IN ('uploaded','validating','analyzing','needs_review','reviewed','rejected','archived'))
UNION ALL
SELECT 'ENUM', 'candidate_documents.analysis_status hors liste', 'code (TypeScript)', (SELECT count(*) FROM "candidate_documents" WHERE "analysis_status" NOT IN ('queued','extracting','analyzing','completed','needs_review','failed'))
UNION ALL
SELECT 'ENUM', 'candidate_document_processing_jobs.status hors liste', 'code (TypeScript)', (SELECT count(*) FROM "candidate_document_processing_jobs" WHERE "status" NOT IN ('queued','running','completed','retry','failed'))
UNION ALL
SELECT 'ENUM', 'candidate_document_audit_logs.actor_type hors liste', 'code (TypeScript)', (SELECT count(*) FROM "candidate_document_audit_logs" WHERE "actor_type" NOT IN ('candidate','admin','system'))
UNION ALL
SELECT 'ENUM', 'candidate_document_audit_logs.action hors liste', 'code (TypeScript)', (SELECT count(*) FROM "candidate_document_audit_logs" WHERE "action" NOT IN ('upload','download','view','analysis_requested','analysis_completed','reviewed','erased','login','logout'))
UNION ALL
SELECT 'ENUM', 'security_events.security_event_actor_kind hors liste', 'code (TypeScript)', (SELECT count(*) FROM "security_events" WHERE "security_event_actor_kind" NOT IN ('candidate','admin','anonymous','system'))
UNION ALL
SELECT 'ENUM', 'security_events.security_event_outcome hors liste', 'code (TypeScript)', (SELECT count(*) FROM "security_events" WHERE "security_event_outcome" NOT IN ('allowed','blocked','failed','alert'))
UNION ALL
SELECT 'ENUM', 'security_events.security_event_severity hors liste', 'code (TypeScript)', (SELECT count(*) FROM "security_events" WHERE "security_event_severity" NOT IN ('info','warning','high','critical'))
ORDER BY violations DESC;
