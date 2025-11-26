import React, { useState } from "react";
import { auth, firestore } from "../../firebase";
import "../../App.css";

const Login = ({ onLoginSuccess }) => {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // ---- UPDATED LOGIN HANDLER ----
  const handleLogin = async e => {
    e.preventDefault();
    setError(""); setSuccess("");
    try {
      // Authenticate
      const res = await auth.signInWithEmailAndPassword(email, password);

      // Fetch user profile from Firestore (including role, busNumber)
      const userDoc = await firestore.collection("users").doc(res.user.uid).get();
      const userData = userDoc.data() || {};
      const userObj = {
        uid: res.user.uid,
        email: res.user.email,
        ...userData  // role, busNumber, etc.
      };

      setSuccess("Login successful!");
      if (onLoginSuccess) onLoginSuccess(userObj);
    } catch (err) {
      setError(err.message);
    }
  };

  // Registration handler (same as you had)
  const handleRegister = async e => {
    e.preventDefault();
    setError(""); setSuccess("");
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    try {
      const res = await auth.createUserWithEmailAndPassword(email, password);
      await firestore.collection("users").doc(res.user.uid).set({
        email,
        role: "passenger"  // Default, admin must update role in Firebase Console
      });
      setSuccess("Registration successful! You can now log in.");
      setIsRegister(false); setEmail(""); setPassword(""); setConfirm("");
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="login-card">
      <h2 style={{ color: "#ff8800" }}>{isRegister ? "Register" : "Login"} to Busify</h2>
      <form onSubmit={isRegister ? handleRegister : handleLogin}>
        <input
          type="email"
          placeholder="Email"
          autoFocus
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
        />
        {isRegister && (
          <input
            type="password"
            placeholder="Confirm Password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            required
          />
        )}
        <button type="submit" style={{background: "#ff8800", color: "#fff"}}>
          {isRegister ? "Register" : "Login"}
        </button>
      </form>
      {error && <div style={{ color: "#d32f2f", marginTop: "1em" }}>{error}</div>}
      {success && <div style={{ color: "#388e3c", marginTop: "1em" }}>{success}</div>}
      <div style={{marginTop: "1.2em"}}>
        {isRegister ? (
          <span>
            Already have an account?{" "}
            <button type="button" style={{
              color: "#ff8800", background: "none", border: "none", cursor: "pointer"
            }} onClick={() => { setIsRegister(false); setError(""); }}>
              Login
            </button>
          </span>
        ) : (
          <span>
            Don't have an account?{" "}
            <button type="button" style={{
              color: "#ff8800", background: "none", border: "none", cursor: "pointer"
            }} onClick={() => { setIsRegister(true); setError(""); }}>
              Register
            </button>
          </span>
        )}
      </div>
    </div>
  );
};

export default Login;