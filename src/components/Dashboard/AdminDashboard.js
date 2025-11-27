import React, { useEffect, useState, useMemo } from "react";
import "../../App.css"; // <-- added: use the shared CSS used by PassengerDashboard
import 'chart.js/auto'; // ensures ChartJS components (scales/elements/controllers) are registered
import { Bar, Pie, Line, Doughnut } from "react-chartjs-2";
import { firestore } from "../../firebase";

/*
  AdminDashboard — updated per request
  - Bottom navigation bar is centered and visually prominent (fixed in bottom center, elevated card style)
  - Removed the Radar chart for "Lost Items by Importance" and replaced it with a horizontal Bar chart
  - Kept other charts and existing functionality
*/

const TABS = [
  { key: "overview", label: "Overview", emoji: "📊" },
  { key: "sos", label: "SOS Alerts", emoji: "🚨" },
  { key: "drivers", label: "Drivers", emoji: "🧑‍✈️" },
  { key: "lost", label: "Lost Items", emoji: "🎒" },
  { key: "buses", label: "Buses", emoji: "🚌" },
  { key: "passengers", label: "Passengers", emoji: "👥" }
];

function AdminDashboard({ onLogout }) {
  const [tab, setTab] = useState("overview");
  const [loading, setLoading] = useState(true);

  // Data containers
  const [buses, setBuses] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [passengers, setPassengers] = useState([]);
  const [lostItems, setLostItems] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [sosAlerts, setSosAlerts] = useState([]);

  // Fetch all data once on mount
  useEffect(() => {
    let mounted = true;
    async function fetchAll() {
      setLoading(true);
      try {
        const [bSnap, dSnap, pSnap, lSnap, bkgSnap, sSnap] = await Promise.all([
          firestore.collection("buses").get(),
          firestore.collection("users").where("role", "==", "driver").get(),
          firestore.collection("users").where("role", "==", "passenger").get(),
          firestore.collection("lost_items").orderBy("timestamp", "desc").get(),
          firestore.collection("bookings").get(),
          firestore.collection("sos_alerts").orderBy("timestamp", "desc").get(),
        ]);

        if (!mounted) return;

        setBuses(bSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setDrivers(dSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setPassengers(pSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setLostItems(lSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setBookings(bkgSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setSosAlerts(sSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error("Failed to fetch admin data:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    fetchAll();
    return () => { mounted = false; };
  }, []);

  // Utility: safe date key (YYYY-MM-DD) from various timestamp formats
  const dateKeyFromRecord = (rec) => {
    if (!rec) return null;
    const possible = rec.timestamp || rec.createdAt || rec.time || rec.date;
    if (!possible) return null;
    try {
      // Firestore Timestamp -> has toDate()
      if (typeof possible.toDate === "function") {
        const d = possible.toDate();
        return d.toISOString().slice(0, 10);
      }
      // string or number
      const d = new Date(possible);
      if (isNaN(d)) return null;
      return d.toISOString().slice(0, 10);
    } catch {
      return null;
    }
  };

  // --- Derived analytics (useMemo for stability) ---
  const sosCountPerBus = useMemo(() => {
    const m = {};
    sosAlerts.forEach(a => {
      const bn = a.busNumber || a.bus || "unknown";
      m[bn] = (m[bn] || 0) + 1;
    });
    return m;
  }, [sosAlerts]);

  const lostCountPerBus = useMemo(() => {
    const m = {};
    lostItems.forEach(i => {
      const bn = i.busNumber || i.bus || "unknown";
      m[bn] = (m[bn] || 0) + 1;
    });
    return m;
  }, [lostItems]);

  const bookingCountPerBus = useMemo(() => {
    const m = {};
    bookings.forEach(b => {
      const bn = b.busNumber || b.bus || "unknown";
      m[bn] = (m[bn] || 0) + 1;
    });
    return m;
  }, [bookings]);

  const statusCounts = useMemo(() => {
    const m = {};
    buses.forEach(b => {
      const s = b.status || "unspecified";
      m[s] = (m[s] || 0) + 1;
    });
    return m;
  }, [buses]);

  // Unified bus labels set
  const busLabels = useMemo(() => {
    const set = new Set([
      ...Object.keys(sosCountPerBus),
      ...Object.keys(lostCountPerBus),
      ...Object.keys(bookingCountPerBus),
      ...buses.map(b => b.id),
    ]);
    return Array.from(set).sort((a, b) => String(a).localeCompare(String(b)));
  }, [sosCountPerBus, lostCountPerBus, bookingCountPerBus, buses]);

  // Chart datasets
  const sosBarData = useMemo(() => ({
    labels: busLabels,
    datasets: [{ label: "SOS Alerts", backgroundColor: "#ff8800", data: busLabels.map(l => sosCountPerBus[l] || 0) }]
  }), [busLabels, sosCountPerBus]);

  const lostBarData = useMemo(() => ({
    labels: busLabels,
    datasets: [{ label: "Lost Items", backgroundColor: "#ff8800", data: busLabels.map(l => lostCountPerBus[l] || 0) }]
  }), [busLabels, lostCountPerBus]);

  const bookingsBarData = useMemo(() => ({
    labels: busLabels,
    datasets: [{ label: "Bookings", backgroundColor: "#ff8800", data: busLabels.map(l => bookingCountPerBus[l] || 0) }]
  }), [busLabels, bookingCountPerBus]);

  const statusPieData = useMemo(() => ({
    labels: Object.keys(statusCounts),
    datasets: [{
      label: "Status",
      backgroundColor: ["#ff8800", "#111111", "#ffffff", "#d32f2f", "#33aaff"].slice(0, Math.max(1, Object.keys(statusCounts).length)),
      data: Object.values(statusCounts)
    }]
  }), [statusCounts]);

  // Additional chart data: time series for last 7 days (bookings, sos)
  const lastNDaysLabels = useMemo((n = 7) => {
    const arr = [];
    const today = new Date();
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      arr.push(d.toISOString().slice(0, 10));
    }
    return arr;
  }, []);

  const bookingsByDate = useMemo(() => {
    const counts = {};
    bookings.forEach(b => {
      const k = dateKeyFromRecord(b);
      if (k) counts[k] = (counts[k] || 0) + 1;
    });
    return lastNDaysLabels.map(lbl => counts[lbl] || 0);
  }, [bookings, lastNDaysLabels]);

  const sosByDate = useMemo(() => {
    const counts = {};
    sosAlerts.forEach(s => {
      const k = dateKeyFromRecord(s);
      if (k) counts[k] = (counts[k] || 0) + 1;
    });
    return lastNDaysLabels.map(lbl => counts[lbl] || 0);
  }, [sosAlerts, lastNDaysLabels]);

  const lostImportanceCounts = useMemo(() => {
    const m = {};
    lostItems.forEach(i => {
      const k = i.importance || "unspecified";
      m[k] = (m[k] || 0) + 1;
    });
    return {
      labels: Object.keys(m),
      data: Object.values(m)
    };
  }, [lostItems]);

  // Replace Radar with a horizontal Bar for lost item importance
  const lostImportanceBarData = useMemo(() => ({
    labels: lostImportanceCounts.labels,
    datasets: [{
      label: "Lost Items",
      backgroundColor: "#d32f2f",
      data: lostImportanceCounts.data
    }]
  }), [lostImportanceCounts]);

  const lineBookingsData = useMemo(() => ({
    labels: lastNDaysLabels,
    datasets: [{
      label: "Bookings (last 7 days)",
      borderColor: "#33aaff",
      backgroundColor: "rgba(51,170,255,0.12)",
      data: bookingsByDate,
      fill: true,
    }]
  }), [lastNDaysLabels, bookingsByDate]);

  const lineSosData = useMemo(() => ({
    labels: lastNDaysLabels,
    datasets: [{
      label: "SOS (last 7 days)",
      borderColor: "#ff8800",
      backgroundColor: "rgba(255,136,0,0.12)",
      data: sosByDate,
      fill: true,
    }]
  }), [lastNDaysLabels, sosByDate]);

  const doughnutStatusData = useMemo(() => ({
    labels: statusPieData.labels,
    datasets: [{
      data: statusPieData.datasets[0].data,
      backgroundColor: ["#ff8800", "#111111", "#ffffff", "#d32f2f", "#33aaff"].slice(0, Math.max(1, statusPieData.labels.length)),
    }]
  }), [statusPieData]);

  const commonBarOptions = useMemo(() => ({
    plugins: { legend: { display: false } },
    scales: { y: { beginAtZero: true } },
    maintainAspectRatio: false
  }), []);

  const horizontalBarOptions = useMemo(() => ({
    indexAxis: 'y',
    plugins: { legend: { display: false } },
    scales: { x: { beginAtZero: true } },
    maintainAspectRatio: false
  }), []);

  const pieOptions = useMemo(() => ({
    plugins: { legend: { position: "right" } },
    maintainAspectRatio: false
  }), []);

  const lineOptions = useMemo(() => ({
    plugins: { legend: { position: "top" } },
    scales: { y: { beginAtZero: true } },
    maintainAspectRatio: false
  }), []);

  // --- Actions ---
  const triggerSos = async (busNumber = "unknown", note = "Manual trigger from admin") => {
    try {
      await firestore.collection("sos_alerts").add({
        busNumber,
        message: note,
        timestamp: new Date().toISOString(),
        createdBy: "admin"
      });
      const sSnap = await firestore.collection("sos_alerts").orderBy("timestamp", "desc").get();
      setSosAlerts(sSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error("Failed to trigger SOS:", err);
      alert("Failed to trigger SOS. See console.");
    }
  };

  const resolveSos = async (id) => {
    try {
      await firestore.collection("sos_alerts").doc(id).update({ resolved: true, resolvedAt: new Date().toISOString() });
      setSosAlerts(prev => prev.map(a => a.id === id ? { ...a, resolved: true } : a));
    } catch (err) {
      console.error("Failed to resolve SOS:", err);
      alert("Failed to resolve SOS. See console.");
    }
  };

  const deleteLostItem = async (id) => {
    try {
      await firestore.collection("lost_items").doc(id).delete();
      setLostItems(prev => prev.filter(i => i.id !== id));
    } catch (err) {
      console.error("Failed to delete lost item:", err);
      alert("Failed to delete lost item. See console.");
    }
  };

  // Basic small UI components
  const StatCard = ({ title, value }) => (
    <div className="dashboard-card glass-box" style={{ padding: 16, minWidth: 140 }}>
      <div style={{ fontSize: 14, color: "#111", marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 28, color: "#ff8800", fontWeight: 800 }}>{value}</div>
    </div>
  );

  // --- Render per tab ---
  function renderOverview() {
    return (
      <div>
        <div style={{ display: "flex", gap: 20, marginBottom: 20, flexWrap: "wrap" }}>
          <StatCard title="Buses" value={buses.length} />
          <StatCard title="Drivers" value={drivers.length} />
          <StatCard title="Passengers" value={passengers.length} />
          <StatCard title="Lost Items" value={lostItems.length} />
          <StatCard title="Bookings" value={bookings.length} />
          <StatCard title="SOS Alerts" value={sosAlerts.length} />
        </div>

        <div style={{ display: "flex", gap: 24, marginBottom: 24, flexWrap: "wrap" }}>
          <div className="glass-box" style={{ flex: 1, minWidth: 320, minHeight: 300 }}>
            <h4 style={{ marginTop: 0 }}>SOS Alerts per Bus</h4>
            <div style={{ height: 260 }}>
              <Bar key={JSON.stringify(sosBarData)} data={sosBarData} options={commonBarOptions} />
            </div>
          </div>

          <div className="glass-box" style={{ flex: 1, minWidth: 320, minHeight: 300 }}>
            <h4 style={{ marginTop: 0 }}>Bookings per Bus</h4>
            <div style={{ height: 260 }}>
              <Bar key={JSON.stringify(bookingsBarData)} data={bookingsBarData} options={commonBarOptions} />
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 24, marginBottom: 24, flexWrap: "wrap" }}>
          <div className="glass-box" style={{ flex: 1, minWidth: 320, minHeight: 300 }}>
            <h4 style={{ marginTop: 0 }}>Lost Items per Bus</h4>
            <div style={{ height: 260 }}>
              <Bar key={JSON.stringify(lostBarData)} data={lostBarData} options={commonBarOptions} />
            </div>
          </div>

          <div className="glass-box" style={{ flex: 1, minWidth: 320, minHeight: 300 }}>
            <h4 style={{ marginTop: 0 }}>Bus Status Distribution (Doughnut)</h4>
            <div style={{ height: 260 }}>
              <Doughnut key={JSON.stringify(doughnutStatusData)} data={doughnutStatusData} options={pieOptions} />
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 24, marginBottom: 24, flexWrap: "wrap" }}>
          <div className="glass-box" style={{ flex: 1, minWidth: 320, minHeight: 300 }}>
            <h4 style={{ marginTop: 0 }}>Bookings (Last 7 days) — Line</h4>
            <div style={{ height: 260 }}>
              <Line key={JSON.stringify(lineBookingsData)} data={lineBookingsData} options={lineOptions} />
            </div>
          </div>

          <div className="glass-box" style={{ flex: 1, minWidth: 320, minHeight: 300 }}>
            <h4 style={{ marginTop: 0 }}>SOS (Last 7 days) — Line</h4>
            <div style={{ height: 260 }}>
              <Line key={JSON.stringify(lineSosData)} data={lineSosData} options={lineOptions} />
            </div>
          </div>
        </div>

        {/* Replaced Radar with a horizontal Bar for Lost Items by Importance */}
        <div style={{ display: "flex", gap: 24, marginBottom: 24, flexWrap: "wrap" }}>
          <div className="glass-box" style={{ flex: 1, minWidth: 320, minHeight: 260 }}>
            <h4 style={{ marginTop: 0 }}>Lost Items by Importance — Horizontal Bar</h4>
            <div style={{ height: 260 }}>
              <Bar key={JSON.stringify(lostImportanceBarData)} data={lostImportanceBarData} options={horizontalBarOptions} />
            </div>
          </div>

          <div className="glass-box" style={{ flex: 1, minWidth: 320, minHeight: 260 }}>
            <h4 style={{ marginTop: 0 }}>Bus Status (Pie)</h4>
            <div style={{ height: 260 }}>
              <Pie key={JSON.stringify(statusPieData)} data={statusPieData} options={pieOptions} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  function renderSos() {
    return (
      <div className="glass-box" style={{ padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>SOS Alerts</h3>
          <div style={{ display: "flex", gap: 8 }}>
            <input placeholder="Bus #" id="sos-bus-input" style={{ padding: 8, borderRadius: 8, border: "1px solid #ddd" }} />
            <button style={btnStylePrimary} onClick={() => {
              const el = document.getElementById("sos-bus-input");
              triggerSos(el?.value || "unknown", "Admin manual trigger");
            }}>Trigger SOS</button>
          </div>
        </div>

        <table className="dashboard-table" style={{ width: "100%" }}>
          <thead>
            <tr>
              <th>Bus</th><th>Message</th><th>When</th><th>Resolved</th><th>Action</th>
            </tr>
          </thead>
          <tbody>
            {sosAlerts.map(s => (
              <tr key={s.id}>
                <td>{s.busNumber || s.bus || "-"}</td>
                <td>{s.message || "-"}</td>
                <td>{s.timestamp ? new Date(s.timestamp).toLocaleString() : "-"}</td>
                <td>{s.resolved ? "Yes" : "No"}</td>
                <td>
                  {!s.resolved && <button style={btnStylePrimarySmall} onClick={() => resolveSos(s.id)}>Resolve</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  function renderDrivers() {
    return (
      <div className="glass-box" style={{ padding: 16 }}>
        <h3>Drivers</h3>
        <table className="dashboard-table">
          <thead>
            <tr><th>ID</th><th>Name</th><th>Assigned Bus</th><th>Phone / Email</th></tr>
          </thead>
          <tbody>
            {drivers.map(d => (
              <tr key={d.id}>
                <td>{d.id}</td>
                <td>{d.name || "-"}</td>
                <td>{d.busNumber || "-"}</td>
                <td>{d.phone || d.email || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  function renderLost() {
    return (
      <div className="glass-box" style={{ padding: 16 }}>
        <h3>Lost Items</h3>
        <table className="dashboard-table">
          <thead>
            <tr><th>Item</th><th>Reported By</th><th>Bus</th><th>Importance</th><th>Description</th><th>Action</th></tr>
          </thead>
          <tbody>
            {lostItems.map(i => (
              <tr key={i.id}>
                <td>{i.name || "-"}</td>
                <td>{i.user || "-"}</td>
                <td>{i.busNumber || "-"}</td>
                <td>{i.importance || "-"}</td>
                <td style={{ maxWidth: 280 }}>{i.desc || "-"}</td>
                <td>
                  <button style={btnStyleDangerSmall} onClick={() => deleteLostItem(i.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  function renderBuses() {
    const bookingCount = {};
    bookings.forEach(b => { bookingCount[b.busNumber] = (bookingCount[b.busNumber] || 0) + 1; });

    return (
      <div className="glass-box" style={{ padding: 16 }}>
        <h3>All Buses</h3>
        <table className="dashboard-table">
          <thead>
            <tr><th>Bus ID</th><th>Route</th><th>Departure</th><th>Arrival</th><th>Status</th><th>Bookings</th></tr>
          </thead>
          <tbody>
            {buses.map(b => (
              <tr key={b.id}>
                <td>{b.id}</td>
                <td>{b.route || "-"}</td>
                <td>{b.departureTime || "-"}</td>
                <td>{b.arrivalTime || "-"}</td>
                <td>{b.status || "-"}</td>
                <td>{bookingCount[b.id] || 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  function renderPassengers() {
    return (
      <div className="glass-box" style={{ padding: 16 }}>
        <h3>Passengers</h3>
        <table className="dashboard-table">
          <thead>
            <tr><th>ID</th><th>Email / Name</th><th>Joined</th></tr>
          </thead>
          <tbody>
            {passengers.map(p => (
              <tr key={p.id}>
                <td>{p.id}</td>
                <td>{p.name || p.email || "-"}</td>
                <td>{p.createdAt ? new Date(p.createdAt).toLocaleString() : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // Buttons style (simple)
  const btnStylePrimary = { background: "linear-gradient(90deg,#ff8800,#ffb86b)", border: "none", color: "#fff", padding: "8px 12px", borderRadius: 8, cursor: "pointer", fontWeight: 700 };
  const btnStylePrimarySmall = { ...btnStylePrimary, padding: "6px 10px", fontSize: 13 };
  const btnStyleDangerSmall = { background: "#d32f2f", border: "none", color: "#fff", padding: "6px 10px", borderRadius: 8, cursor: "pointer", fontWeight: 700 };

  return (
    <div className="dashboard-bg" style={{ paddingBottom: 130 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <h2 style={{ color: "#ff8800", margin: 0 }}>Admin Dashboard</h2>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <div style={{ color: "#666" }}>{loading ? "Loading..." : "Updated"}</div>
          <button onClick={onLogout} style={{ background: "transparent", border: "1px solid rgba(255,136,0,0.2)", color: "#ff8800", padding: "8px 12px", borderRadius: 8, cursor: "pointer", fontWeight: 700 }}>Logout</button>
        </div>
      </div>

      <div style={{ minHeight: "64vh" }}>
        {tab === "overview" && renderOverview()}
        {tab === "sos" && renderSos()}
        {tab === "drivers" && renderDrivers()}
        {tab === "lost" && renderLost()}
        {tab === "buses" && renderBuses()}
        {tab === "passengers" && renderPassengers()}
      </div>

      {/* Bottom nav - centered and elevated for better visibility */}
      <nav
        className="bottom-bar-new glass-box"
        style={{
          position: "fixed",
          left: "50%",
          transform: "translateX(-50%)",
          bottom: 18,
          zIndex: 120,
          display: "flex",
          justifyContent: "center",
          padding: "8px",
          pointerEvents: "auto",
          background: "rgba(255,255,255,0.95)",
          boxShadow: "0 8px 28px rgba(17,17,17,0.12)",
          borderRadius: 14,
          backdropFilter: "blur(6px)",
          border: "1px solid rgba(0,0,0,0.06)"
        }}
      >
        <div style={{ display: "flex", gap: 12, alignItems: "center", padding: "6px 8px" }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} className={tab === t.key ? "active" : ""} style={{
              background: tab === t.key ? "linear-gradient(90deg,#ff8800,#ffb86b)" : "transparent",
              color: tab === t.key ? "#fff" : "#111",
              border: "none",
              padding: "8px 12px",
              borderRadius: 10,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
              minWidth: 68,
              cursor: "pointer",
              fontWeight: 700,
              boxShadow: tab === t.key ? "0 6px 18px rgba(255,136,0,0.16)" : "none"
            }}>
              <span style={{ fontSize: 18 }}>{t.emoji}</span>
              <span style={{ fontSize: 12 }}>{t.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

export default AdminDashboard;