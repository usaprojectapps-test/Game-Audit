// qr-scanner.js
// Global reusable QR scanner module
// Requires: jsQR loaded globally (window.jsQR)

(function () {
  let stream = null;
  let animationId = null;

  function ensureModal() {
    if (document.getElementById("globalQRModal")) return;

    const modal = document.createElement("div");
    modal.id = "globalQRModal";
    modal.style.display = "none";
    modal.className = "qr-overlay";

    modal.innerHTML = `
      <div class="qr-modal" role="dialog" aria-modal="true">
        <video id="globalQRVideo" class="qr-video"></video>
        <button id="globalQRCloseBtn" class="qr-close-btn">Close</button>
      </div>
    `;

    document.body.appendChild(modal);

    modal.addEventListener("click", (ev) => {
      if (ev.target === modal) closeModal();
    });

    document.getElementById("globalQRCloseBtn").addEventListener("click", (e) => {
      e.preventDefault();
      closeModal();
    });
  }

  function openModal() {
    const modal = document.getElementById("globalQRModal");
    if (modal) modal.style.display = "flex";
  }

  function closeModal() {
    stopCamera();
    const modal = document.getElementById("globalQRModal");
    if (modal) modal.style.display = "none";
  }

  async function startCamera(onScan, targetInputId) {
    const video = document.getElementById("globalQRVideo");
    if (!video) return;

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" }
      });

      video.srcObject = stream;
      video.setAttribute("playsinline", "true");
      await video.play();

      decodeLoop(video, onScan, targetInputId);
    } catch (err) {
      console.error("Camera error:", err);
      closeModal();
    }
  }

  function stopCamera() {
    if (animationId) cancelAnimationFrame(animationId);
    animationId = null;

    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }

    const video = document.getElementById("globalQRVideo");
    if (video) {
      try {
        video.pause();
        video.srcObject = null;
      } catch (e) {}
    }
  }

  function decodeLoop(video, onScan, targetInputId) {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    const loop = () => {
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        try {
          // ⭐ FIX: use window.jsQR instead of jsQR
          const code = window.jsQR(
            ctx.getImageData(0, 0, canvas.width, canvas.height).data,
            canvas.width,
            canvas.height,
            { inversionAttempts: "attemptBoth" }
          );

          if (code && code.data) {
            let value = code.data.trim();

            // Extract only the machine number (digits)
            const match = value.match(/(\d+)/);
            if (match) {
              value = match[1];
            }


            if (targetInputId) {
              const input = document.getElementById(targetInputId);
              if (input) {
                input.value = value;
                input.dispatchEvent(new Event("change", { bubbles: true }));
              }
            }

            if (typeof onScan === "function") onScan(value);

            closeModal();
            return;
          }
        } catch (err) {
          console.error("QR decode error:", err);
        }
      }

      animationId = requestAnimationFrame(loop);
    };

    animationId = requestAnimationFrame(loop);
  }

  window.qrScanner = {
    open({ targetInputId = null, onScan = null } = {}) {
      ensureModal();
      openModal();
      startCamera(onScan, targetInputId);
    },
    close() {
      closeModal();
    }
  };
})();
