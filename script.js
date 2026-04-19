document.addEventListener("DOMContentLoaded", function () {

  /* ── Starfield ── */
  const starsContainer = document.getElementById("stars");
  for (let i = 0; i < 120; i++) {
    const star = document.createElement("div");
    star.className = "star";
    const size = Math.random() * 3 + 1;
    star.style.cssText = [
      "width:"           + size + "px",
      "height:"          + size + "px",
      "top:"             + (Math.random() * 100) + "%",
      "left:"            + (Math.random() * 100) + "%",
      "--d:"             + (Math.random() * 3 + 1.5).toFixed(2) + "s",
      "animation-delay:" + (Math.random() * 4).toFixed(2) + "s"
    ].join(";");
    starsContainer.appendChild(star);
  }

  /* ── Responsive cake scaling ── */
  /* Cake is designed at 460px wide. On narrower screens we scale it down. */
  const CAKE_DESIGN_W = 460;
  const cake    = document.getElementById("cake");
  const wrapper = document.getElementById("cakeWrapper");

  function scaleCake() {
    const available = Math.min(window.innerWidth - 32, CAKE_DESIGN_W);
    const s = available / CAKE_DESIGN_W;
    cake.style.transform = "scale(" + s + ")";
    /* Shrink the wrapper height to match the scaled cake so nothing overlaps */
    cake.style.transformOrigin = "top center";
    wrapper.style.height = Math.round(360 * s + 60) + "px"; /* 360 = cake height, 60 = plate room */
  }
  scaleCake();
  window.addEventListener("resize", scaleCake);

  /* ── Candle logic ── */
  const icing              = document.getElementById("icing");
  const candleCountDisplay = document.getElementById("candleCount");
  const micBtn             = document.getElementById("micBtn");
  const micStatus          = document.getElementById("micStatus");

  let candles    = [];
  let audioContext, analyser, microphone;
  let micStarted = false;
  let baseline   = 0;

  const BASELINE_SMOOTH = 0.97;
  const SPIKE_RATIO     = 1.6;
  const MIN_LEVEL       = 8;

  function updateCandleCount() {
    const active = candles.filter(function(c) {
      return !c.classList.contains("out");
    }).length;
    candleCountDisplay.textContent = active;
  }

  /* Place candle coords are in cake's UNSCALED space */
  function addCandle(xInCake, yInCake) {
    const candle = document.createElement("div");
    candle.className = "candle";
    candle.style.left = xInCake + "px";
    candle.style.top  = yInCake + "px";
    const flame = document.createElement("div");
    flame.className = "flame";
    candle.appendChild(flame);
    cake.appendChild(candle);
    candles.push(candle);
    updateCandleCount();
  }

  /* ── Hit-test: is this screen point inside the icing ellipse? ── */
  function isInsideIcing(clientX, clientY) {
    const r  = icing.getBoundingClientRect();
    const cx = r.left + r.width  / 2;
    const cy = r.top  + r.height / 2;
    /* Inset slightly so edge candles don't spill */
    const rx = r.width  / 2 * 0.88;
    const ry = r.height / 2 * 0.80;
    const dx = clientX - cx;
    const dy = clientY - cy;
    return (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1;
  }

  /* Convert screen coords → unscaled cake coords */
  function screenToCake(clientX, clientY) {
    const cakeRect = cake.getBoundingClientRect();
    const s = CAKE_DESIGN_W / cakeRect.width; /* inverse of current scale */
    return {
      x: (clientX - cakeRect.left) * s,
      y: (clientY - cakeRect.top)  * s
    };
  }

  function placeCandle(clientX, clientY) {
    if (!isInsideIcing(clientX, clientY)) return;
    const pos = screenToCake(clientX, clientY);
    addCandle(pos.x, pos.y);
  }

  /* Click (desktop) */
  icing.addEventListener("click", function (e) {
    e.stopPropagation();
    placeCandle(e.clientX, e.clientY);
  });

  /* Touch (mobile) — preventDefault stops the ghost click */
  icing.addEventListener("touchend", function (e) {
    e.preventDefault();
    var t = e.changedTouches[0];
    placeCandle(t.clientX, t.clientY);
  }, { passive: false });

  /* ── Blow detection ── */
  function getRMS() {
    var buf = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(buf);
    var lo  = Math.floor(buf.length * 0.02);
    var hi  = Math.floor(buf.length * 0.35);
    var sum = 0;
    for (var i = lo; i < hi; i++) sum += buf[i] * buf[i];
    return Math.sqrt(sum / (hi - lo));
  }

  function checkBlow() {
    var level = getRMS();
    if (level > MIN_LEVEL) {
      baseline = baseline * BASELINE_SMOOTH + level * (1 - BASELINE_SMOOTH);
    }
    var threshold = Math.max(baseline * SPIKE_RATIO, MIN_LEVEL * 2);
    var isBlowing = level > threshold;

    if (micStatus) {
      micStatus.textContent       = isBlowing ? "💨 Blowing detected!" : "🎤 Listening…";
      micStatus.dataset.blowing   = isBlowing ? "1" : "0";
      micStatus.style.color       = isBlowing ? "#fff176" : "rgba(255,255,255,0.6)";
    }

    if (isBlowing) {
      var blownOut = 0;
      candles.forEach(function(c) {
        if (!c.classList.contains("out") && Math.random() > 0.3) {
          c.classList.add("out");
          blownOut++;
        }
      });
      if (blownOut > 0) updateCandleCount();
    }
  }

  /* ── Start mic (must be inside a user gesture for iOS) ── */
  function startMic() {
    if (micStarted) return;
    micStarted = true;
    micBtn.textContent = "Requesting mic…";
    micBtn.disabled    = true;

    navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      .then(function (stream) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        if (audioContext.state === "suspended") audioContext.resume();

        analyser = audioContext.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.4;

        microphone = audioContext.createMediaStreamSource(stream);
        microphone.connect(analyser);

        /* Warm up baseline for 1 s before actively checking */
        setTimeout(function() {
          setInterval(checkBlow, 100);
        }, 1000);

        micBtn.textContent = "🎤 Mic ON — blow now!";
        micBtn.classList.add("active");
        if (micStatus) micStatus.textContent = "🎤 Listening…";
      })
      .catch(function (err) {
        console.error("Mic error:", err);
        micBtn.textContent = "❌ Mic denied — tap to retry";
        micBtn.disabled    = false;
        micStarted         = false;
      });
  }

  micBtn.addEventListener("click", startMic);
  micBtn.addEventListener("touchend", function(e) {
    e.preventDefault();
    startMic();
  }, { passive: false });
});
