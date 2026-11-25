import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getAuth, type Auth } from 'firebase/auth';
import { isFirebaseConfigReady, type FirebasePlaceholderConfig } from './utils/config';

/**
 * Moodist Hastanesi VR Terapi Deneyimi — Firebase Yapılandırması
 */
export const firebaseConfig: FirebasePlaceholderConfig = {
  apiKey: 'AIzaSyD7CZPCe09e4iCfR1zynMY7DLncdIjiry0',
  authDomain: 'moodist-vr-sira.firebaseapp.com',
  projectId: 'moodist-vr-sira',
  storageBucket: 'moodist-vr-sira.firebasestorage.app',
  messagingSenderId: '688755396664',
  appId: '1:688755396664:web:365fc7869be9a2a8aeef25',
};

export const isFirebaseConfigured = isFirebaseConfigReady(firebaseConfig);

let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let auth: Auth | null = null;

if (isFirebaseConfigured) {
  app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);
}

export { app, db, auth };