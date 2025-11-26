import React, { useState } from "react";
import Login from "./components/Auth/Login";
import PassengerDashboard from "./components/Dashboard/PassengerDashboard";
import DriverDashboard from "./components/Dashboard/DriverDashboard";
import ConductorDashboard from "./components/Dashboard/ConductorDashboard";
import AdminDashboard from "./components/Dashboard/AdminDashboard";

const App = () => {
  const [role, setRole] = useState("");
  const [uid, setUid] = useState("");

  const handleLogin = (userRole, userId) => {
    setRole(userRole);
    setUid(userId);
  };

  return (
    <div>
      {!role ? (
        <Login onLogin={handleLogin} />
      ) : role === "passenger" ? (
        <PassengerDashboard userId={uid} />
      ) : role === "driver" ? (
        <DriverDashboard userId={uid} />
      ) : role === "conductor" ? (
        <ConductorDashboard userId={uid} />
      ) : (
        <AdminDashboard userId={uid} />
      )}
    </div>
  );
};

export default App;
