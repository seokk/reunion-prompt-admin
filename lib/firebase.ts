
import { initializeApp, getApps } from 'firebase/app';
import { getFunctions } from 'firebase/functions';

const firebaseConfig = {
  projectId: "reunion-admin",
  appId: "1:456808386888:web:18d37ae4b07983cbe1637d",
  storageBucket: "reunion-admin.appspot.com",
  apiKey: "AIzaSyB_q1enzXV0L2OvZ57DNqRai-dv7fRkCgU",
  authDomain: "reunion-admin.firebaseapp.com",
  messagingSenderId: "456808386888",
};

// Initialize Firebase
// We check if apps is empty to prevent re-initializing the app on hot reloads.
const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const functions = getFunctions(app);

export { app, functions };
