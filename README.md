# Busify — Admin & Passenger Dashboards

Lightweight React dashboards for a Busify-style app. This project includes:

- AdminDashboard — management UI with charts, SOS & Lost Items management.
- PassengerDashboard — arriving buses, booking + QR generation, lost & found upload, live map (Leaflet).
- Firebase (Firestore + Storage) as backend.
- Chart.js (via react-chartjs-2) and Leaflet for charts & maps.
- A shared `src/App.css` providing the design system (glass cards, bottom nav). Admin view uses the `.admin-dashboard` class to show an orange background theme.

This README explains how to set up, run, and customize the project.

---

## Table of contents

- [Requirements](#requirements)
- [Quick start](#quick-start)
- [Project structure](#project-structure)
- [Firebase setup & example code](#firebase-setup--example-code)
- [Environment variables](#environment-variables)
- [Styling & admin orange background](#styling--admin-orange-background)
- [Firestore collections / expected schema](#firestore-collections--expected-schema)
- [Security & rules guidance](#security--rules-guidance)
- [Development notes & best practices](#development-notes--best-practices)
- [Scripts](#scripts)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

---

## Requirements

- Node.js 16+ (LTS recommended)
- npm or Yarn
- A Firebase project with Firestore, Storage and Authentication enabled

---

## Quick start

1. Clone the repository
   ```bash
   git clone <repo-url>
   cd <repo-folder>
   ```

2. Install dependencies
   ```bash
   npm install
   # or
   yarn
   ```

3. Add Firebase environment variables (see [Environment variables](#environment-variables))

4. Create `src/firebase.js` (example below)

5. Start the dev server
   ```bash
   npm start
   # or
   yarn start
   ```

6. Open http://localhost:3000

---

## Project structure (example)

- src/
  - components/
    - AdminDashboard.jsx
    - PassengerDashboard.jsx
  - firebase.js
  - App.css
  - index.js
- public/
- package.json

Notes:
- `AdminDashboard.jsx` handles chart data, admin management actions (trigger SOS, resolve, delete lost items) and uses `chart.js`.
- `PassengerDashboard.jsx` handles map loading (Leaflet), bookings and QR generation, lost item uploads, and camera access for scanning (decoding optional).
- `App.css` contains shared styles and `.admin-dashboard` override.

---

## Firebase setup & example code

Create a Firebase project in the Firebase Console and enable:

- Firestore
- Storage
- Authentication (Email/password or providers you need)

Example `src/firebase.js` (compat-style; adapt to modular SDK if preferred):

```javascript name=src/firebase.js
// src/firebase.js
import firebase from "firebase/compat/app";
import "firebase/compat/firestore";
import "firebase/compat/storage";
import "firebase/compat/auth";

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

export const firestore = firebase.firestore();
export const storage = firebase.storage();
export const auth = firebase.auth();
export default firebase;
```

Important:
- Use the Firebase Emulator Suite for local testing of rules and functions when possible.

---

## Environment variables

Create a `.env.local` file at the project root (never commit secrets):

```
REACT_APP_FIREBASE_API_KEY=your_api_key
REACT_APP_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
REACT_APP_FIREBASE_PROJECT_ID=your_project_id
REACT_APP_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
REACT_APP_FIREBASE_APP_ID=your_app_id
```

Restart the dev server after changing environment variables.

---

## Styling & admin orange background

Shared UI styles live in `src/App.css`. To enable an orange themed admin background the AdminDashboard root container adds `admin-dashboard`:

```jsx
<div className="dashboard-bg admin-dashboard" style={{ paddingBottom: 130 }}>
  ...
</div>
```

Example CSS snippet (in `App.css`):

```css
.admin-dashboard {
  background: linear-gradient(180deg, #ff8800 0%, #ffb86b 100%) !important;
  color: #fff !important;
}
```

Adjust colors and gradients in `App.css` to match branding.

---

## Firestore collections / expected schema

The UI expects the following collection names and common fields (adapt as needed):

- buses (docId = bus.id)
  - number, route, arrival, departureTime, arrivalTime, status, location: { lat, lng }, stops: [], crowd
- users
  - name, email, phone, role: "admin" | "driver" | "passenger", createdAt, busNumber (for drivers)
- bookings
  - busId, busNumber, user, pickup, drop, busCode, createdAt
- lost_items
  - name, photo (url), busNumber, importance ("Low"|"Medium"|"High"), desc, user, timestamp
- sos_alerts
  - busNumber, message, createdBy, timestamp, resolved (boolean), resolvedAt
- gps_locations (optional, used by live map)
  - lat, lng, timestamp

The code includes a `dateKeyFromRecord` helper which supports both Firestore `Timestamp` objects (with `.toDate()`) and ISO strings.

---

## Security & rules guidance (high-level)

Do not rely on client validation for access control. Use Firestore security rules.

Example (high-level, minimal):

Firestore rules (conceptual — test and adapt):
```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /buses/{bus} {
      allow read: if request.auth != null; // limit to authenticated or public read as desired
      allow write: if false; // only via admin or backend with service account
    }
    match /sos_alerts/{id} {
      allow create: if request.auth != null;
      allow read: if request.auth != null;
      allow update: if request.auth != null && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
      allow delete: if false;
    }
    match /lost_items/{id} {
      allow create: if request.auth != null;
      allow read: if request.auth != null;
      allow update, delete: if get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
    // ... users, bookings, gps_locations rules similar pattern
  }
}
```

Storage rules:
- Only allow authenticated uploads.
- Validate file size and content type where possible.
- Consider storing images with restricted read and provide signed URLs if privacy is required.

Use the Firebase Emulator to test rules locally.

---

## Development notes & best practices

- Realtime listeners:
  - Use `onSnapshot` for `gps_locations`, `lost_items` etc.
  - Unsubscribe on component unmount to avoid memory leaks.

- Timestamps:
  - Prefer `firebase.firestore.FieldValue.serverTimestamp()` when writing time from clients if server time is required.

- Map (Leaflet) integration:
  - The PassengerDashboard dynamically loads Leaflet CSS/JS. Ensure the map container exists and is initialized after script load.

- QR:
  - QR generation uses external image API (`https://api.qrserver.com/v1/create-qr-code/?data=...`).
  - QR scanning requires a decoding library (e.g., `jsQR`) to decode frames captured from `getUserMedia()`.

- Charts:
  - Include `import 'chart.js/auto'` once before using react-chartjs-2.
  - Use `useMemo` for data/options to reduce re-renders.

- Performance:
  - Avoid fetching large collections at once in production — use pagination or server-side aggregation.
  - Use batched writes or transactions when updating related documents.

---

## Scripts

Common npm scripts (example in `package.json`):

- `npm start` — Start development server
- `npm run build` — Create production build
- `npm test` — Run tests (if present)
- `npm run lint` — Run linting (if configured)

---

## Troubleshooting

- Map not showing: check console for leaflet load errors and ensure CSS loaded. Confirm map container size exists when map initializes.
- Firestore permission errors: verify security rules and that your client is authenticated.
- Storage upload issues: check CORS and Storage rules; validate file size and type.
- Camera access denied: ensure the app is served over HTTPS (or localhost) and the browser permissions allow camera access.

---

## Contributing

- Fork → create a branch → open a PR.
- Keep changes scoped: styles, features, bugfixes in separate PRs.
- Add or update tests if you introduce logic changes.
- Use the Firebase Emulator Suite for testing rules and local Firestore/Storage.

---

## Example: quick local checklist

1. Create Firebase project and enable Firestore, Storage, Auth.
2. Add environment variables to `.env.local`.
3. Add `src/firebase.js` (example above).
4. Install deps (`npm install`).
5. `npm start` and open `http://localhost:3000`.
6. Optional: run Firebase Emulator.

---

## License

MIT

---

If you'd like I can:
- Add a `CONTRIBUTING.md` and `SECURITY.md`.
- Provide a recommended set of Firestore security rules tailored to this app.
- Generate a Git patch that adds `src/App.css` and updates `AdminDashboard.jsx` to include the `.admin-dashboard` class and CSS import.

Which would you like next?
