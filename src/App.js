import React, { useState, useEffect } from "react";
import Splash from "./components/Splash";
import Login from "./components/Auth/Login";
import PassengerDashboard from "./components/Dashboard/PassengerDashboard";
import DriverDashboard from "./components/Dashboard/DriverDashboard";
import ConductorDashboard from "./components/Dashboard/ConductorDashboard";
import AdminDashboard from "./components/Dashboard/AdminDashboard";

function App() {
  // Splash screen state
  const [showSplash, setShowSplash] = useState(true);

  // User authentication/session state
  const [loggedIn, setLoggedIn] = useState(false);
  const [user, setUser] = useState(null);

  // Splash screen timer
  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 3000);
    return () => clearTimeout(timer);
  }, []);

  // Persist login session (optional)
  // You can persist via localStorage/sessionStorage if you want:
  useEffect(() => {
    // On load, check storage
    const session = window.localStorage.getItem("busifyUser");
    if (session) {
      setUser(JSON.parse(session));
      setLoggedIn(true);
    }
  }, []);

  useEffect(() => {
    // Whenever user changes, save to storage
    if (loggedIn && user) {
      window.localStorage.setItem("busifyUser", JSON.stringify(user));
    } else {
      window.localStorage.removeItem("busifyUser");
    }
  }, [loggedIn, user]);

  // Logout handler (call from dashboard nav if you want a logout button!)
  const handleLogout = () => {
    setLoggedIn(false);
    setUser(null);
    window.localStorage.removeItem("busifyUser");
  };

  // Splash screen
  if (showSplash) return <Splash />;

  // Login page
  if (!loggedIn) {
    return (
      <Login
        onLoginSuccess={u => {
          setLoggedIn(true);
          setUser(u); // expects user object with a role field
        }}
      />
    );
  }

  // After login, show dashboard according to user role
  // Default to passenger if "role" is undefined
  switch (user?.role) {
    case "driver":
      return <DriverDashboard user={user} onLogout={handleLogout} />;
    case "conductor":
      return <ConductorDashboard user={user} onLogout={handleLogout} />;
    case "admin":
      return <AdminDashboard user={user} onLogout={handleLogout} />;
    default:
      return <PassengerDashboard user={user} onLogout={handleLogout} />;
  }
}

export default App;