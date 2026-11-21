import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  type Auth,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

let cachedApp: FirebaseApp | null = null;
let cachedAuth: Auth | null = null;

function getFirebaseAuthInstance(): Auth {
  if (!firebaseConfig?.projectId || firebaseConfig.projectId === 'remixed-project-id') {
    throw new Error('Konfigurasi Firebase belum disiapkan untuk login Google.');
  }
  if (!cachedApp) {
    cachedApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
  }
  if (!cachedAuth) {
    cachedAuth = getAuth(cachedApp);
  }
  return cachedAuth;
}

export async function signInWithGoogleForAdmin(): Promise<{
  idToken: string;
  email: string;
  displayName: string;
}> {
  const auth = getFirebaseAuthInstance();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  const credential = await signInWithPopup(auth, provider);
  const idToken = await credential.user.getIdToken();
  return {
    idToken,
    email: credential.user.email || '',
    displayName: credential.user.displayName || 'Administrator',
  };
}

export async function signOutFirebaseAdmin(): Promise<void> {
  try {
    if (!firebaseConfig?.projectId || firebaseConfig.projectId === 'remixed-project-id') {
      return;
    }
    const auth = getFirebaseAuthInstance();
    if (auth.currentUser) {
      await signOut(auth);
    }
  } catch {
    // ignore cleanup errors if Firebase is uninitialized
  }
}
