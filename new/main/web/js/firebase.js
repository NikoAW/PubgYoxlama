import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
const firebaseConfig = {
  apiKey: "AIzaSyCxa7zztM31ivdmqMf_DgjQVne9E1Dnbis",
  authDomain: "itemshop-52277.firebaseapp.com",
  projectId: "itemshop-52277",
  databaseURL: "https://itemshop-52277-default-rtdb.firebaseio.com/",
  appId: "1:662400370074:web:b0eb00976c813afce1e623"
};
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);
const f = getFunctions(app);
export const call = (name, data) => httpsCallable(f, name)(data || {}).then(r => r.data);
