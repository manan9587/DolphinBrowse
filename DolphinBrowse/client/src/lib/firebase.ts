import { initializeApp } from "firebase/app";
import { getAuth, signInWithRedirect, GoogleAuthProvider, getRedirectResult, signOut, onAuthStateChanged } from "firebase/auth";

// Check if Firebase credentials are available
const hasFirebaseConfig = !!(
  import.meta.env.VITE_FIREBASE_API_KEY && 
  import.meta.env.VITE_FIREBASE_PROJECT_ID && 
  import.meta.env.VITE_FIREBASE_APP_ID
);

const firebaseConfig = hasFirebaseConfig ? {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: `${import.meta.env.VITE_FIREBASE_PROJECT_ID}.firebaseapp.com`,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: `${import.meta.env.VITE_FIREBASE_PROJECT_ID}.firebasestorage.app`,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
} : {
  // Fallback config for development
  apiKey: "dev-api-key",
  authDomain: "dev.firebaseapp.com",
  projectId: "dev-project",
  storageBucket: "dev-project.firebasestorage.app",
  appId: "dev-app-id",
};

let app: any;
let auth: any;

if (hasFirebaseConfig) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
} else {
  console.warn('Firebase credentials not configured, using mock auth for development');
  // Create mock auth object for development
  auth = {
    currentUser: null,
    onAuthStateChanged: (callback: any) => {
      // Simulate no user logged in
      setTimeout(() => callback(null), 100);
      return () => {}; // unsubscribe function
    }
  };
}

export { auth };

const provider = hasFirebaseConfig ? new GoogleAuthProvider() : null;

export function signInWithGoogle() {
  if (!hasFirebaseConfig || !provider) {
    console.warn('Firebase not configured, cannot sign in');
    return Promise.resolve();
  }
  return signInWithRedirect(auth, provider);
}

export function handleRedirectResult() {
  if (!hasFirebaseConfig) {
    return Promise.resolve(null);
  }
  return getRedirectResult(auth);
}

export function signOutUser() {
  if (!hasFirebaseConfig) {
    return Promise.resolve();
  }
  return signOut(auth);
}

export function onAuthStateChange(callback: (user: any) => void) {
  if (!hasFirebaseConfig) {
    return auth.onAuthStateChanged(callback);
  }
  return onAuthStateChanged(auth, callback);
}
