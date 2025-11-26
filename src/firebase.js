import firebase from "firebase/compat/app";
import "firebase/compat/storage"; // <-- Add this import if missing
import "firebase/compat/auth";
import "firebase/compat/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyD5kjO3UyzwP9HWOOumI93QVkZs8Nt8FeI",
  authDomain: "busify-46176.firebaseapp.com",
  projectId: "busify-46176",
  storageBucket: "busify-46176.appspot.com",
  messagingSenderId: "360233498712",
  appId: "1:360233498712:web:6b22555a07bf999bb0f22d",
  measurementId: "G-7QD5QHRHLP"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

export default firebase;
export const auth = firebase.auth();
export const firestore = firebase.firestore();
export const storage = firebase.storage();