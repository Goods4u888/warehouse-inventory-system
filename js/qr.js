// ============================================================================
// QR generation (for the printable sticker) and camera scanning.
// Generation uses the QRCode library (davidshimjs), scanning uses jsQR —
// both loaded as plain globals from cdnjs in index.html.
// ============================================================================

const QR = {
  /**
   * Render a QR code for a lot code into a container element.
   * Encodes the lot code ONLY — never quantity, per the spec: a printed
   * sticker can't be updated once it's on the batch, so nothing mutable
   * belongs in the code itself.
   */
  renderInto(el, text, size = 168) {
    el.innerHTML = '';
    // eslint-disable-next-line no-undef
    new QRCode(el, {
      text,
      width: size,
      height: size,
      correctLevel: QRCode.CorrectLevel.M,
    });
  },

  /**
   * Build the printable sticker markup for a lot: QR + human-readable
   * SKU name, lot code, and receive date, sized for a common label printer.
   */
  stickerHtml({ lotCode, skuCode, skuName, receiveDate }) {
    return `
      <div class="sticker">
        <div class="sticker-qr" id="sticker-qr-${lotCode}"></div>
        <div class="sticker-text">
          <div class="sticker-sku">${skuCode} · ${skuName}</div>
          <div class="sticker-lot">${lotCode}</div>
          <div class="sticker-date">Received ${receiveDate}</div>
        </div>
      </div>`;
  },

  // -- Camera scanning --------------------------------------------------------
  _stream: null,
  _raf: null,

  async startScanner(videoEl, canvasEl, onDetect, onError) {
    try {
      this._stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
    } catch (err) {
      onError && onError(err);
      return;
    }
    videoEl.srcObject = this._stream;
    await videoEl.play();

    const ctx = canvasEl.getContext('2d', { willReadFrequently: true });
    const tick = () => {
      if (videoEl.readyState === videoEl.HAVE_ENOUGH_DATA) {
        canvasEl.width = videoEl.videoWidth;
        canvasEl.height = videoEl.videoHeight;
        ctx.drawImage(videoEl, 0, 0, canvasEl.width, canvasEl.height);
        const imageData = ctx.getImageData(0, 0, canvasEl.width, canvasEl.height);
        // eslint-disable-next-line no-undef
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert',
        });
        if (code && code.data) {
          onDetect(code.data.trim());
          return; // caller decides whether to restart
        }
      }
      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  },

  stopScanner(videoEl) {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
    if (this._stream) {
      this._stream.getTracks().forEach((t) => t.stop());
      this._stream = null;
    }
    if (videoEl) videoEl.srcObject = null;
  },
};
