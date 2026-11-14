# Implementation Notes

## Remaining Items to Complete

### Admin Blog UI (in AdminDashboard.tsx)
- Need to add a tab for blog management with create/edit/delete/publish functionality
- Admin procedures already exist: admin.blog.list, admin.blog.create, admin.blog.update, admin.blog.delete

### BookingPage Availability Integration
- Need to integrate trpc.availability.getSlots, trpc.availability.getBlockedDates, trpc.availability.getBookedSlots
- Show available time slots based on day of week
- Disable blocked dates in the date picker
- Show which time slots are already booked

### Mode Clair/Sombre
- ThemeProvider already exists in App.tsx with defaultTheme="dark"
- Need to add a toggle button in Navigation
- Theme context already has toggleTheme function

### Facture PDF Link in Email
- Currently invoice PDF is sent as attachment via webhook in server/_core/index.ts
- Need to upload PDF to S3 and include download link in email body

### Rappel 24h (Heartbeat)
- Need to read /home/ubuntu/skills/webdev-periodic-updates/SKILL.md
- Use heartbeat to check appointments 24h before and send reminder email

## Key Architecture Notes
- Resend API is used for emails (RESEND_API_KEY configured)
- notifyOwner() sends push notifications to the owner
- Stripe webhook handles payment confirmation at /api/stripe/webhook
- Admin procedures use adminProcedure (checks ctx.user.role === 'admin')
- Blog table: blog_posts with slug, title, excerpt, content, coverImage, category, language, source, published
- Availability tables: availability_slots (dayOfWeek, startTime, endTime), blocked_dates (date, reason)
