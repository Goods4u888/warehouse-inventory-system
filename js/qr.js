// ============================================================================
// QR generation (for the printable sticker) and camera scanning.
// Generation uses the QRCode library (davidshimjs), scanning uses jsQR —
// both loaded as plain globals from cdnjs in index.html.
// ============================================================================

const QR = {
  /**
   * Render a QR code for an item into a container element.
   * Encodes the item's sku_code ONLY — never a quantity, per the original
   * per-lot spec this carries forward: the sticker is permanent (printed
   * once, stuck on a bin/shelf, scanned for the item's whole life), so
   * nothing mutable belongs in the code itself.
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
   * Build the printable sticker markup for an item: QR + human-readable
   * SKU name/code, sized for a common label printer. One sticker per item,
   * good for the item's whole life — not tied to any single receive/return
   * event — so `eventLabel`/`eventDate` are optional and the date line is
   * omitted entirely when they're not supplied (e.g. printing from Manage
   * Items rather than right after receiving/returning stock).
   *
   * `idPrefix` namespaces the QR container's id (default 'sticker-qr-',
   * matching every existing caller). Callers that can be live in the DOM at
   * the same time as another sticker for the same sku_code — e.g. Manage
   * Items' print flows, which can be opened while a receive/return
   * confirmation sticker is still sitting in #receive-result/#return-result
   * on the Receive tab — should pass their own prefix so the two don't
   * collide on the same id.
   */
  stickerHtml({ skuCode, skuName, eventLabel, eventDate, idPrefix = 'sticker-qr-' }) {
    return `
      <div class="sticker">
        <div class="sticker-qr" id="${idPrefix}${skuCode}"></div>
        <div class="sticker-text">
          <div class="sticker-sku">${skuCode} · ${skuName}</div>
          ${eventLabel && eventDate ? `<div class="sticker-date">${eventLabel} ${eventDate}</div>` : ''}
        </div>
      </div>`;
  },

  // -- Camera scanning --------------------------------------------------------
  _stream: null,
  _raf: null,
  // Bumped by stopScanner() to invalidate any in-flight tick()/detect() call
  // from a loop that's already been stopped — needed now that detection can
  // genuinely be async (BarcodeDetector), so a stop can land mid-await
  // instead of always between synchronous frame processing like before.
  _scanId: 0,

  // How long to let the camera try before telling the user it can't read the
  // code — long enough that normal aiming/focusing isn't mistaken for
  // failure, short enough that someone stuck on a damaged/glare-covered
  // sticker isn't left staring at a silent camera preview.
  NOT_RECOGNIZED_MS: 8000,

  async startScanner(videoEl, canvasEl, onDetect, onError, onNotRecognized) {
    const scanId = ++this._scanId;
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
      if (scanId !== this._scanId) return; // stopped while awaiting camera permission
      videoEl.srcObject = this._stream;
      await videoEl.play();
      if (scanId !== this._scanId) return;

      // Prefer the browser's native BarcodeDetector when it exists and
      // actually claims QR support. It runs through the OS's own vision
      // pipeline — on Android Chrome that's the same Play-Services ML
      // decoder behind Google Lens and the native camera's code scanner —
      // instead of jsQR's pure-JS frame-diff algorithm, so it copes far
      // better with the blur/glare/off-angle real phones produce even with
      // the getUserMedia tuning above. This is exactly the gap reported in
      // practice: the native camera reads a sticker fine, jsQR alone
      // doesn't. jsQR stays as the fallback for browsers that don't ship
      // it (desktop Safari/Firefox, some older/desktop Chrome builds).
      let detector = null;
      if ('BarcodeDetector' in window) {
        try {
          const formats = await window.BarcodeDetector.getSupportedFormats();
          if (formats.includes('qr_code')) {
            detector = new window.BarcodeDetector({ formats: ['qr_code'] });
          }
        } catch (_) {
          detector = null;
        }
      }
      if (scanId !== this._scanId) return;

      const ctx = detector ? null : canvasEl.getContext('2d', { willReadFrequently: true });
      const startedAt = Date.now();
      let notRecognizedFired = false;
      const tick = async () => {
        if (scanId !== this._scanId) return; // superseded by a stop/restart
        try {
          if (videoEl.readyState === videoEl.HAVE_ENOUGH_DATA) {
            let value = null;
            if (detector) {
              // detect() reads the live <video> frame directly — no manual
              // canvas draw/getImageData needed on this path.
              const codes = await detector.detect(videoEl);
              if (scanId !== this._scanId) return; // stopped mid-detect
              if (codes && codes.length) value = codes[0].rawValue;
            } else {
              canvasEl.width = videoEl.videoWidth;
              canvasEl.height = videoEl.videoHeight;
              ctx.drawImage(videoEl, 0, 0, canvasEl.width, canvasEl.height);
              const imageData = ctx.getImageData(0, 0, canvasEl.width, canvasEl.height);
              // eslint-disable-next-line no-undef
              // 'attemptBoth' also tries the color-inverted image — costs a
              // bit of CPU per frame but catches glare/lighting conditions
              // that flip local contrast on a glossy printed sticker, which
              // 'dontInvert' would miss.
              const code = jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: 'attemptBoth',
              });
              if (code && code.data) value = code.data;
            }
            if (value && value.trim()) {
              onDetect(value.trim());
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
    this._scanId++; // invalidate any in-flight tick()/detect() from this loop
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
    if (this._stream) {
      this._stream.getTracks().forEach((t) => t.stop());
      this._stream = null;
    }
    if (videoEl) videoEl.srcObject = null;
  },
};
