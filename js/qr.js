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
   * `label` defaults to "Received" (the ordinary receiving flow); the
   * return flow passes "Returned" instead so a returned lot's sticker
   * doesn't read as a fresh delivery.
   */
  stickerHtml({ lotCode, skuCode, skuName, receiveDate, label = 'Received' }) {
    return `
      <div class="sticker">
        <div class="sticker-qr" id="sticker-qr-${lotCode}"></div>
        <div class="sticker-text">
          <div class="sticker-sku">${skuCode} · ${skuName}</div>
          <div class="sticker-lot">${lotCode}</div>
          <div class="sticker-date">${label} ${receiveDate}</div>
        </div>
      </div>`;
  },

  // -- Camera scanning --------------------------------------------------------
  _stream: null,
  _raf: null,

  // How long to let the camera try before telling the user it can't read the
  // code — long enough that normal aiming/focusing isn't mistaken for
  // failure, short enough that someone stuck on a damaged/glare-covered
  // sticker isn't left staring at a silent camera preview.
  NOT_RECOGNIZED_MS: 8000,

  async startScanner(videoEl, canvasEl, onDetect, onError, onNotRecognized) {
    try {
      // Ask for a higher-resolution stream with continuous autofocus — plain
      // `{ facingMode: 'environment' }` lets the browser pick whatever it
      // wants, which on a lot of Android/Chrome phones turns out to be a
      // low-res feed that's locked to far-field focus after the first frame.
      // That's fine for a video call but leaves a QR sticker held a few
      // inches from the lens permanently blurry, so the preview shows but
      // nothing ever decodes. `advanced` constraints a device doesn't
      // support can make the whole getUserMedia call reject outright
      // (rather than just being ignored), so fall back to the plain
      // constraint set if the richer one fails.
      try {
        this._stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
            advanced: [{ focusMode: 'continuous' }],
          },
        });
      } catch (_) {
        this._stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
      }
      videoEl.srcObject = this._stream;
      await videoEl.play();

      const ctx = canvasEl.getContext('2d', { willReadFrequently: true });
      const startedAt = Date.now();
      let notRecognizedFired = false;
      const tick = () => {
        try {
          if (videoEl.readyState === videoEl.HAVE_ENOUGH_DATA) {
            canvasEl.width = videoEl.videoWidth;
            canvasEl.height = videoEl.videoHeight;
            ctx.drawImage(videoEl, 0, 0, canvasEl.width, canvasEl.height);
            const imageData = ctx.getImageData(0, 0, canvasEl.width, canvasEl.height);
            // eslint-disable-next-line no-undef
            // 'attemptBoth' also tries the color-inverted image — costs a bit
            // of CPU per frame but catches glare/lighting conditions that
            // flip local contrast on a glossy printed sticker, which
            // 'dontInvert' would miss.
            const code = jsQR(imageData.data, imageData.width, imageData.height, {
              inversionAttempts: 'attemptBoth',
            });
            if (code && code.data) {
              onDetect(code.data.trim());
              return; // caller decides whether to restart
            }
          }
          // Most frames simply won't line up on a code yet — that's normal
          // mid-aim, not a failure, so this only fires once after a real
          // stretch of no successful reads (and keeps scanning afterwards,
          // in case they reposition and it succeeds a moment later).
          if (!notRecognizedFired && Date.now() - startedAt > QR.NOT_RECOGNIZED_MS) {
            notRecognizedFired = true;
            onNotRecognized && onNotRecognized();
          }
          this._raf = requestAnimationFrame(tick);
        } catch (err) {
          // A frame-processing error (e.g. a transient canvas/security
          // error) used to silently kill the whole requestAnimationFrame
          // loop — camera preview stays live but scanning quietly stops
          // forever. Report it instead of dying silently.
          onError && onError(err);
        }
      };
      this._raf = requestAnimationFrame(tick);
    } catch (err) {
      onError && onError(err);
    }
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
