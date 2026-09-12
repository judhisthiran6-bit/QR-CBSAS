/* =====================================================
   CONFIGURATION
===================================================== */

const API_URL = "http://localhost:5000/api";

let currentUser = null;
let accessToken = null;

let currentSessionId = null;
let qrTimerInterval = null;

let html5QrCode = null;


/* =====================================================
   INITIALIZATION
   (this file is shared by the login pages and app.html -
   PAGE_ROLE is defined inline on teacher-login.html /
   student-login.html; #appPage only exists on app.html)
===================================================== */

document.addEventListener("DOMContentLoaded", () => {
    accessToken = localStorage.getItem("accessToken");
    const storedUser = localStorage.getItem("currentUser");
    const onAppPage = !!document.getElementById("appPage");

    if (onAppPage) {
        if (accessToken && storedUser) {
            currentUser = JSON.parse(storedUser);
            showApplication();
        } else {
            // Not logged in - send back to the role-selection page.
            window.location.href = "index.html";
        }
    } else if (accessToken && storedUser) {
        // Already logged in but sitting on a login page - skip ahead.
        window.location.href = "app.html";
    }
});


/* =====================================================
   API HELPER
===================================================== */

async function apiRequest(endpoint, options = {}) {
    const headers = {
        "Content-Type": "application/json",
        ...(options.headers || {})
    };

    if (accessToken) {
        headers["Authorization"] = `Bearer ${accessToken}`;
    }

    try {
        const response = await fetch(API_URL + endpoint, {
            ...options,
            headers
        });

        const contentType = response.headers.get("content-type");
        let data;

        if (contentType && contentType.includes("application/json")) {
            data = await response.json();
        } else {
            data = { message: await response.text() };
        }

        if (!response.ok) {
            throw new Error(data.error || data.message || "Request failed");
        }

        return data;

    } catch (error) {
        console.error(error);
        throw error;
    }
}


/* =====================================================
   LOGIN
   (only runs on pages that actually have a #loginForm,
   i.e. teacher-login.html / student-login.html)
===================================================== */

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

            localStorage.setItem("accessToken", data.access_token);
            localStorage.setItem("currentUser", JSON.stringify(data.user));

            message.textContent = "Login successful";
            message.className = "message success";

            setTimeout(() => {
                window.location.href = "app.html";
            }, 300);

        } catch (error) {
            message.textContent = error.message;
            message.className = "message error";
        }
    });
}


/* =====================================================
   REGISTER / LOGIN CARD TOGGLE
===================================================== */

function showRegisterSection() {
    document.getElementById("loginSection").classList.add("hidden");
    document.getElementById("registerSection").classList.remove("hidden");
}

function showLoginSection() {
    document.getElementById("registerSection").classList.add("hidden");
    document.getElementById("loginSection").classList.remove("hidden");
}


/* =====================================================
   REGISTRATION
   (role is fixed per page via PAGE_ROLE, no toggle needed)
===================================================== */

const registerForm = document.getElementById("registerForm");

if (registerForm) {
    registerForm.addEventListener("submit", async function (event) {
        event.preventDefault();

        const message = document.getElementById("registerMessage");

        const body = {
            name: document.getElementById("registerName").value.trim(),
            email: document.getElementById("registerEmail").value.trim(),
            password: document.getElementById("registerPassword").value,
            role: PAGE_ROLE
        };

        if (PAGE_ROLE === "student") {
            body.roll_number = document.getElementById("rollNumber").value.trim();
        } else {
            body.employee_id = document.getElementById("employeeId").value.trim();
        }

        message.textContent = "Creating account...";
        message.className = "message";

        try {
            await apiRequest("/auth/register", {
                method: "POST",
                body: JSON.stringify(body)
            });

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
   APPLICATION
   (showApplication and everything below only run on
   app.html, since that's the only page with #appPage)
===================================================== */

function showApplication() {
    document.getElementById("sidebarUserName").textContent = currentUser.name;
    document.getElementById("sidebarUserRole").textContent = currentUser.role;
    document.getElementById("topUserName").textContent = currentUser.name;

    setupNavigation();
    loadDashboard();
}


/* =====================================================
   NAVIGATION
===================================================== */

function setupNavigation() {
    const nav = document.getElementById("navigation");
    nav.innerHTML = "";

    if (currentUser.role === "admin") {
        nav.innerHTML = `
            <button class="nav-btn active" onclick="loadDashboard()">📊 Dashboard</button>
            <button class="nav-btn" onclick="loadAdminUsers()">👥 Users</button>
        `;
    } else if (currentUser.role === "teacher") {
        nav.innerHTML = `
            <button class="nav-btn active" onclick="loadDashboard()">📊 Dashboard</button>
            <button class="nav-btn" onclick="loadTeacherSessions()">📋 Daily Sessions</button>
        `;
    } else {
        nav.innerHTML = `
            <button class="nav-btn active" onclick="loadDashboard()">📊 Dashboard</button>
            <button class="nav-btn" onclick="loadStudentAttendance()">📋 Attendance History</button>
        `;
    }
}


/* =====================================================
   DASHBOARD
===================================================== */

async function loadDashboard() {
    hideAllDashboards();
    document.getElementById("pageTitle").textContent = "Dashboard";

    if (currentUser.role === "admin") {
        document.getElementById("adminDashboard").classList.remove("hidden");
        await loadAdminDashboard();
    } else if (currentUser.role === "teacher") {
        document.getElementById("teacherDashboard").classList.remove("hidden");
        await loadTeacherDashboard();
    } else {
        document.getElementById("studentDashboard").classList.remove("hidden");
        await loadStudentDashboard();
    }
}

function hideAllDashboards() {
    document.querySelectorAll(".dashboard-section").forEach(section => {
        section.classList.add("hidden");
    });
}


/* =====================================================
   ADMIN
===================================================== */

async function loadAdminDashboard() {
    try {
        const users = await apiRequest("/users");
        const teachers = await apiRequest("/teachers");
        const attendance = await apiRequest("/admin/attendance");

        document.getElementById("adminUsersCount").textContent = users.length;
        document.getElementById("adminTeachersCount").textContent = teachers.length;
        document.getElementById("adminAttendanceCount").textContent = attendance.length;

        renderUsers(users);
    } catch (error) {
        console.error(error);
    }
}


/* =====================================================
   ADMIN USERS
===================================================== */

async function loadAdminUsers() {
    try {
        const users = await apiRequest("/users");
        renderUsers(users);
    } catch (error) {
        console.error(error);
    }
}

function renderUsers(users) {
    const container = document.getElementById("usersTable");

    if (!users.length) {
        container.innerHTML = "<p class='muted'>No users found.</p>";
        return;
    }

    let html = `
        <table>
            <thead>
                <tr>
                    <th>ID</th>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                </tr>
            </thead>
            <tbody>
    `;

    users.forEach(user => {
        html += `
            <tr>
                <td>${user.id}</td>
                <td>${escapeHtml(user.name)}</td>
                <td>${escapeHtml(user.email)}</td>
                <td>${escapeHtml(user.role)}</td>
            </tr>
        `;
    });

    html += `
            </tbody>
        </table>
    `;

    container.innerHTML = html;
}


/* =====================================================
   TEACHER DASHBOARD
===================================================== */

async function loadTeacherDashboard() {
    try {
        const sessions = await apiRequest("/teacher/sessions");

        document.getElementById("teacherSessionCount").textContent = sessions.length;
        renderTeacherSessions(sessions);
    } catch (error) {
        console.error(error);
    }
}


/* =====================================================
   GENERATE QR FOR DAILY ATTENDANCE
===================================================== */

const attendanceForm = document.getElementById("attendanceForm");

if (attendanceForm) {
    attendanceForm.addEventListener("submit", async function (event) {
        event.preventDefault();

        const expiry = document.getElementById("expiryMinutes").value;
        const message = document.getElementById("teacherMessage");

        try {
            const data = await apiRequest("/attendance/sessions", {
                method: "POST",
                body: JSON.stringify({
                    type: "daily",
                    expiry_minutes: Number(expiry)
                })
            });

            currentSessionId = data.session.id;

            document.getElementById("qrCard").classList.remove("hidden");
            document.getElementById("qrSubject").textContent = "Daily Attendance";

            const qr = document.getElementById("qrcode");
            qr.innerHTML = "";

            new QRCode(qr, {
                text: data.qr_data,
                width: 250,
                height: 250,
                colorDark: "#000000",
                colorLight: "#ffffff",
                correctLevel: QRCode.CorrectLevel.H
            });

            startQrTimer(data.session.expires_at);

            message.textContent = "Daily attendance session started.";
            message.className = "message success";

            await loadTeacherSessions();

        } catch (error) {
            message.textContent = error.message;
            message.className = "message error";
        }
    });
}


/* =====================================================
   QR TIMER
===================================================== */

function startQrTimer(expiresAt) {
    clearInterval(qrTimerInterval);

    function updateTimer() {
        const expiration = new Date(expiresAt).getTime();
        const now = new Date().getTime();
        const difference = expiration - now;

        if (difference <= 0) {
            clearInterval(qrTimerInterval);
            document.getElementById("qrTimer").textContent = "EXPIRED";
            document.getElementById("qrTimer").style.color = "#dc2626";
            return;
        }

        const totalSeconds = Math.floor(difference / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;

        document.getElementById("qrTimer").textContent = 
            `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    }

    updateTimer();
    qrTimerInterval = setInterval(updateTimer, 1000);
}


/* =====================================================
   CLOSE SESSION
===================================================== */

async function closeAttendanceSession() {
    if (!currentSessionId) return;

    try {
        await apiRequest(`/attendance/sessions/${currentSessionId}/close`, {
            method: "POST"
        });

        clearInterval(qrTimerInterval);

        document.getElementById("qrTimer").textContent = "CLOSED";
        document.getElementById("teacherMessage").textContent = "Attendance session closed.";
        document.getElementById("teacherMessage").className = "message success";

        currentSessionId = null;
        await loadTeacherSessions();

    } catch (error) {
        alert(error.message);
    }
}


/* =====================================================
   TEACHER SESSIONS
===================================================== */

async function loadTeacherSessions() {
    try {
        const sessions = await apiRequest("/teacher/sessions");
        renderTeacherSessions(sessions);
    } catch (error) {
        console.error(error);
    }
}

function renderTeacherSessions(sessions) {
    const container = document.getElementById("teacherSessionsTable");

    if (!sessions.length) {
        container.innerHTML = "<p class='muted'>No attendance sessions yet.</p>";
        return;
    }

    let html = `
        <table>
            <thead>
                <tr>
                    <th>ID</th>
                    <th>Type</th>
                    <th>Started</th>
                    <th>Expires</th>
                    <th>Status</th>
                    <th>Records</th>
                </tr>
            </thead>
            <tbody>
    `;

    sessions.forEach(session => {
        html += `
            <tr>
                <td>${session.id}</td>
                <td>Daily Attendance</td>
                <td>${formatDate(session.started_at)}</td>
                <td>${formatDate(session.expires_at)}</td>
                <td>${session.active ? "🟢 Active" : "🔴 Closed"}</td>
                <td>
                    <button class="small-btn" onclick="viewSessionAttendance(${session.id})">
                        View
                    </button>
                </td>
            </tr>
        `;
    });

    html += `
            </tbody>
        </table>
    `;

    container.innerHTML = html;
}


/* =====================================================
   SESSION ATTENDANCE
===================================================== */

async function viewSessionAttendance(sessionId) {
    try {
        const data = await apiRequest(`/attendance/sessions/${sessionId}`);

        let text = `Daily Attendance Session\n\n`;
        text += `Present: ${data.total_present}\n\n`;

        data.attendance.forEach(record => {
            text += `${record.roll_number} - ${record.student_name}\n`;
        });

        alert(text);
    } catch (error) {
        alert(error.message);
    }
}


/* =====================================================
   STUDENT DASHBOARD
===================================================== */

async function loadStudentDashboard() {
    try {
        await loadStudentSummary();
        await loadStudentAttendance();
    } catch (error) {
        console.error(error);
    }
}


/* =====================================================
   STUDENT SUMMARY
===================================================== */

async function loadStudentSummary() {
    try {
        const summary = await apiRequest("/attendance/my/summary");

        const totalClasses = summary.total_classes || 0;
        const totalPresent = summary.present || 0;
        const overall = totalClasses > 0 ? (totalPresent / totalClasses * 100) : 0;

        document.getElementById("overallAttendance").textContent = `${overall.toFixed(1)}%`;
        renderStudentSummary(summary);

    } catch (error) {
        console.error(error);
    }
}

function renderStudentSummary(summary) {
    const container = document.getElementById("studentSummary");

    if (!summary || !summary.total_classes) {
        container.innerHTML = "<p class='muted'>No attendance data yet.</p>";
        return;
    }

    container.innerHTML = "";
    const div = document.createElement("div");
    div.className = "summary-item";

    const percentage = summary.percentage || 0;
    let color = percentage >= 75 ? "#16a34a" : "#dc2626";

    div.innerHTML = `
        <div class="summary-top">
            <strong>Daily Attendance</strong>
            <strong style="color:${color}">${percentage}%</strong>
        </div>
        <div class="progress">
            <div class="progress-bar" style="width:${Math.min(percentage, 100)}%; background:${color};"></div>
        </div>
        <small class="muted">${summary.present} present / ${summary.total_classes} total days</small>
    `;

    container.appendChild(div);
}


/* =====================================================
   STUDENT ATTENDANCE HISTORY
===================================================== */

async function loadStudentAttendance() {
    try {
        const records = await apiRequest("/attendance/my");
        renderStudentAttendance(records);
        await loadStudentSummary();
    } catch (error) {
        console.error(error);
    }
}

function renderStudentAttendance(records) {
    const container = document.getElementById("studentAttendanceTable");

    if (!records.length) {
        container.innerHTML = "<p class='muted'>No attendance records yet.</p>";
        return;
    }

    let html = `
        <table>
            <thead>
                <tr>
                    <th>Type</th>
                    <th>Roll Number</th>
                    <th>Date</th>
                    <th>Time</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody>
    `;

    records.forEach(record => {
        const date = new Date(record.marked_at);
        html += `
            <tr>
                <td>Daily Attendance</td>
                <td>${escapeHtml(record.roll_number)}</td>
                <td>${date.toLocaleDateString()}</td>
                <td>${date.toLocaleTimeString()}</td>
                <td class="status-present">✓ Present</td>
            </tr>
        `;
    });

    html += `
            </tbody>
        </table>
    `;

    container.innerHTML = html;
}


/* =====================================================
   QR SCANNER
===================================================== */

function startScanner() {
    const message = document.getElementById("scanMessage");
    message.textContent = "Starting camera...";
    message.className = "message";

    if (html5QrCode) return;

    html5QrCode = new Html5Qrcode("reader");

    const config = {
        fps: 10,
        qrbox: { width: 250, height: 250 }
    };

    html5QrCode.start(
        { facingMode: "environment" },
        config,
        onQrScanned,
        onQrError
    ).then(() => {
        document.getElementById("startScannerBtn").classList.add("hidden");
        document.getElementById("stopScannerBtn").classList.remove("hidden");

        message.textContent = "Camera active. Scan the QR code.";
        message.className = "message success";
    }).catch(error => {
        console.error(error);
        message.textContent = "Unable to access camera. Please allow camera permission.";
        message.className = "message error";
    });
}

function onQrError(errorMessage) {}

async function onQrScanned(decodedText) {
    if (!html5QrCode) return;

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

        await loadStudentDashboard();

    } catch (error) {
        message.textContent = error.message;
        message.className = "message error";
    }
}


/* =====================================================
   STOP SCANNER
===================================================== */

async function stopScanner() {
    if (!html5QrCode) return;

    try {
        await html5QrCode.stop();
    } catch (error) {
        console.error(error);
    }

    try {
        html5QrCode.clear();
    } catch (error) {
        console.error(error);
    }

    html5QrCode = null;

    document.getElementById("startScannerBtn").classList.remove("hidden");
    document.getElementById("stopScannerBtn").classList.add("hidden");
}


/* =====================================================
   LOGOUT
===================================================== */

async function logout() {
    await stopScanner();
    clearInterval(qrTimerInterval);

    accessToken = null;
    currentUser = null;
    currentSessionId = null;

    localStorage.removeItem("accessToken");
    localStorage.removeItem("currentUser");

    window.location.href = "index.html";
}


/* =====================================================
   UTILITIES
===================================================== */

function formatDate(value) {
    if (!value) return "-";
    return new Date(value).toLocaleString();
}

function escapeHtml(value) {
    if (value === null || value === undefined) return "";
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}