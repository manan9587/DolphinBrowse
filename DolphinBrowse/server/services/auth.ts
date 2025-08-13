import admin from 'firebase-admin';

// Initialize Firebase Admin SDK only if credentials are available
const hasFirebaseCredentials = process.env.FIREBASE_PROJECT_ID && 
  process.env.FIREBASE_CLIENT_EMAIL && 
  process.env.FIREBASE_PRIVATE_KEY;

if (hasFirebaseCredentials && !admin.apps.length) {
  const serviceAccount = {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  };

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

export async function verifyFirebaseToken(idToken: string) {
  if (!hasFirebaseCredentials) {
    console.warn('Firebase credentials not configured, skipping token verification');
    // Return mock decoded token for development
    return { uid: 'dev-user', email: 'dev@example.com' };
  }
  
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    return decodedToken;
  } catch (error) {
    console.error('Error verifying Firebase token:', error);
    throw new Error('Invalid Firebase token');
  }
}

export async function getFirebaseUser(uid: string) {
  if (!hasFirebaseCredentials) {
    console.warn('Firebase credentials not configured, returning mock user');
    // Return mock user for development
    return { uid, email: 'dev@example.com', displayName: 'Dev User' };
  }
  
  try {
    const userRecord = await admin.auth().getUser(uid);
    return userRecord;
  } catch (error) {
    console.error('Error getting Firebase user:', error);
    throw new Error('Firebase user not found');
  }
}
