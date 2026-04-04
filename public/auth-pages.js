const API_URL = `${window.location.origin}/api/v1`;
const AUTH_TOKEN_KEY = "authToken";
const AUTH_USER_KEY = "authUser";

function normalizeRole(role) {
    const normalized = (role || "student").toLowerCase();
    return normalized === "member" ? "student" : normalized;
}

async function signup() {
    const nameEl = document.getElementById("signupName");
    const emailEl = document.getElementById("signupEmail");
    const passwordEl = document.getElementById("signupPassword");
    const roleEl = document.getElementById("signupRole");

    if (!nameEl || !emailEl || !passwordEl || !roleEl) return;

    const name = nameEl.value.trim();
    const email = emailEl.value.trim();
    const password = passwordEl.value;
    const role = roleEl.value;

    if (!name || !email || !password) {
        alert("Please fill name, email and password");
        return;
    }

    const res = await fetch(`${API_URL}/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, role }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        alert(data.error || "Signup failed");
        return;
    }

    alert("Signup successful. Please login now.");
    window.location.href = "login.html";
}

async function login() {
    const emailEl = document.getElementById("loginEmail");
    const passwordEl = document.getElementById("loginPassword");
    if (!emailEl || !passwordEl) return;

    const email = emailEl.value.trim();
    const password = passwordEl.value;

    if (!email || !password) {
        alert("Please fill email and password");
        return;
    }

    const res = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        alert(data.error || "Login failed");
        return;
    }

    const normalizedUser = {
        ...data.user,
        role: normalizeRole(data.user?.role),
    };

    localStorage.setItem(AUTH_TOKEN_KEY, data.token);
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(normalizedUser));

    alert("Login successful");
    window.location.href = "index.html";
}
