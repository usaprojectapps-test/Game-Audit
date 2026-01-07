// /js_new/toast.js

export function showToast(message, type = "info") {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const toast = document.createElement("div");
  toast.textContent = message;
  toast.style.padding = "10px 16px";
  toast.style.borderRadius = "6px";
  toast.style.color = "#fff";
  toast.style.fontSize = "14px";
  toast.style.boxShadow = "0 2px 6px rgba(0,0,0,0.2)";
  toast.style.opacity = "0";
  toast.style.transition = "opacity 0.3s ease";

  // Colors by type
  if (type === "success") toast.style.background = "#28a745";
  else if (type === "error") toast.style.background = "#dc3545";
  else if (type === "warning") toast.style.background = "#ffc107";
  else toast.style.background = "#007bff";

  container.appendChild(toast);

  // Fade in
  requestAnimationFrame(() => {
    toast.style.opacity = "1";
  });

  // Auto remove after 3s
  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => container.removeChild(toast), 300);
  }, 3000);
}