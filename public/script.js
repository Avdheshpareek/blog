const API_URL = `${window.location.origin}/api/v1`;
const HERO_LIKE_KEY = "heroLikeCount";
const AUTH_TOKEN_KEY = "authToken";
const AUTH_USER_KEY = "authUser";
const MAX_SOURCE_IMAGE_FILE_SIZE_BYTES = 8 * 1024 * 1024;
const MAX_IMAGE_PAYLOAD_BYTES = 1.5 * 1024 * 1024;

let editingPostId = null;
let selectedImageFile = null;
let showOnlyMyPosts = false;
let cachedPosts = [];

function getToken() {
    return localStorage.getItem(AUTH_TOKEN_KEY);
}

function getCurrentUser() {
    const storedUser = localStorage.getItem(AUTH_USER_KEY);
    if (!storedUser) return null;

    try {
        const parsedUser = JSON.parse(storedUser);
        return {
            ...parsedUser,
            role: normalizeRole(parsedUser.role),
        };
    } catch (_) {
        return null;
    }
}

function normalizeRole(role) {
    return (role || "student").toLowerCase() === "member" ? "student" : (role || "student").toLowerCase();
}

function getAuthHeaders() {
    const token = getToken();
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
}

function isAdmin() {
    return normalizeRole(getCurrentUser()?.role) === "admin";
}

function isStudent() {
    return normalizeRole(getCurrentUser()?.role) === "student";
}

function canEditPost(post, user) {
    if (!user) return false;
    if (isAdmin()) {
        const authorRole = normalizeRole(post?.author?.role);
        return authorRole === "student" || post?.author?._id === user.id;
    }
    return post?.author?._id === user.id;
}

function canDeletePost(post, user) {
    if (!user) return false;
    if (isAdmin()) return true;
    return post?.author?._id === user.id;
}

function hasUserLikedPost(post, user) {
    if (!post || !user) return false;

    return (post.likes || []).some((like) => {
        const likedBy = typeof like === "string" ? like : like?.user;
        return likedBy === user.id || likedBy === user.name;
    });
}

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function setPostFormMode(isEditing) {
    const heading = document.getElementById("postFormHeading");
    const submitBtn = document.getElementById("postSubmitBtn");
    const cancelBtn = document.getElementById("postCancelBtn");

    if (heading) heading.textContent = isEditing ? "Edit Blog" : "Create Blog";
    if (submitBtn) submitBtn.textContent = isEditing ? "Update Blog" : "Publish";
    if (cancelBtn) cancelBtn.style.display = isEditing ? "inline-block" : "none";
}

function resetPostForm() {
    const title = document.getElementById("postTitle");
    const body = document.getElementById("postBody");
    const imageUrl = document.getElementById("postImageUrl");
    const imageFile = document.getElementById("postImageFile");
    const imagePreview = document.getElementById("postImagePreview");

    if (title) title.value = "";
    if (body) body.value = "";
    if (imageUrl) imageUrl.value = "";
    if (imageFile) imageFile.value = "";
    if (imagePreview) {
        imagePreview.src = "";
        imagePreview.style.display = "none";
    }

    editingPostId = null;
    selectedImageFile = null;
    setPostFormMode(false);
}

function initImagePicker() {
    const imageFileInput = document.getElementById("postImageFile");
    const imageUrlInput = document.getElementById("postImageUrl");
    const imagePreview = document.getElementById("postImagePreview");
    if (!imageFileInput) return;

    imageFileInput.addEventListener("change", (event) => {
        const [file] = event.target.files || [];
        if (!file) {
            selectedImageFile = null;
            if (imagePreview) {
                imagePreview.src = "";
                imagePreview.style.display = "none";
            }
            return;
        }

        if (file.size > MAX_SOURCE_IMAGE_FILE_SIZE_BYTES) {
            selectedImageFile = null;
            imageFileInput.value = "";
            alert("Image file is too large. Please choose an image under 8MB.");
            return;
        }

        selectedImageFile = file;
        if (imagePreview) {
            imagePreview.src = URL.createObjectURL(file);
            imagePreview.style.display = "block";
        }
    });

    if (imageUrlInput) {
        imageUrlInput.addEventListener("input", () => {
            const value = imageUrlInput.value.trim();
            if (!value || selectedImageFile) return;

            if (imagePreview) {
                imagePreview.src = value;
                imagePreview.style.display = "block";
            }
        });
    }
}

function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
        reader.onerror = () => reject(new Error("Failed to read image file"));
        reader.readAsDataURL(file);
    });
}

function loadImage(dataUrl) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("Invalid image"));
        image.src = dataUrl;
    });
}

function estimateDataUrlBytes(dataUrl) {
    const base64 = (dataUrl.split(",")[1] || "");
    return Math.ceil((base64.length * 3) / 4);
}

async function compressImageFile(file) {
    const dataUrl = await fileToDataUrl(file);
    const image = await loadImage(dataUrl);

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) return dataUrl;

    const maxDimension = 1400;
    let width = image.width;
    let height = image.height;

    if (width > maxDimension || height > maxDimension) {
        const scale = Math.min(maxDimension / width, maxDimension / height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
    }

    canvas.width = width;
    canvas.height = height;
    context.drawImage(image, 0, 0, width, height);

    let quality = 0.85;
    let output = canvas.toDataURL("image/jpeg", quality);

    while (estimateDataUrlBytes(output) > MAX_IMAGE_PAYLOAD_BYTES && quality > 0.35) {
        quality -= 0.1;
        output = canvas.toDataURL("image/jpeg", quality);
    }

    return output;
}

async function getPostImagePayload(imageUrl) {
    if (selectedImageFile) {
        const compressedImage = await compressImageFile(selectedImageFile);
        if (estimateDataUrlBytes(compressedImage) > MAX_IMAGE_PAYLOAD_BYTES) {
            throw new Error("Image is still too large after compression. Try a smaller image.");
        }
        return compressedImage;
    }

    return imageUrl;
}

function updateAuthStatus() {
    const authStatus = document.getElementById("authStatus");
    if (!authStatus) return;

    const user = getCurrentUser();
    if (!user) {
        authStatus.className = "auth-status auth-status-guest";
        authStatus.innerHTML = `
            <span class="auth-status-badge">Offline</span>
            <div class="auth-status-text">
                <strong>Not logged in</strong>
                <span>Log in to publish blogs, like posts, and join the conversation.</span>
            </div>
        `;
        return;
    }

    const role = normalizeRole(user.role);
    const isAdminUser = role === "admin";
    authStatus.className = `auth-status ${isAdminUser ? "auth-status-admin" : "auth-status-student"}`;
    authStatus.innerHTML = `
        <span class="auth-status-badge">${isAdminUser ? "Admin" : "Student"}</span>
        <div class="auth-status-text">
            <strong>Welcome back, ${escapeHtml(user.name)}</strong>
            <span>${isAdminUser ? "You are logged in as admin and can manage the full blog space." : "You are logged in as student and can create and manage your own blogs."}</span>
        </div>
    `;
}

function updateAuthButtons() {
    const signupBtn = document.getElementById("signupBtn");
    const loginBtn = document.getElementById("loginBtn");
    const myBlogsBtn = document.getElementById("myBlogsBtn");
    const adminPanelBtn = document.getElementById("adminPanelBtn");
    const logoutBtn = document.getElementById("logoutBtn");
    const user = getCurrentUser();

    if (!signupBtn || !loginBtn || !logoutBtn || !adminPanelBtn || !myBlogsBtn) return;

    if (user) {
        signupBtn.style.display = "none";
        loginBtn.style.display = "none";
        myBlogsBtn.style.display = isStudent() ? "inline-block" : "none";
        adminPanelBtn.style.display = isAdmin() ? "inline-block" : "none";
        logoutBtn.style.display = "inline-block";
        return;
    }

    signupBtn.style.display = "inline-block";
    loginBtn.style.display = "inline-block";
    myBlogsBtn.style.display = "none";
    adminPanelBtn.style.display = "none";
    logoutBtn.style.display = "none";
}

function updateAdminPanelVisibility() {
    const myBlogsBtn = document.getElementById("myBlogsBtn");
    const adminPanelBtn = document.getElementById("adminPanelBtn");
    const adminModal = document.getElementById("adminPanelModal");
    if (myBlogsBtn) {
        myBlogsBtn.style.display = getCurrentUser() && isStudent() ? "inline-block" : "none";
    }
    if (adminPanelBtn) {
        adminPanelBtn.style.display = getCurrentUser() && isAdmin() ? "inline-block" : "none";
    }

    if (!isAdmin()) {
        closeAdminPanel();
    } else if (adminModal) {
        adminModal.style.display = adminModal.style.display === "flex" ? "flex" : "none";
    }

    if (!isStudent()) {
        closeMyBlogsPanel();
    }
}

function openAdminPanel() {
    if (!isAdmin()) return;

    const adminModal = document.getElementById("adminPanelModal");
    if (!adminModal) return;

    adminModal.style.display = "flex";
    document.body.classList.add("admin-modal-open");
}

function closeAdminPanel() {
    const adminModal = document.getElementById("adminPanelModal");
    if (adminModal) {
        adminModal.style.display = "none";
    }
    if (document.getElementById("myBlogsModal")?.style.display !== "flex") {
        document.body.classList.remove("admin-modal-open");
    }
}

function handleAdminModalBackdrop(event) {
    if (event.target.id === "adminPanelModal") {
        closeAdminPanel();
    }
}

function createMyBlogRow(post) {
    const likesCount = Array.isArray(post?.likes) ? post.likes.length : 0;

    return `
        <article class="admin-post-row">
            <div class="admin-post-meta">
                <span><strong>User:</strong> ${escapeHtml(post?.author?.name || "Unknown")}</span>
                <span><strong>Role:</strong> ${escapeHtml(normalizeRole(post?.author?.role || "unknown"))}</span>
            </div>
            <h4>${escapeHtml(post?.title || "Untitled Blog")}</h4>
            <div class="admin-post-footer">
                <span><strong>Likes:</strong> ${likesCount}</span>
                <div class="admin-post-actions">
                    <button type="button" onclick="startEditPost('${post._id}'); closeMyBlogsPanel();">Edit</button>
                    <button type="button" class="delete-btn" onclick="deletePost('${post._id}')">Delete</button>
                </div>
            </div>
        </article>
    `;
}

function renderMyBlogsPanel(posts) {
    const myBlogsPostsContainer = document.getElementById("myBlogsPostsContainer");
    if (!myBlogsPostsContainer) return;

    if (!isStudent()) {
        myBlogsPostsContainer.innerHTML = "";
        return;
    }

    const currentUser = getCurrentUser();
    const myPosts = posts.filter((post) => post?.author?._id === currentUser?.id);

    myBlogsPostsContainer.innerHTML = myPosts.length
        ? myPosts.map(createMyBlogRow).join("")
        : `<p class="admin-empty-state">You have not posted any blogs yet.</p>`;
}

function openMyBlogsPanel() {
    if (!isStudent()) return;

    const myBlogsModal = document.getElementById("myBlogsModal");
    if (!myBlogsModal) return;

    renderMyBlogsPanel(cachedPosts);
    myBlogsModal.style.display = "flex";
    document.body.classList.add("admin-modal-open");
}

function closeMyBlogsPanel() {
    const myBlogsModal = document.getElementById("myBlogsModal");
    if (myBlogsModal) {
        myBlogsModal.style.display = "none";
    }
    if (document.getElementById("adminPanelModal")?.style.display !== "flex") {
        document.body.classList.remove("admin-modal-open");
    }
}

function handleMyBlogsModalBackdrop(event) {
    if (event.target.id === "myBlogsModal") {
        closeMyBlogsPanel();
    }
}

function updateMyBlogsToggleButton() {
    const toggleBtn = document.getElementById("myBlogsToggleBtn");
    if (!toggleBtn) return;

    if (!getCurrentUser() || !isStudent()) {
        showOnlyMyPosts = false;
        toggleBtn.style.display = "none";
        return;
    }

    toggleBtn.style.display = "inline-block";
    toggleBtn.textContent = showOnlyMyPosts ? "Show All Blogs" : "Show My Blogs";
}

function toggleMyBlogsView() {
    if (!isStudent()) return;
    showOnlyMyPosts = !showOnlyMyPosts;
    updateMyBlogsToggleButton();
    fetchPosts();
}

function updateLikeAccess() {
    const isLoggedIn = Boolean(getToken());
    const heroLikeBtn = document.getElementById("heroLikeBtn");
    const postLikeButtons = document.querySelectorAll('[data-action="post-like"]');

    if (heroLikeBtn) {
        heroLikeBtn.disabled = !isLoggedIn;
        heroLikeBtn.title = isLoggedIn ? "" : "Please login to like";
    }

    postLikeButtons.forEach((button) => {
        button.disabled = !isLoggedIn;
        button.title = isLoggedIn ? "" : "Please login to like";
    });
}

function showAuthForm(formType) {
    const authPanel = document.getElementById("authPanel");
    const signupForm = document.getElementById("signupForm");
    const loginForm = document.getElementById("loginForm");

    if (!authPanel || !signupForm || !loginForm) return;
    authPanel.style.display = "block";
    signupForm.style.display = formType === "signup" ? "block" : "none";
    loginForm.style.display = formType === "login" ? "block" : "none";
}

function initHeroLikeButton() {
    const heroLikeBtn = document.getElementById("heroLikeBtn");
    const likeCountEl = document.getElementById("likeCount");

    if (!heroLikeBtn || !likeCountEl) return;

    let count = Number.parseInt(localStorage.getItem(HERO_LIKE_KEY) || "0", 10);
    if (Number.isNaN(count)) count = 0;

    likeCountEl.textContent = count;

    heroLikeBtn.addEventListener("click", () => {
        count += 1;
        likeCountEl.textContent = count;
        localStorage.setItem(HERO_LIKE_KEY, String(count));
    });
}

function getVisiblePosts(posts) {
    if (showOnlyMyPosts && isStudent()) {
        const currentUser = getCurrentUser();
        if (!currentUser) return [];
        return posts.filter((post) => post?.author?._id === currentUser.id);
    }

    return posts;
}

function createAdminPostRow(post) {
    const likesCount = Array.isArray(post?.likes) ? post.likes.length : 0;

    return `
        <article class="admin-post-row">
            <div class="admin-post-meta">
                <span><strong>User:</strong> ${escapeHtml(post?.author?.name || "Unknown")}</span>
                <span><strong>Role:</strong> ${escapeHtml(normalizeRole(post?.author?.role || "unknown"))}</span>
            </div>
            <h4>${escapeHtml(post?.title || "Untitled Blog")}</h4>
            <div class="admin-post-footer">
                <span><strong>Likes:</strong> ${likesCount}</span>
                <div class="admin-post-actions">
                    <button type="button" onclick="startEditPost('${post._id}')">Edit</button>
                    <button type="button" class="delete-btn" onclick="deletePost('${post._id}')">Delete</button>
                </div>
            </div>
        </article>
    `;
}

function renderAdminPanel(posts) {
    const allPostsContainer = document.getElementById("adminAllPostsContainer");
    const adminOwnPostsContainer = document.getElementById("adminOwnPostsContainer");

    if (!allPostsContainer || !adminOwnPostsContainer) return;

    if (!isAdmin()) {
        allPostsContainer.innerHTML = "";
        adminOwnPostsContainer.innerHTML = "";
        return;
    }

    const adminPosts = posts.filter((post) => normalizeRole(post?.author?.role) === "admin");
    const renderEmptyState = (message) => `<p class="admin-empty-state">${message}</p>`;

    allPostsContainer.innerHTML = posts.length
        ? posts.map(createAdminPostRow).join("")
        : renderEmptyState("No blogs found.");

    adminOwnPostsContainer.innerHTML = adminPosts.length
        ? adminPosts.map(createAdminPostRow).join("")
        : renderEmptyState("No admin blogs found.");
}

async function fetchAdminPosts() {
    if (!isAdmin() || !getToken()) {
        renderAdminPanel([]);
        return;
    }

    try {
        const res = await fetch(`${API_URL}/posts/admin`, {
            headers: getAuthHeaders(),
        });

        if (res.ok) {
            const data = await res.json();
            renderAdminPanel(data.posts || []);
            return;
        }
    } catch (_) {}

    // Fallback: build the admin panel from the already-fetched public posts list.
    renderAdminPanel(cachedPosts);
}

function applyPostImageLayout(image) {
    if (!image) return;

    const frame = image.closest(".post-image-frame");
    if (!frame || !image.naturalWidth || !image.naturalHeight) return;

    const ratio = image.naturalWidth / image.naturalHeight;
    let imageShape = "square";

    if (ratio > 1.15) {
        imageShape = "landscape";
    } else if (ratio < 0.85) {
        imageShape = "portrait";
    }

    frame.dataset.imageShape = imageShape;
    image.dataset.imageShape = imageShape;
}

function initPostImageLayouts() {
    document.querySelectorAll(".post-image-frame .post-image").forEach((image) => {
        if (image.complete) {
            applyPostImageLayout(image);
            return;
        }

        image.addEventListener("load", () => applyPostImageLayout(image), { once: true });
    });
}

async function fetchPosts() {
    const res = await fetch(`${API_URL}/posts`);
    const data = await res.json();
    const container = document.getElementById("postsContainer") || document.getElementById("feed");
    container.innerHTML = "";

    cachedPosts = data.posts || [];
    const posts = getVisiblePosts(cachedPosts);
    const user = getCurrentUser();

    posts
        .slice()
        .reverse()
        .forEach((post) => {
            const div = document.createElement("div");
            div.className = "post-card";
            div.dataset.postId = post._id;

            const commentsHtml = (post.comments || [])
                .map(
                    (c) => `
            <div class="comment-item"><strong>${escapeHtml(c.user)}:</strong> ${escapeHtml(c.body)}</div>
        `
                )
                .join("");

            const showEdit = canEditPost(post, user);
            const showDelete = canDeletePost(post, user);
            const isLikedByUser = hasUserLikedPost(post, user);

            const imageBlock = post.image
                ? `
                    <div class="post-image-frame" style="--post-image-bg: url('${post.image}')">
                        <div class="post-image-backdrop"></div>
                        <img class="post-image" src="${post.image}" alt="${escapeHtml(post.title)}">
                    </div>
                `
                : "";

            div.innerHTML = `
            <h3>${escapeHtml(post.title)}</h3>
            <p style="font-size: 12px; color: #b7ffe9;">By ${escapeHtml(post.author?.name || "Unknown")} (${escapeHtml(normalizeRole(post.author?.role || "unknown"))})</p>
            ${imageBlock}
            <p>${escapeHtml(post.body)}</p>
            <div class="actions">
                <button
                    data-action="post-like"
                    data-liked="${isLikedByUser ? "true" : "false"}"
                    class="${isLikedByUser ? "post-like-btn liked" : "post-like-btn"}"
                    onclick="handleLike('${post._id}')"
                >&#10084; ${(post.likes || []).length}</button>
                ${showEdit ? `<button onclick="startEditPost('${post._id}')" style="margin-left: 8px;">Edit</button>` : ""}
                ${showDelete ? `<button class="delete-btn" onclick="deletePost('${post._id}')" style="margin-left: 8px;">Delete</button>` : ""}
                <span style="color: #09edb0; font-size: 14px; margin-left:10px;"> ${(post.comments || []).length} Comments</span>
            </div>
            <br>
            <div class="comment-section">
                <div class="comments-list">${commentsHtml}</div>
                <div class="comment-input-group">
                    <input type="text" id="text-${post._id}" placeholder="Add a comment...">
                    <button onclick="addComment('${post._id}')">Send</button>
                </div>
            </div>
        `;
            container.appendChild(div);
        });

    if (!posts.length) {
        const noPostsMessage = showOnlyMyPosts && isStudent()
            ? "You have not posted any blogs yet."
            : "No blogs yet.";
        container.innerHTML = `<p style="color: #fff;">${noPostsMessage}</p>`;
    }

    updateLikeAccess();
    updateMyBlogsToggleButton();
    updateAdminPanelVisibility();
    renderMyBlogsPanel(cachedPosts);
    initPostImageLayouts();
    await fetchAdminPosts();
}

async function signup() {
    const name = document.getElementById("signupName").value.trim();
    const email = document.getElementById("signupEmail").value.trim();
    const password = document.getElementById("signupPassword").value;
    const role = document.getElementById("signupRole").value;

    if (!name || !email || !password) {
        alert("Please fill name, email and password");
        return;
    }

    const res = await fetch(`${API_URL}/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, role }),
    });

    const data = await res.json();
    if (!res.ok) {
        alert(data.error || "Signup failed");
        return;
    }

    alert("Signup successful. Please login now.");
    showAuthForm("login");
}

async function login() {
    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;

    if (!email || !password) {
        alert("Please fill email and password");
        return;
    }

    const res = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
    });

    const data = await res.json();
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
    updateAuthStatus();
    updateAuthButtons();
    updateMyBlogsToggleButton();
    updateAdminPanelVisibility();
    const authPanel = document.getElementById("authPanel");
    if (authPanel) authPanel.style.display = "none";
    updateLikeAccess();
    await fetchPosts();
    alert("Login successful");
}

function logout() {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_USER_KEY);
    showOnlyMyPosts = false;
    closeAdminPanel();
    closeMyBlogsPanel();
    resetPostForm();
    updateAuthStatus();
    updateAuthButtons();
    updateMyBlogsToggleButton();
    updateLikeAccess();
    updateAdminPanelVisibility();
    fetchPosts();
    alert("Logged out");
}

async function addComment(postId) {
    const bodyInput = document.getElementById(`text-${postId}`);
    const body = bodyInput?.value?.trim();

    if (!body) return alert("Write a comment");
    if (!getToken()) return alert("Please login first");

    const res = await fetch(`${API_URL}/comments/create`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ post: postId, body }),
    });

    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Failed to add comment");
        return;
    }

    fetchPosts();
}

async function handleLike(postId) {
    if (!getToken()) return alert("Please login first");
    const user = getCurrentUser();
    const post = cachedPosts.find((item) => item._id === postId);
    const hasLiked = hasUserLikedPost(post, user);

    const endpoint = hasLiked ? "unlike" : "like";
    const res = await fetch(`${API_URL}/likes/${endpoint}`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ post: postId }),
    });

    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || `Failed to ${hasLiked ? "unlike" : "like"} post`);
        return;
    }

    fetchPosts();
}

async function startEditPost(postId) {
    let post = cachedPosts.find((p) => p._id === postId);

    if (!post) {
        const res = await fetch(`${API_URL}/posts`);
        const data = await res.json();
        cachedPosts = data.posts || [];
        post = cachedPosts.find((p) => p._id === postId);
    }

    if (!post) {
        alert("Post not found");
        return;
    }

    const title = document.getElementById("postTitle");
    const body = document.getElementById("postBody");
    const imageUrl = document.getElementById("postImageUrl");
    const fileInput = document.getElementById("postImageFile");

    if (title) title.value = post.title || "";
    if (body) body.value = post.body || "";
    if (imageUrl) imageUrl.value = post.image || "";
    if (fileInput) fileInput.value = "";
    const imagePreview = document.getElementById("postImagePreview");
    if (imagePreview) {
        imagePreview.src = post.image || "";
        imagePreview.style.display = post.image ? "block" : "none";
    }

    selectedImageFile = null;
    editingPostId = postId;
    setPostFormMode(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
}

function cancelEditPost() {
    resetPostForm();
}

async function createPost() {
    const title = document.getElementById("postTitle").value.trim();
    const body = document.getElementById("postBody").value.trim();
    const imageUrl = document.getElementById("postImageUrl").value.trim();

    if (!getToken()) return alert("Please login first");
    if (!title || !body) return alert("Please add title and body");

    let image = imageUrl;
    try {
        image = await getPostImagePayload(imageUrl);
    } catch (error) {
        alert(error.message || "Failed to process image");
        return;
    }

    if (editingPostId) {
        const updateRes = await fetch(`${API_URL}/posts/${editingPostId}`, {
            method: "PUT",
            headers: getAuthHeaders(),
            body: JSON.stringify({ title, body, image }),
        });

        if (!updateRes.ok) {
            const data = await updateRes.json().catch(() => ({}));
            const errorMessage = updateRes.status === 413
                ? "Image is too large. Please use a smaller image."
                : (data.error || "Failed to update post");
            alert(errorMessage);
            return;
        }

        alert("Post updated successfully");
        resetPostForm();
        fetchPosts();
        return;
    }

    const createRes = await fetch(`${API_URL}/posts/create`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ title, body, image }),
    });

    if (!createRes.ok) {
        const data = await createRes.json().catch(() => ({}));
        const errorMessage = createRes.status === 413
            ? "Image is too large. Please use a smaller image."
            : (data.error || "Failed to create post");
        alert(errorMessage);
        return;
    }

    alert("Post created successfully");
    resetPostForm();
    fetchPosts();
}

async function deletePost(postId) {
    const isConfirmed = window.confirm("Are you sure you want to delete this post?");
    if (!isConfirmed) return;
    if (!getToken()) return alert("Please login first");

    let res = await fetch(`${API_URL}/posts/${postId}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
    });

    // Fallback for environments where DELETE requests are blocked/mishandled
    if (!res.ok) {
        res = await fetch(`${API_URL}/posts/delete`, {
            method: "POST",
            headers: getAuthHeaders(),
            body: JSON.stringify({ id: postId }),
        });
    }

    if (!res.ok) {
        let errorMessage = "Failed to delete post";
        try {
            const errorData = await res.json();
            errorMessage = errorData.error || errorMessage;
        } catch (_) {}
        alert(errorMessage);
        return;
    }

    fetchPosts();
}

fetchPosts();
initHeroLikeButton();
initImagePicker();
updateAuthStatus();
updateAuthButtons();
updateMyBlogsToggleButton();
updateLikeAccess();
updateAdminPanelVisibility();
setPostFormMode(false);
document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
        closeAdminPanel();
        closeMyBlogsPanel();
    }
});
