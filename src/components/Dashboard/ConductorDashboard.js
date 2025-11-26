import React from "react";

const ConductorDashboard = ({ userId }) => {
  return (
    <div>
      <h2>Conductor Dashboard</h2>
      <p>Welcome! Your UID is: {userId}</p>
      {/* Add more conductor features here */}
    </div>
  );
};

export default ConductorDashboard;