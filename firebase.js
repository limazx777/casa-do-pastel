import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyD0481kpEMeiYEchmPbRd6_yRPaBfbClSs",
  authDomain: "casa-do-pastel-9f3ab.firebaseapp.com",
  projectId: "casa-do-pastel-9f3ab",
  storageBucket: "casa-do-pastel-9f3ab.firebasestorage.app",
  messagingSenderId: "834087157234",
  appId: "1:834087157234:web:5335ef18e1a43364ebff6b",
  measurementId: "G-JBX8R184ZK"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);