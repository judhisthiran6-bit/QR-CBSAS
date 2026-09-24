/* =====================================================
   CONFIGURATION
   Point this at the SAME backend/database the admin-site
   and teacher-site apps use.
===================================================== */

const API_URL = "http://localhost:5000/api";

let currentUser = null;
let accessToken = null;
let html5QrCode = null;
let lastScannedToken = null;

const onLoginPage = !!document.getElementById("loginForm");
const onDashboardPage = !!document.getElementById("appPage");


/* =====================================================
   INIT
===================================================== */

document.addEventListener("DOMContentLoaded", () => {
    accessToken = localStorage.getItem("studentAccessToken");
    const storedUser = localStorage.getItem("studentCurrentUser");

    if (onDashboardPage) {
        if (accessToken && storedUser) {
            currentUser = JSON.parse(storedUser);
            if (currentUser.role !== "student") { logout(); return; }
            showDashboard();
        } else {
            window.location.href = "login.html";
        }
    } else if (onLoginPage && accessToken && storedUser) {
        window.location.href = "dashboard.html";
    }
});


/* =====================================================
   API HELPER
===================================================== */

async function apiRequest(endpoint, options = {}) {
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

    const response = await fetch(API_URL + endpoint, { ...options, headers });
    const contentType = response.headers.get("content-type");
    const data = contentType && contentType.includes("application/json")
        ? await response.json()
        : { message: await response.text() };

    if (!response.ok) throw new Error(data.error || data.message || "Request failed");
    return data;
}


/* =====================================================
   LOGIN / REGISTER TOGGLE
===================================================== */

function showRegisterSection() {
    document.getElementById("loginSection").classList.add("hidden");
    document.getElementById("registerSection").classList.remove("hidden");
}
function showLoginSection() {
    document.getElementById("registerSection").classList.add("hidden");
    document.getElementById("loginSection").classList.remove("hidden");
}

const loginForm = document.getElementById("loginForm");
if (loginForm) {
    loginForm.addEventListener("submit", async function (event) {
        event.preventDefault();
        const email = document.getElementById("loginEmail").value.trim();
        const password = document.getElementById("loginPassword").value;
        const message = document.getElementById("loginMessage");

        message.textContent = "Logging in...";
        message.className = "message";

        try {
            const data = await apiRequest("/auth/login", {
                method: "POST",
                body: JSON.stringify({ email, password })
            });

            if (data.user.role !== "student") {
                message.textContent = "This account is not a student account.";
                message.className = "message error";
                return;
            }

            localStorage.setItem("studentAccessToken", data.access_token);
            localStorage.setItem("studentCurrentUser", JSON.stringify(data.user));
            message.textContent = "Login successful";
            message.className = "message success";
            setTimeout(() => window.location.href = "dashboard.html", 300);

        } catch (error) {
            message.textContent = error.message;
            message.className = "message error";
        }
    });
}

const registerForm = document.getElementById("registerForm");
if (registerForm) {
    registerForm.addEventListener("submit", async function (event) {
        event.preventDefault();
        const message = document.getElementById("registerMessage");
        const body = {
            name: document.getElementById("registerName").value.trim(),
            email: document.getElementById("registerEmail").value.trim(),
            password: document.getElementById("registerPassword").value,
            role: "student",
            roll_number: document.getElementById("rollNumber").value.trim()
        };

        message.textContent = "Creating account...";
        message.className = "message";

        try {
            await apiRequest("/auth/register", { method: "POST", body: JSON.stringify(body) });
            message.textContent = "Registration successful. You can now login.";
            message.className = "message success";
            registerForm.reset();
            setTimeout(showLoginSection, 800);
        } catch (error) {
            message.textContent = error.message;
            message.className = "message error";
        }
    });
}


/* =====================================================
   DASHBOARD
===================================================== */

function showDashboard() {
    document.getElementById("sidebarUserName").textContent = currentUser.name;
    document.getElementById("sidebarUserRole").textContent = currentUser.role;
    document.getElementById("topUserName").textContent = currentUser.name;
    loadDashboard();
}

async function loadDashboard() {
    setActiveNav(0);
    document.getElementById("pageTitle").textContent = "Dashboard";
    try {
        await loadSummary();
        await loadAttendanceHistory();
    } catch (error) {
        console.error(error);
    }
}

async function loadAttendance() {
    setActiveNav(1);
    document.getElementById("pageTitle").textContent = "Attendance History";
    try {
        await loadAttendanceHistory();
        await loadSummary();
    } catch (error) {
        console.error(error);
    }
}

function setActiveNav(index) {
    document.querySelectorAll(".nav-btn").forEach((btn, i) => btn.classList.toggle("active", i === index));
}


/* =====================================================
   SUMMARY
===================================================== */

async function loadSummary() {
    const summary = await apiRequest("/attendance/my/summary");
    const totalClasses = summary.total_classes || 0;
    const present = summary.present || 0;
    const overall = totalClasses > 0 ? (present / totalClasses * 100) : 0;

    document.getElementById("overallAttendance").textContent = `${overall.toFixed(1)}%`;

    const container = document.getElementById("studentSummary");
    if (!totalClasses) {
        container.innerHTML = "<p class='muted'>No attendance data yet.</p>";
        return;
    }
    const percentage = summary.percentage ?? overall;
    const color = percentage >= 75 ? "#16a34a" : "#dc2626";
    container.innerHTML = `
        <div class="summary-item">
            <div class="summary-top"><strong>Daily Attendance</strong><strong style="color:${color}">${percentage}%</strong></div>
            <div class="progress"><div class="progress-bar" style="width:${Math.min(percentage,100)}%; background:${color};"></div></div>
            <small class="muted">${present} present / ${totalClasses} total days</small>
        </div>`;
}


/* =====================================================
   ATTENDANCE HISTORY
===================================================== */

async function loadAttendanceHistory() {
    const records = await apiRequest("/attendance/my");
    const container = document.getElementById("studentAttendanceTable");
    if (!records.length) {
        container.innerHTML = "<p class='muted'>No attendance records yet.</p>";
        return;
    }
    container.innerHTML = `
        <table>
            <thead><tr><th>Roll Number</th><th>Date</th><th>Time</th><th>Status</th></tr></thead>
            <tbody>
                ${records.map(r => {
                    const d = new Date(r.marked_at);
                    return `<tr>
                        <td>${escapeHtml(r.roll_number)}</td>
                        <td>${d.toLocaleDateString()}</td>
                        <td>${d.toLocaleTimeString()}</td>
                        <td class="status-present">✓ Present</td>
                    </tr>`;
                }).join("")}
            </tbody>
        </table>`;
}


/* =====================================================
   REAL CAMERA SCANNER
===================================================== */

function startScanner() {
    const message = document.getElementById("scanMessage");
    message.textContent = "Starting camera...";
    message.className = "message";
    if (html5QrCode) return;

    html5QrCode = new Html5Qrcode("reader");
    const config = { fps: 10, qrbox: { width: 240, height: 240 } };

    html5QrCode.start({ facingMode: "environment" }, config, onQrScanned, () => {}).then(() => {
        document.getElementById("startScannerBtn").classList.add("hidden");
        document.getElementById("stopScannerBtn").classList.remove("hidden");
        message.textContent = "Camera active. Point it at the teacher's QR — it rotates every second, so scan while it's showing.";
        message.className = "message success";
    }).catch(error => {
        console.error(error);
        message.textContent = "Unable to access camera. Please allow camera permission.";
        message.className = "message error";
    });
}

async function onQrScanned(decodedText) {
    if (!html5QrCode) return;
    if (decodedText === lastScannedToken) return; // ignore repeat reads of the same rotating frame
    lastScannedToken = decodedText;

    await stopScanner();
    const message = document.getElementById("scanMessage");
    message.textContent = "Checking attendance...";
    message.className = "message";

    try {
        const data = await apiRequest("/attendance/scan", {
            method: "POST",
            body: JSON.stringify({ token: decodedText })
        });
        message.textContent = data.message;
        message.className = "message success";
        await loadDashboard();
    } catch (error) {
        message.textContent = error.message;
        message.className = "message error";
    }
}

async function stopScanner() {
    if (!html5QrCode) return;
    try { await html5QrCode.stop(); } catch (error) { console.error(error); }
    try { html5QrCode.clear(); } catch (error) { console.error(error); }
    html5QrCode = null;
    document.getElementById("startScannerBtn").classList.remove("hidden");
    document.getElementById("stopScannerBtn").classList.add("hidden");
}


/* =====================================================
   LOGOUT / UTILITIES
===================================================== */

async function logout() {
    await stopScanner();
    localStorage.removeItem("studentAccessToken");
    localStorage.removeItem("studentCurrentUser");
    window.location.href = "login.html";
}

function escapeHtml(value) {
    if (value === null || value === undefined) return "";
    return String(value)
        .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
