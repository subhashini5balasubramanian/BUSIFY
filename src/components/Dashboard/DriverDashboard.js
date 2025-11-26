import React, { useState, useEffect } from "react";
import { firestore } from "../../firebase";

function DriverDashboard({ user, onLogout }) {
  const [tab, setTab] = useState("schedule");
  const [busNumber, setBusNumber] = useState(""); // get from user profile or assignment
  const [busInfo, setBusInfo] = useState(null);
  const [lostItems, setLostItems] = useState([]);
  const [sosAlerts, setSosAlerts] = useState([]);
  const [gpsActive, setGpsActive] = useState(false);

  // Fetch bus schedule/info on mount
  useEffect(() => {
    // Fetch assigned bus number for this user; here, assume it's part of user object
    const assignedBus = user?.busNumber || "";
    setBusNumber(assignedBus);

    // Get bus info
    if (assignedBus) {
      firestore.collection("buses").doc(assignedBus).get().then(snapshot => {
        setBusInfo(snapshot.data());
      }).catch(() => setBusInfo(null));

      // Get lost items for this bus
      firestore.collection("lost_items").where("busNumber", "==", assignedBus)
        .orderBy("timestamp", "desc")
        .get().then(snapshot => {
          setLostItems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        }).catch(() => setLostItems([]));

      // Get SOS alerts for this bus
      firestore.collection("sos_alerts").where("busNumber", "==", assignedBus)
        .orderBy("timestamp", "desc")
        .get().then(snapshot => {
          setSosAlerts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        }).catch(() => setSosAlerts([]));
    }
  }, [user]);

  // Handle GPS tracking start
  const startGPS = () => {
    setGpsActive(true);
    // Use browser geolocation API
    if ("geolocation" in navigator && busNumber) {
      navigator.geolocation.watchPosition(pos => {
        // Save latest location to Firestore under busNumber
        firestore.collection("gps_locations").doc(busNumber).set({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          timestamp: new Date()
        }, { merge: true });
      }, err => {
        console.warn("GPS error:", err);
      });
    } else if (!busNumber) {
      alert("No assigned bus number available to track.");
      setGpsActive(false);
    }
  };

  return (
    <div className="dashboard-bg" style={{ padding: 16 }}>
      {/* Top bar with title + logout */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div>
          <h2 style={{ margin: 0, color: "#ff8800" }}>Driver Dashboard</h2>
          <div style={{ fontSize: 13, color: "#666" }}>{user?.email || "Driver"}</div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ textAlign: "right", marginRight: 8 }}>
            <div style={{ fontSize: 13, color: "#333" }}>{busNumber ? `Bus: ${busNumber}` : "No bus assigned"}</div>
          </div>
          <button
            onClick={() => {
              if (typeof onLogout === "function") onLogout();
              else console.warn("onLogout not provided");
            }}
            style={{
              background: "linear-gradient(90deg,#ff8800,#ffb86b)",
              border: "none",
              color: "#fff",
              padding: "8px 12px",
              borderRadius: 8,
              cursor: "pointer",
              fontWeight: 700
            }}
          >
            Logout
          </button>
        </div>
      </div>

      {/* Tabs */}
      <nav className="bottom-bar-new" style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button onClick={() => setTab("schedule")} className={tab === "schedule" ? "active" : ""}>Schedule</button>
        <button onClick={() => setTab("lost")} className={tab === "lost" ? "active" : ""}>Lost & Found</button>
        <button onClick={() => setTab("sos")} className={tab === "sos" ? "active" : ""}>SOS Alerts</button>
        <button onClick={() => setTab("gps")} className={tab === "gps" ? "active" : ""}>GPS</button>
      </nav>

      {/* Schedule Tab */}
      {tab === "schedule" && (
        <div>
          <h3>Your Bus Schedule</h3>
          {busInfo ? (
            <div>
              <div><b>Bus Number:</b> {busNumber}</div>
              <div><b>Route:</b> {busInfo.route}</div>
              <div><b>Departure Time:</b> {busInfo.departureTime}</div>
              <div><b>Arrival Time:</b> {busInfo.arrivalTime}</div>
              {/* Add more info as per your data */}
            </div>
          ) : <div>No bus info found.</div>}
        </div>
      )}

      {/* Lost & Found Tab */}
      {tab === "lost" && (
        <div style={{ marginTop: 8 }}>
          <h3>Lost & Found for Bus {busNumber || "-"}</h3>
          <ul style={{ paddingLeft: 16 }}>
            {lostItems.length === 0 ? <li>No lost items.</li> : lostItems.map(item => (
              <li key={item.id} style={{ marginBottom: 12 }}>
                <b>{item.name}</b> - {item.desc} ({item.importance})<br />
                Reported by: {item.user}
                {item.photo && <div><img src={item.photo} alt="lost" style={{ maxWidth: 120, marginTop: 6 }} /></div>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* SOS Alerts Tab */}
      {tab === "sos" && (
        <div style={{ marginTop: 8 }}>
          <h3>SOS Alerts for Bus {busNumber || "-"}</h3>
          <ul style={{ paddingLeft: 16 }}>
            {sosAlerts.length === 0 ? <li>No SOS alerts.</li> : sosAlerts.map(alert => (
              <li key={alert.id} style={{ marginBottom: 12 }}>
                <b>{alert.message}</b>
                <div>Passenger: {alert.passengerId || alert.createdBy || "-"}</div>
                <div>Time: {alert.timestamp && alert.timestamp.seconds ? new Date(alert.timestamp.seconds * 1000).toLocaleString() : (alert.timestamp ? new Date(alert.timestamp).toLocaleString() : "-")}</div>
                {alert.location && <div>Location: {alert.location.lat}, {alert.location.lng}</div>}
                {/* Optionally add ack button and mark as handled */}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* GPS Tab */}
      {tab === "gps" && (
        <div style={{ marginTop: 8 }}>
          <h3>Bus GPS Tracking</h3>
          <button
            onClick={startGPS}
            disabled={gpsActive}
            style={{
              background: gpsActive ? "#ccc" : "linear-gradient(90deg,#33aaff,#66cfff)",
              border: "none",
              color: "#fff",
              padding: "8px 12px",
              borderRadius: 8,
              cursor: gpsActive ? "default" : "pointer",
              fontWeight: 700
            }}
          >
            {gpsActive ? "GPS Active" : "Start GPS"}
          </button>
          {gpsActive && <div style={{ marginTop: 8 }}>GPS tracking is active!</div>}
        </div>
      )}
    </div>
  );
}

export default DriverDashboard;