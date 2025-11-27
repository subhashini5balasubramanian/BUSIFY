import React, { useState, useEffect, useRef } from "react";
import "../../App.css";
import { firestore, storage } from "../../firebase";

function PassengerDashboard({ user, onLogout }) {
  const [tab, setTab] = useState("home");
  const [detailsBus, setDetailsBus] = useState(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const userName = user?.email?.split("@")[0] || "Passenger";
  const busStop = "Central Bus Stop";

  // Firebase bus data
  const [buses, setBuses] = useState([]);
  const [loadingBuses, setLoadingBuses] = useState(true);

  useEffect(() => {
    const fetchBuses = async () => {
      try {
        const snapshot = await firestore.collection("buses").get();
        const busList = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setBuses(busList);
      } catch (err) {
        setBuses([]);
      } finally {
        setLoadingBuses(false);
      }
    };
    fetchBuses();
  }, []);

  // GPS locations (real-time)
  const [gpsLocations, setGpsLocations] = useState({}); // { docId: { lat, lng, timestamp } }
  const gpsUnsubRef = useRef(null);

  // Booking / ticket state
  const [bookModalOpen, setBookModalOpen] = useState(false);
  const [manualBusCode, setManualBusCode] = useState("");
  const [selectedPickup, setSelectedPickup] = useState("");
  const [selectedDrop, setSelectedDrop] = useState("");
  // store last booking so "Show QR" is available after booking
  const [lastBooking, setLastBooking] = useState(null); // { busId, payload }

  // QR modals
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [qrData, setQrData] = useState("");
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  // Lost & Found
  const [lostModalOpen, setLostModalOpen] = useState(false);
  const [lostItem, setLostItem] = useState({
    name: "",
    photo: null,
    busNumber: "",
    importance: "Medium",
    desc: ""
  });
  const [uploading, setUploading] = useState(false);
  const [loadingLost, setLoadingLost] = useState(true);
  const [lostItems, setLostItems] = useState([]);

  useEffect(() => {
    const unsubscribe = firestore.collection("lost_items")
      .orderBy("timestamp", "desc")
      .onSnapshot(snapshot => {
        setLostItems(snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })));
        setLoadingLost(false);
      }, () => setLoadingLost(false));
    return () => unsubscribe();
  }, []);

  // Subscribe to gps_locations collection for live positions (display on map)
  useEffect(() => {
    if (gpsUnsubRef.current) gpsUnsubRef.current();

    try {
      gpsUnsubRef.current = firestore.collection("gps_locations")
        .onSnapshot(snap => {
          const locs = {};
          snap.docs.forEach(d => {
            locs[d.id] = d.data();
          });
          setGpsLocations(locs);
        }, err => {
          console.warn("gps_locations listener error:", err);
        });
    } catch (e) {
      console.warn("failed to subscribe gps_locations:", e);
    }

    return () => {
      if (gpsUnsubRef.current) gpsUnsubRef.current();
      gpsUnsubRef.current = null;
    };
  }, []);

  // Modal popup logic
  const [modalMsg, setModalMsg] = useState("");
  const showModal = msg => setModalMsg(msg);

  // Handle Search tab logic
  const [pickup, setPickup] = useState("");
  const [dest, setDest] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  function handleSearch() {
    setLoading(true);
    setTimeout(() => {
      const results = buses.filter(
        bus =>
          bus.stops &&
          bus.stops.includes(pickup) &&
          bus.stops.includes(dest)
      );
      setSearchResults(results);
      setLoading(false);
    }, 800);
  }

  // Handle Lost Item form file upload
  const handleLostPhoto = e => {
    if (e.target.files[0]) {
      setLostItem(prev => ({ ...prev, photo: e.target.files[0] }));
    }
  };

  // Handle Lost & Found modal submit
  async function handleLostSubmit(e) {
    e.preventDefault();
    setUploading(true);
    let photoURL = "";
    try {
      if (lostItem.photo) {
        const storageRef = storage.ref();
        const fileRef = storageRef.child(`lost_items/${Date.now()}_${lostItem.photo.name}`);
        await fileRef.put(lostItem.photo);
        photoURL = await fileRef.getDownloadURL();
      }

      await firestore.collection("lost_items").add({
        name: lostItem.name,
        photo: photoURL,
        busNumber: lostItem.busNumber,
        importance: lostItem.importance,
        desc: lostItem.desc,
        user: userName,
        timestamp: new Date()
      });

      setLostModalOpen(false);
      setLostItem({
        name: "",
        photo: null,
        busNumber: "",
        importance: "Medium",
        desc: ""
      });
      showModal("Lost item added! We'll notify you if found.");
    } catch (err) {
      showModal("Failed to add lost item. Try again.");
    }
    setUploading(false);
  }

  // Helpers for UI
  const importanceColor = importance => {
    switch ((importance || "Medium").toLowerCase()) {
      case "high": return "#ff4d4f";
      case "low": return "#28c76f";
      default: return "#ff9f1c"; // medium/orange
    }
  };

  // Generate a 5-digit bus code
  const generateFiveDigitCode = () => {
    return Math.floor(10000 + Math.random() * 90000).toString();
  };

  // Open book modal and ensure a 5-digit bus code is present
  const openBookModal = bus => {
    setDetailsBus(bus);
    if (!manualBusCode || !/^\d{5}$/.test(manualBusCode)) {
      setManualBusCode(generateFiveDigitCode());
    }
    setSelectedPickup("");
    setSelectedDrop("");
    setBookModalOpen(true);
  };

  // Booking flow (confirm booking) - requires pickup & drop and 5-digit numeric code
  const handleConfirmBooking = async () => {
    if (!selectedPickup || !selectedDrop) {
      showModal("Please select both pickup and drop locations before confirming the ticket.");
      return;
    }
    if (selectedPickup === selectedDrop) {
      showModal("Pickup and drop cannot be the same. Please choose different stops.");
      return;
    }

    const busCode = manualBusCode;
    if (!/^\d{5}$/.test(busCode)) {
      showModal("Bus code must be exactly 5 digits. Please correct it before confirming.");
      return;
    }

    // Compose payload
    const payloadObj = {
      busCode,
      user: userName,
      busNumber: detailsBus?.number || detailsBus?.id || "unknown",
      pickup: selectedPickup,
      drop: selectedDrop,
      ts: new Date().toISOString()
    };
    const payload = JSON.stringify(payloadObj);

    // Persist booking if you want (example: bookings collection)
    try {
      await firestore.collection("bookings").add({
        busId: detailsBus?.id || null,
        busNumber: detailsBus?.number || null,
        user: userName,
        pickup: selectedPickup,
        drop: selectedDrop,
        busCode,
        createdAt: new Date().toISOString()
      });
    } catch (err) {
      // non-fatal; still allow showing QR
      console.warn("Failed to persist booking:", err);
    }

    // Save lastBooking so UI shows "Show QR" button; do NOT auto-open the QR modal per request
    setLastBooking({ busId: detailsBus?.id, payload: payloadObj });
    setQrData(payload);

    setBookModalOpen(false);

    showModal(`Ticket booked!\nPickup: ${selectedPickup}\nDrop: ${selectedDrop}\nBus Code: ${busCode}`);

    // reset modal inputs
    setManualBusCode("");
    setSelectedPickup("");
    setSelectedDrop("");
  };

  // Show QR (quick preview) - will use lastBooking if present or qrData
  const handleShowQrFromDetails = (busId) => {
    if (lastBooking && lastBooking.busId === busId) {
      setQrData(JSON.stringify(lastBooking.payload));
      setQrModalOpen(true);
      return;
    }
    // fallback: if detailsBus exists and qrData present
    if (qrData) setQrModalOpen(true);
    else showModal("No ticket available for this bus. Please book first.");
  };

  // Scan QR - kept as separate feature (not part of the booking modal)
  

  // QR modal helpers
  const qrImageUrl = size => {
    if (!qrData) return "";
    return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(qrData)}`;
  };

  // Attempt to open camera for scanning (UI only). Decoding requires additional library (jsQR).
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (err) {
      console.warn("Camera access failed:", err);
      showModal("Camera access denied or not available on this device.");
      setScanModalOpen(false);
    }
  };
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      try { videoRef.current.pause(); videoRef.current.srcObject = null; } catch (e) {}
    }
  };

  useEffect(() => {
    if (scanModalOpen) startCamera();
    else stopCamera();
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanModalOpen]);

  // ---------------- Map (Leaflet) integration ----------------
  const mapRef = useRef(null);
  const leafletMarkersRef = useRef({}); // docId -> marker
  const leafletLoadedRef = useRef(false);

  const loadLeaflet = () => new Promise((resolve, reject) => {
    if (typeof window === "undefined") return reject();
    if (leafletLoadedRef.current && window.L) return resolve();
    if (!document.querySelector('link[data-leaflet]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      link.setAttribute("data-leaflet", "1");
      document.head.appendChild(link);
    }
    if (window.L) {
      leafletLoadedRef.current = true;
      return resolve();
    }
    if (!document.querySelector('script[data-leaflet]')) {
      const script = document.createElement("script");
      script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      script.async = true;
      script.setAttribute("data-leaflet", "1");
      script.onload = () => {
        leafletLoadedRef.current = true;
        resolve();
      };
      script.onerror = reject;
      document.body.appendChild(script);
    } else {
      const check = () => {
        if (window.L) {
          leafletLoadedRef.current = true;
          resolve();
        } else setTimeout(check, 50);
      };
      check();
    }
  });

  useEffect(() => {
    let mounted = true;
    async function init() {
      try {
        await loadLeaflet();
        if (!mounted) return;
        if (!mapRef.current) {
          const L = window.L;
          mapRef.current = L.map("passenger-map", { zoomControl: true });
          mapRef.current.setView([12.9716, 77.5946], 12);
          L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: '&copy; OpenStreetMap contributors'
          }).addTo(mapRef.current);
        }
      } catch (e) {
        console.warn("Leaflet load failed", e);
      }
    }
    init();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !window.L) return;
    const L = window.L;
    const map = mapRef.current;
    const markers = leafletMarkersRef.current;

    Object.keys(gpsLocations).forEach(id => {
      const loc = gpsLocations[id];
      if (!loc || typeof loc.lat !== "number" || typeof loc.lng !== "number") return;
      if (markers[id]) {
        markers[id].setLatLng([loc.lat, loc.lng]);
      } else {
        markers[id] = L.marker([loc.lat, loc.lng]).addTo(map);
        markers[id].bindPopup(`<div style="font-weight:700">${id}</div><div>${loc.timestamp ? new Date(loc.timestamp.seconds ? loc.timestamp.seconds*1000 : loc.timestamp).toLocaleString() : ""}</div>`);
      }
    });

    buses.forEach(bus => {
      const key = `bus_${bus.id}`;
      const lat = bus.location?.lat ?? bus.lat;
      const lng = bus.location?.lng ?? bus.lng;
      if (typeof lat === "number" && typeof lng === "number") {
        if (markers[key]) {
          markers[key].setLatLng([lat, lng]);
        } else {
          markers[key] = L.marker([lat, lng], { title: bus.number || bus.id }).addTo(map);
          markers[key].bindPopup(`<div style="font-weight:700">${bus.number || bus.id}</div><div>${bus.route || ""}</div>`);
        }
      }
    });

    Object.keys(markers).forEach(k => {
      const isGpsKey = !k.startsWith("bus_");
      if (isGpsKey) {
        if (!gpsLocations[k]) {
          map.removeLayer(markers[k]);
          delete markers[k];
        }
      } else {
        const busId = k.replace(/^bus_/, "");
        const bus = buses.find(b => String(b.id) === String(busId));
        const hasLoc = bus && (typeof (bus.location?.lat ?? bus.lat) === "number");
        if (!hasLoc) {
          map.removeLayer(markers[k]);
          delete markers[k];
        }
      }
    });

    const allMarkers = Object.values(markers);
    if (allMarkers.length > 0) {
      const group = L.featureGroup(allMarkers);
      try {
        map.fitBounds(group.getBounds().pad(0.2));
      } catch (e) {}
    }

  }, [gpsLocations, buses]);

  // ---------------- end Map integration ----------------

  // SOS trigger from passenger - writes to firestore so admin can see it
  const triggerSosAlert = async (busNumber = "", message = "SOS triggered by passenger") => {
    try {
      await firestore.collection("sos_alerts").add({
        busNumber,
        message,
        createdBy: userName,
        timestamp: new Date().toISOString()
      });
      showModal("SOS alert sent. Admin will be notified.");
    } catch (err) {
      console.error("Failed to create SOS alert:", err);
      showModal("Failed to send SOS alert. Try again.");
    }
  };

  return (
    <div className="dashboard-bg passenger-dashboard">
      {/* Top Nav */}
      <div className="top-nav-new" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", position: "relative" }}>
        {/* Left Side: Busify */}
        <div>
          <div className="title-busify" style={{ cursor: "pointer" }}>Busify</div>
          <div className="nearest-stop" style={{ marginTop: 8 }}>
            <span className="nearest-label">Nearest bus stop:</span>
            <span className="nearest-name">{busStop}</span>
          </div>
        </div>
        {/* Right Side: User Info */}
        <div className="user-cover" style={{ cursor: "pointer", marginRight: 10 }} onClick={() => setUserMenuOpen(v => !v)}>
          <span className="user-avatar">{userName.charAt(0).toUpperCase()}</span>
          <span className="user-text">{userName}</span>
        </div>
        {/* Glass User Dropdown */}
        {userMenuOpen && (
          <div
            className="glass-box user-dropdown"
            style={{
              position: "absolute",
              right: 10,
              top: 52,
              minWidth: 150,
              padding: "14px 16px",
              boxShadow: "0 8px 30px #0003",
              textAlign: "center",
              zIndex: 999
            }}>
            <button
              onClick={() => { setUserMenuOpen(false); onLogout(); }}
              className="btn-logout"
            >Logout</button>
          </div>
        )}
      </div>

      {/* Bus Details Page */}
      {detailsBus ? (
        <div className="main-content">
          <div className="details-header glass-card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div className="bus-badge">
                <div className="bus-number-badge">{String(detailsBus.number).toUpperCase()}</div>
              </div>
              <div className="bus-info">
                <h3 className="route-name">{detailsBus.route}</h3>
                <div className="arrival-row">
                  <span className="arrival-label">Arrives in</span>
                  <span className="arrival-time">{detailsBus.arrival} min</span>
                </div>
                <div className="crowd-row">
                  <span className="crowd-label">Crowd:</span>
                  <span className={`crowd-pill crowd-${(detailsBus.crowd || "Medium").toLowerCase()}`}>
                    {detailsBus.crowd || "Medium"}
                  </span>
                </div>
              </div>
            </div>

            <div className="details-actions" style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {/* If a booking exists for this bus in this session, show "Show QR" */}
              {lastBooking && lastBooking.busId === detailsBus?.id ? (
                <button className="details-btn" onClick={() => handleShowQrFromDetails(detailsBus?.id)}>
                  Show QR
                </button>
              ) : (
                <button className="details-btn" onClick={() => openBookModal(detailsBus)}>
                  Book Ticket
                </button>
              )}

              <button
                className="details-btn dark"
                onClick={() => setDetailsBus(null)}
              >
                Back
              </button>
            </div>
          </div>

          <div className="stops-section glass-card">
            <h4>Route Stops</h4>
            <div className="stops-list">
              <div className="stops-line" />
              <ul>
                {(detailsBus.stops || []).map((stop) => {
                  const dotColor = detailsBus.stopImportance && detailsBus.stopImportance[stop]
                    ? importanceColor(detailsBus.stopImportance[stop])
                    : "#ff8800";
                  return (
                    <li key={stop} className="stop-item">
                      <span
                        className="stop-dot"
                        style={{ background: dotColor }}
                        title={stop}
                      />
                      <div className="stop-meta">
                        <div className="stop-name">{stop}</div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div className="stops-foot" />
          </div>

          {/* Book Ticket Modal */}
          {bookModalOpen && (
            <div className="modal-bg" onClick={() => setBookModalOpen(false)}>
              <div className="modal-box booking-modal glass-card" onClick={e => e.stopPropagation()}>
                <div className="booking-top" style={{ display: "flex", gap: 12 }}>
                  <div className="bus-badge-small">
                    <div className="bus-number-small">{String(detailsBus.number).toUpperCase()}</div>
                  </div>
                  <div className="booking-info">
                    <div className="route-strong">{detailsBus.route}</div>
                    <div className="arrival-strong">{detailsBus.arrival} min</div>
                    <div className="crowd-pill mini">{(detailsBus.crowd || "Medium")}</div>
                  </div>
                </div>

                <div className="booking-selects" style={{ display: "flex", gap: 12, marginTop: 12 }}>
                  <div style={{ flex: 1 }}>
                    <label>Pickup</label>
                    <select value={selectedPickup} onChange={e => setSelectedPickup(e.target.value)}>
                      <option value="">Select pickup</option>
                      {(detailsBus.stops || []).map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label>Drop</label>
                    <select value={selectedDrop} onChange={e => setSelectedDrop(e.target.value)}>
                      <option value="">Select drop</option>
                      {(detailsBus.stops || []).map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>

                <div className="input-row" style={{ display: "flex", gap: 12, marginTop: 12 }}>
                  <div style={{ flex: 1 }}>
                    <small className="muted">Bus Code (5 digits)</small>
                    <input
                      type="text"
                      value={manualBusCode}
                      placeholder="12345"
                      onChange={e => {
                        const v = e.target.value.replace(/\D/g, "").slice(0, 5);
                        setManualBusCode(v);
                      }}
                      maxLength={5}
                    />
                  </div>
                </div>

                <div className="booking-actions" style={{ display: "flex", gap: 8, marginTop: 14 }}>
                  <button
                    className="details-btn"
                    onClick={handleConfirmBooking}
                    style={{ flex: 1 }}
                  >
                    Confirm & Get QR
                  </button>
                  <button
                    className="modal-close"
                    onClick={() => setBookModalOpen(false)}
                    style={{ flex: 1 }}
                  >
                    Cancel
                  </button>
                </div>

                <div className="booking-foot" style={{ marginTop: 12 }}>
                  {/* Scan removed from booking modal as requested; keep scan feature available elsewhere */}
                </div>
              </div>
            </div>
          )}

          {/* QR Display Modal */}
          {qrModalOpen && (
            <div className="modal-bg" onClick={() => setQrModalOpen(false)}>
              <div className="modal-box qr-modal glass-card" onClick={e => e.stopPropagation()}>
                <h4 className="qr-title">Your Ticket QR</h4>
                <div className="qr-body" style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  {qrData ? (
                    <img className="qr-image" src={qrImageUrl(260)} alt="Ticket QR" />
                  ) : (
                    <div className="qr-placeholder">No QR data</div>
                  )}
                  <div className="qr-meta" style={{ flex: 1 }}>
                    <pre className="qr-text" style={{ whiteSpace: "pre-wrap" }}>{qrData ? JSON.stringify(JSON.parse(qrData), null, 2) : ""}</pre>
                    <div className="qr-actions" style={{ display: "flex", gap: 8, marginTop: 8 }}>
                      <a className="download-link" href={qrImageUrl(600)} download="ticket-qr.png">Download</a>
                      <button className="modal-close" onClick={() => setQrModalOpen(false)}>Close</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Scan Modal (separate feature) */}
          {scanModalOpen && (
            <div className="modal-bg" onClick={() => setScanModalOpen(false)}>
              <div className="modal-box scan-modal glass-card" onClick={e => e.stopPropagation()}>
                <h4>Scan QR Code</h4>
                <video ref={videoRef} className="scan-video" playsInline />
                <div className="scan-note">
                  Tip: Allow camera access. To actually decode the QR you can add a decoder library such as jsQR and run decoding on the video frames.
                </div>
                <div className="scan-actions" style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button className="details-btn" onClick={() => { /* placeholder if you add decoder */ }}>Start Scan</button>
                  <button className="modal-close" onClick={() => setScanModalOpen(false)}>Close</button>
                </div>
              </div>
            </div>
          )}

        </div>
      ) : (
        <div className="main-content">
          {tab === "home" && (
            <div>
              <h3 style={{ margin: "18px 0 10px 0", color: "#ff8800" }}>Arriving Buses</h3>
              {loadingBuses ? (
                <div>Loading buses...</div>
              ) : buses.length > 0 ? (
                <>
                  {buses.map(bus => (
                    <div className="bus-card glass-box" key={bus.id || bus.number} style={{ marginBottom: 10 }}>
                      <div className="bus-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <span className="bus-num">{bus.number}</span>
                          <span className="bus-route" style={{ marginLeft: 8 }}>{bus.route}</span>
                        </div>

                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          {/* If the user booked this bus in this session, show Show QR button */}
                          {lastBooking && lastBooking.busId === bus.id ? (
                            <button className="details-btn" onClick={() => handleShowQrFromDetails(bus.id)}>Show QR</button>
                          ) : (
                            <button className="details-btn" onClick={() => openBookModal(bus)}>Book Ticket</button>
                          )}
                        </div>
                      </div>

                      <div className="bus-arrival">
                        Arriving in <b>{bus.arrival} min</b>
                      </div>
                    </div>
                  ))}

                  {/* Map: shows live GPS positions from `gps_locations` collection and bus document locations (if present) */}
                  <div className="glass-card" style={{ marginTop: 12, padding: 12 }}>
                    <h4 style={{ margin: "6px 0 10px 0" }}>Live Bus Map</h4>
                    <div id="passenger-map" style={{ height: 300, width: "100%", borderRadius: 8, overflow: "hidden" }} />
                    
                  </div>
                </>
              ) : (
                <div>No arriving buses at the moment.</div>
              )}
            </div>
          )}

          {/* Search Tab */}
          {tab === "search" && (
            <div className="glass-box">
              <h3 style={{ color: "#ff8800", marginBottom: 15 }}>Search Route</h3>
              <input
                className="search-input"
                type="text"
                placeholder="Pickup Point"
                value={pickup}
                onChange={e => setPickup(e.target.value)}
              />
              <input
                className="search-input"
                type="text"
                placeholder="Destination"
                value={dest}
                onChange={e => setDest(e.target.value)}
              />
              <button
                className="search-btn"
                onClick={handleSearch}
                disabled={loading || !pickup || !dest}
                style={{ opacity: (!pickup || !dest) ? 0.6 : 1 }}
              >
                {loading ? "Searching..." : (<><span role="img" aria-label="search">🔎</span> Search</>)}
              </button>
              <div className="search-results">
                {searchResults.length > 0 ? (
                  <ul style={{ padding: 0, marginTop: 18 }}>
                    {searchResults.map((bus, i) => (
                      <li key={i} className="bus-search-result">
                        <b>{bus.number}</b> - {bus.route}
                        <br />
                        Arrives at <span style={{ color: "#ff8800" }}>{pickup}</span> in <b>{bus.arrival} min</b>
                        <button
                          className="details-btn"
                          style={{ marginTop: 7 }}
                          onClick={() => setDetailsBus(bus)}
                        >
                          Show Bus Stops
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : loading ? (
                  <div style={{ marginTop: 16 }}>Searching...</div>
                ) : (
                  pickup &&
                  dest && (
                    <div style={{ marginTop: 20, color: "#222" }}>
                      No buses found for this route.
                    </div>
                  )
                )}
              </div>
            </div>
          )}

          {/* Lost & Found Tab */}
          {tab === "lost" && (
            <div className="glass-box">
              <h3 style={{ color: "#ff8800" }}>Lost & Found</h3>
              <button className="add-lost-btn" onClick={() => setLostModalOpen(true)}>
                + Add Lost Item
              </button>
              {lostModalOpen && (
                <div className="modal-bg" onClick={() => setLostModalOpen(false)}>
                  <form
  className="modal-box glass-box lost-form"
  style={{ maxWidth: 400 }}
  onClick={e => e.stopPropagation()}
  onSubmit={handleLostSubmit}
>
  <div className="form-row">
    <label htmlFor="lost-name">Item Name</label>
    <input
      id="lost-name"
      type="text"
      required
      value={lostItem.name}
      onChange={e => setLostItem({ ...lostItem, name: e.target.value })}
    />
  </div>

  <div className="form-row">
    <label htmlFor="lost-photo">Photo of Item</label>
    <input
      id="lost-photo"
      type="file"
      accept="image/*"
      onChange={handleLostPhoto}
    />
  </div>

  <div className="form-row">
    <label htmlFor="lost-bus">Bus Number</label>
    <input
      id="lost-bus"
      type="text"
      value={lostItem.busNumber}
      onChange={e => setLostItem({ ...lostItem, busNumber: e.target.value })}
    />
  </div>

  <div className="form-row">
    <label>Importance</label>
    <div className="radio-group" role="radiogroup" aria-label="Importance">
      {["Low", "Medium", "High"].map(val => (
        <label key={val} className="radio-label">
          <input
            type="radio"
            name="importance"
            value={val}
            checked={lostItem.importance === val}
            onChange={() => setLostItem({ ...lostItem, importance: val })}
          />
          <span className="radio-text">{val}</span>
        </label>
      ))}
    </div>
  </div>

  <div className="form-row full-width">
    <label htmlFor="lost-desc">Description</label>
    <textarea
      id="lost-desc"
      required
      value={lostItem.desc}
      onChange={e => setLostItem({ ...lostItem, desc: e.target.value })}
      rows={4}
    />
  </div>

  <div className="form-row form-actions full-width">
    <button type="submit" className="add-lost-btn" disabled={uploading}>
      {uploading ? "Adding..." : "Submit"}
    </button>
    <button type="button" className="modal-close" onClick={() => setLostModalOpen(false)}>
      Cancel
    </button>
  </div>
</form>
                </div>
              )}
              <ul style={{ marginTop: "17px", padding: 0 }}>
                {loadingLost ? (
                  <li style={{ color: "#222" }}>Loading...</li>
                ) : lostItems.length === 0 ? (
                  <li style={{ color: "#222" }}>No lost items yet</li>
                ) : (
                  lostItems.map((item, idx) => (
                    <li
                      key={item.id || idx}
                      style={{
                        marginBottom: "9px",
                        padding: "10px 16px",
                        borderRadius: "10px",
                        background: "#fff",
                        color: "#222",
                        boxShadow: "0 2px 8px #ffd4ba33"
                      }}
                    >
                      <b>{item.name}</b><br />
                      {item.photo && (
                        <img src={item.photo} alt="Lost Item" style={{ maxWidth: 90, borderRadius: 7 }} />
                      )}<br />
                      Bus Number: {item.busNumber}<br />
                      Importance: {item.importance}<br />
                      <span style={{ color: "#ff8800" }}>{item.desc}</span>
                      {item.user && (
                        <span style={{ marginLeft: 16, color: "#111", fontSize: "0.97em" }}>
                          Reported by {item.user}
                        </span>
                      )}
                    </li>
                  ))
                )}
              </ul>
            </div>
          )}

          {/* SOS Alert Tab */}
          {tab === "sos" && (
            <div className="glass-box">
              <h3 style={{ color: "#ff8800" }}>SOS Alert</h3>
              <button
                className="sos-btn"
                onClick={() => triggerSosAlert("", "SOS triggered by passenger")}
              >
                Trigger SOS Alert
              </button>
            </div>
          )}
        </div>
      )}

      {/* Bottom Nav (hidden during details page) */}
      {!detailsBus && (
        <nav className="bottom-bar-new glass-box" style={{
          position: "fixed",
          left: "50%",
          right: 0,
          bottom: 0,
          width: "100vw",
          maxWidth: "520px",
          transform: "translateX(-50%)",
          padding: "8px 22px 2px 22px",
          display: "flex",
          justifyContent: "space-between",
          zIndex:99
        }}>
          <button onClick={() => setTab("home")} className={tab === "home" ? "active" : ""}>
            <span role="img" aria-label="Home">🏠</span><br />Home
          </button>
          <button onClick={() => setTab("search")} className={tab === "search" ? "active" : ""}>
            <span role="img" aria-label="Search">🔎</span><br />Search
          </button>
          <button onClick={() => setTab("lost")} className={tab === "lost" ? "active" : ""}>
            <span role="img" aria-label="Lost and Found">🎒</span><br />Lost & Found
          </button>
          <button onClick={() => setTab("sos")} className={tab === "sos" ? "active" : ""}>
            <span role="img" aria-label="SOS">🚨</span><br />SOS
          </button>
        </nav>
      )}

      {/* Popup Modal for feedback (centered message; OK button styled orange/white) */}
      {modalMsg && (
        <div className="modal-bg" onClick={() => setModalMsg("")}>
          <div className="modal-box glass-card modal-msg" onClick={e => e.stopPropagation()}>
            <div className="modal-msg-body">
              <div className="modal-msg-text" style={{ whiteSpace: "pre-line" }}>{modalMsg}</div>
              <div style={{ marginTop: 14 }}>
                <button className="modal-ok" onClick={() => setModalMsg("")}>OK</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PassengerDashboard;