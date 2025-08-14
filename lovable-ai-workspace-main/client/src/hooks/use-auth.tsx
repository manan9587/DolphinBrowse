import { useState, useEffect, createContext, useContext } from 'react';
import { onAuthStateChange, signInWithGoogle, signOutUser } from '@/lib/firebase';
import { apiRequest } from '@/lib/queryClient';
import type { User } from '@shared/schema';

interface AuthContextType {
  user: User | null;
  firebaseUser: any;
  loading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  checkTrialUsage: () => Promise<any>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChange(async (firebaseUser) => {
      setFirebaseUser(firebaseUser);
      
      if (firebaseUser && firebaseUser.getIdToken) {
        try {
          // Get or create user in our database
          const token = await firebaseUser.getIdToken();
          const response = await apiRequest('POST', '/api/auth/verify', {
            token,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName,
            photoURL: firebaseUser.photoURL,
            firebaseUid: firebaseUser.uid,
          });
          
          const userData = await response.json();
          setUser(userData);
        } catch (error) {
          console.error('Error verifying user:', error);
          setUser(null);
        }
      } else {
        setUser(null);
      }
      
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const signIn = async () => {
    try {
      await signInWithGoogle();
    } catch (error) {
      console.error('Sign in error:', error);
      throw error;
    }
  };

  const signOut = async () => {
    try {
      await signOutUser();
      setUser(null);
      setFirebaseUser(null);
    } catch (error) {
      console.error('Sign out error:', error);
      throw error;
    }
  };

  const checkTrialUsage = async () => {
    if (!user) return null;
    
    try {
      const response = await apiRequest('GET', `/api/usage/${user.id}`);
      return await response.json();
    } catch (error) {
      console.error('Error checking trial usage:', error);
      return null;
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      firebaseUser,
      loading,
      signIn,
      signOut,
      checkTrialUsage,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
