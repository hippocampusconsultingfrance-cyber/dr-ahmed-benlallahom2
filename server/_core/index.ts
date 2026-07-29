import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  
  // Stripe Webhook (MUST be before express.json() to receive raw body)
  app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
    const sig = req.headers["stripe-signature"] as string;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";
    
    try {
      const Stripe = (await import("stripe")).default;
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");
      
      const event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
      
      if (event.id.startsWith("evt_test_")) {
        return res.json({ verified: true });
      }
      
      if (event.type === "checkout.session.completed") {
        const session = event.data.object as any;
        console.log("Payment successful:", session.id);
        
        // Update appointment payment status
        try {
          const { drizzle } = await import("drizzle-orm/mysql2");
          const { appointments } = await import("../../drizzle/schema");
          const { eq } = await import("drizzle-orm");
          
          const db = drizzle(process.env.DATABASE_URL!);
          const trackingId = session.metadata?.trackingId;
          
          if (trackingId) {
            await db
              .update(appointments)
              .set({
                paymentStatus: "completed",
                stripePaymentIntentId: session.payment_intent as string,
              })
              .where(eq(appointments.trackingId, trackingId));
            
            console.log(`Payment confirmed for appointment: ${trackingId}`);
            
            // Send notifications AFTER payment is confirmed
            try {
              const { sendConfirmationEmail, sendCustomerConfirmationSMS, sendOwnerNotificationEmail, sendOwnerNotificationSMS } = await import("./notifications");
              
              // Fetch appointment details
              const appointmentResult = await db.select().from(appointments).where(eq(appointments.trackingId, trackingId)).limit(1);
              const appointment = appointmentResult[0];
              
              if (appointment) {
                const finalPriceNum = parseFloat(appointment.finalPrice);
                
                sendConfirmationEmail(
                  appointment.customerEmail,
                  appointment.customerName,
                  trackingId,
                  appointment.appointmentDate,
                  finalPriceNum,
                  appointment.requestDetails
                ).catch(console.error);

                sendCustomerConfirmationSMS(
                  appointment.customerPhone,
                  trackingId,
                  appointment.appointmentDate
                ).catch(console.error);

                sendOwnerNotificationEmail(
                  appointment.customerName,
                  appointment.customerEmail,
                  appointment.customerPhone,
                  trackingId,
                  appointment.appointmentDate,
                  finalPriceNum,
                  appointment.requestDetails
                ).catch(console.error);

                sendOwnerNotificationSMS(
                  appointment.customerName,
                  appointment.customerPhone,
                  trackingId,
                  appointment.appointmentDate,
                  finalPriceNum
                ).catch(console.error);

                // Generate and send invoice PDF
                try {
                  const { generateInvoicePDF } = await import("../invoice");
                  const { sendInvoiceEmail } = await import("./notifications");
                  
                  const basePriceNum = parseFloat(appointment.basePrice);
                  const invoiceResult = await generateInvoicePDF({
                    trackingId,
                    customerName: appointment.customerName,
                    customerEmail: appointment.customerEmail,
                    customerPhone: appointment.customerPhone,
                    appointmentDate: appointment.appointmentDate,
                    consultationType: appointment.consultationType || "Conseil en santé",
                    duration: appointment.duration || 30,
                    basePrice: basePriceNum,
                    finalPrice: finalPriceNum,
                    isNightRate: appointment.isNightRate === 1,
                    paymentDate: new Date(),
                  });
                  
                  console.log(`Invoice generated for ${trackingId}: ${invoiceResult.key}`);
                  
                  // Send invoice by email
                  await sendInvoiceEmail(
                    appointment.customerEmail,
                    appointment.customerName,
                    trackingId,
                    finalPriceNum,
                    invoiceResult.buffer
                  );
                  
                  console.log(`Invoice sent by email to ${appointment.customerEmail}`);
                } catch (invoiceError) {
                  console.error("Failed to generate/send invoice:", invoiceError);
                }
              }
            } catch (notificationError) {
              console.error("Failed to send notifications after payment:", notificationError);
            }
          }
        } catch (error) {
          console.error("Failed to update appointment after payment:", error);
        }
      }
      
      res.json({ received: true });
    } catch (error) {
      console.error("Webhook error:", error);
      res.status(400).send(`Webhook Error: ${error}`);
    }
  });
  
  // Configure body parser with larger size limit for file uploads (after Stripe webhook)
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
