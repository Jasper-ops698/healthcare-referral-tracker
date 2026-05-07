/**
 * MongoDB Connection Configuration — Atlas-Ready
 *
 * Connects to MongoDB Atlas with retry logic, TLS, and connection pooling.
 * Optimized for cloud deployment with the Healthcare Referral Tracker.
 */

import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error('[Startup] Missing required env var: MONGODB_URI');
}

export async function connectDatabase(): Promise<void> {
  const maxRetries = 5;
  let attempt = 0;

  // Mongoose 7+ handles Atlas TLS automatically for SRV URIs
  // No need to pass tls: true — it's inferred from +srv
  const options: mongoose.ConnectOptions = {
    maxPoolSize: 20,
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 45000,
    heartbeatFrequencyMS: 10000,
    // retryWrites and w=majority are in the URI
  };

  while (attempt < maxRetries) {
    try {
      await mongoose.connect(MONGODB_URI, options);

      const host = mongoose.connection.host;
      const dbName = mongoose.connection.name;
      console.log(`MongoDB Atlas connected: ${host} / ${dbName}`);

      // Listen for connection events
      mongoose.connection.on('error', (err) => {
        console.error('[MongoDB] Connection error:', err.message);
      });

      mongoose.connection.on('disconnected', () => {
        console.warn('[MongoDB] Disconnected — will attempt reconnect');
      });

      mongoose.connection.on('reconnected', () => {
        console.log('[MongoDB] Reconnected successfully');
      });

      return;
    } catch (err) {
      attempt++;
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
      console.error(
        `[MongoDB] Connection attempt ${attempt}/${maxRetries} failed: ${errorMessage}. Retrying in ${delay}ms...`
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw new Error(`Failed to connect to MongoDB Atlas after ${maxRetries} attempts`);
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
  console.log('MongoDB disconnected');
}
