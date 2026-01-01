import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore"; 

const firebaseConfig = {
  apiKey: "AIzaSyC3R_KmkA2IihzLzb8k4_utjvs1pPlci20",
  authDomain: "quiz-global-v2.firebaseapp.com",
  projectId: "quiz-global-v2",
  storageBucket: "quiz-global-v2.firebasestorage.app",
  messagingSenderId: "740481238810",
  appId: "1:740481238810:web:e41452b2fc45aa4ee30ea3",
  measurementId: "G-PF311NFWCK"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);