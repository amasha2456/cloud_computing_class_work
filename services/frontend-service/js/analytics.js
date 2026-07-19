(function () {
  var COLLECT_URL =
    (window.API_BASE && window.API_BASE.analytics ? window.API_BASE.analytics : "") +
    "/collect";
  var FLUSH_INTERVAL_MS = 5000;
  var CLIENT_MAX_QUEUE = 20;
  var SESSION_TIMEOUT_MS = 30 * 60 * 1000;

  var VISITOR_KEY = "av_visitor_id";
  var SESSION_KEY = "av_session_id";
  var SESSION_LAST_ACTIVE_KEY = "av_session_last_active";
  var ATTRIBUTION_KEY = "av_attribution";

  var queue = [];
  var sessionId = "";
  var attribution = null;

  function parseUserAgent(ua) {
    ua = ua || "";

    var device = "desktop";
    if (/tablet|ipad/i.test(ua)) {
      device = "tablet";
    } else if (/mobi|android|iphone/i.test(ua)) {
      device = "mobile";
    }

    var browser = "other";
    if (/edg\//i.test(ua)) {
      browser = "edge";
    } else if (/opr\//i.test(ua) || /opera/i.test(ua)) {
      browser = "opera";
    } else if (/chrome|crios/i.test(ua)) {
      browser = "chrome";
    } else if (/firefox|fxios/i.test(ua)) {
      browser = "firefox";
    } else if (/safari/i.test(ua)) {
      browser = "safari";
    }

    var os = "other";
    if (/windows/i.test(ua)) {
      os = "windows";
    } else if (/mac os x/i.test(ua)) {
      os = "macos";
    } else if (/android/i.test(ua)) {
      os = "android";
    } else if (/iphone|ipad|ipod/i.test(ua)) {
      os = "ios";
    } else if (/linux/i.test(ua)) {
      os = "linux";
    }

    return { device_type: device, browser: browser, os: os };
  }

  var device = parseUserAgent(navigator.userAgent);

  function generateUUID() {
    if (window.crypto && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    // crypto.randomUUID is only available in secure contexts (HTTPS or
    // localhost) - fall back to Math.random for plain-HTTP deployments.
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function getVisitorId() {
    var id = localStorage.getItem(VISITOR_KEY);
    if (!id) {
      id = generateUUID();
      localStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  }

  var visitorId = getVisitorId();

  function parseUtm(search) {
    var params = new URLSearchParams(search || "");
    return {
      utm_source: params.get("utm_source") || "",
      utm_medium: params.get("utm_medium") || "",
      utm_campaign: params.get("utm_campaign") || "",
    };
  }

  function loadAttribution() {
    var stored = sessionStorage.getItem(ATTRIBUTION_KEY);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {
        // fall through and recompute
      }
    }
    var utm = parseUtm(location.search);
    var computed = {
      referrer: document.referrer || "",
      utm_source: utm.utm_source,
      utm_medium: utm.utm_medium,
      utm_campaign: utm.utm_campaign,
    };
    sessionStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(computed));
    return computed;
  }

  function ensureSession() {
    var last = Number(sessionStorage.getItem(SESSION_LAST_ACTIVE_KEY) || 0);
    var isNew =
      !sessionStorage.getItem(SESSION_KEY) || Date.now() - last > SESSION_TIMEOUT_MS;

    if (isNew) {
      sessionStorage.setItem(SESSION_KEY, generateUUID());
      sessionStorage.removeItem(ATTRIBUTION_KEY);
      attribution = null;
    }

    sessionStorage.setItem(SESSION_LAST_ACTIVE_KEY, String(Date.now()));
    sessionId = sessionStorage.getItem(SESSION_KEY);

    if (!attribution) {
      attribution = loadAttribution();
    }

    return isNew;
  }

  function track(eventType, opts) {
    opts = opts || {};
    ensureSession();

    queue.push({
      event_type: eventType,
      client_ts: new Date().toISOString(),
      visitor_id: visitorId,
      session_id: sessionId,
      page_path: location.pathname,
      section_id: opts.section || "",
      target: opts.target || "",
      label: opts.label || "",
      value: typeof opts.value === "number" ? opts.value : 0,
      referrer: attribution.referrer,
      utm_source: attribution.utm_source,
      utm_medium: attribution.utm_medium,
      utm_campaign: attribution.utm_campaign,
      device_type: device.device_type,
      browser: device.browser,
      os: device.os,
      properties: opts.properties || {},
    });

    if (queue.length >= CLIENT_MAX_QUEUE) {
      flush(false);
    }
  }

  function flush(useBeacon) {
    if (queue.length === 0 || !COLLECT_URL) {
      return;
    }

    var payload = JSON.stringify({ events: queue });
    queue = [];

    if (useBeacon && navigator.sendBeacon) {
      var blob = new Blob([payload], { type: "application/json" });
      navigator.sendBeacon(COLLECT_URL, blob);
      return;
    }

    fetch(COLLECT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(function () {});
  }

  function setupSectionTracking() {
    if (!("IntersectionObserver" in window)) {
      return;
    }
    var seen = {};
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting && !seen[entry.target.id]) {
            seen[entry.target.id] = true;
            track("section_view", { section: entry.target.id, target: entry.target.id });
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.5 },
    );
    document.querySelectorAll("section[id]").forEach(function (section) {
      observer.observe(section);
    });
  }

  function setupScrollDepthTracking() {
    var milestones = [25, 50, 75, 100];
    var fired = {};
    var ticking = false;

    function computeAndTrack() {
      ticking = false;
      var scrollTop = window.scrollY || document.documentElement.scrollTop;
      var viewport = window.innerHeight;
      var full = document.documentElement.scrollHeight;
      if (full <= viewport) {
        return;
      }
      var pct = Math.round(((scrollTop + viewport) / full) * 100);
      milestones.forEach(function (m) {
        if (pct >= m && !fired[m]) {
          fired[m] = true;
          track("scroll_depth", { target: String(m), value: m });
        }
      });
    }

    window.addEventListener(
      "scroll",
      function () {
        if (!ticking) {
          ticking = true;
          window.requestAnimationFrame(computeAndTrack);
        }
      },
      { passive: true },
    );
  }

  function setupClickTracking() {
    document.addEventListener(
      "click",
      function (e) {
        var el = e.target;
        if (!el || typeof el.closest !== "function") {
          return;
        }

        var learnMore = el.closest("#intro a.btn-default");
        if (learnMore) {
          track("cta_click", {
            section: "intro",
            target: "learn_more",
            label: learnMore.textContent.trim(),
          });
          return;
        }

        var registerNow = el.closest("#intro a.btn-danger");
        if (registerNow) {
          track("cta_click", {
            section: "intro",
            target: "register_now_hero",
            label: registerNow.textContent.trim(),
          });
          return;
        }

        var adminLink = el.closest('a[href="admin.html"]');
        if (adminLink) {
          track("cta_click", { section: "nav", target: "admin_panel" });
          return;
        }

        var navLink = el.closest(".navbar-nav a");
        if (navLink) {
          var href = navLink.getAttribute("href") || "";
          track("cta_click", {
            section: "nav",
            target: href.replace("#", "") || href,
            label: navLink.textContent.trim(),
          });
          return;
        }

        var downloadNow = el.closest("#contact a.btn-danger");
        if (downloadNow) {
          track("cta_click", {
            section: "contact",
            target: "download_now",
            label: downloadNow.textContent.trim(),
          });
          return;
        }

        var contactSubmit = el.closest('#contact input[type="submit"]');
        if (contactSubmit) {
          track("contact_form_submit", { section: "contact" });
          return;
        }

        var goTop = el.closest(".go-top");
        if (goTop) {
          track("cta_click", { section: "footer", target: "back_to_top" });
          return;
        }

        var social = el.closest(".social-icon a");
        if (social) {
          var platform = "unknown";
          ["facebook", "twitter", "dribbble", "behance", "google-plus"].forEach(function (p) {
            if (social.classList.contains("fa-" + p)) {
              platform = p;
            }
          });
          track("outbound_click", { section: "footer", target: platform });
          return;
        }

        var speaker = el.closest(".speakers-wrapper");
        if (speaker) {
          var name = speaker.querySelector("h3");
          var speakerName = name ? name.textContent.trim() : "";
          track("speaker_card_click", {
            section: "speakers",
            target: speakerName,
            label: speakerName,
          });
          return;
        }

        var program = el.closest("#programs-list [data-session]");
        if (program) {
          var progTrack = program.getAttribute("data-track") || "";
          var progSession = program.getAttribute("data-session") || "";
          var progSpeaker = program.getAttribute("data-speaker") || "";
          track("program_card_click", {
            section: "program",
            target: progTrack,
            label: progSession,
            properties: { track: progTrack, session: progSession, speaker: progSpeaker },
          });
          return;
        }

        var credit = el.closest('a[target="_parent"]');
        if (credit) {
          track("outbound_click", { section: "footer", target: "templatemo_credit" });
        }
      },
      true,
    );

    var eventSelect = document.getElementById("register-event");
    if (eventSelect) {
      eventSelect.addEventListener("change", function () {
        track("event_select_change", {
          section: "register",
          target: eventSelect.value,
          properties: { eventId: eventSelect.value },
        });
      });
    }

    var registerForm = document.getElementById("register-form");
    if (registerForm) {
      var formStarted = false;
      registerForm.addEventListener("focusin", function () {
        if (!formStarted) {
          formStarted = true;
          track("registration_form_started", { section: "register" });
        }
      });
    }
  }

  function setupFaqTracking() {
    if (typeof window.$ === "undefined") {
      return;
    }
    window.$(document).on("shown.bs.collapse", "#accordion .panel-collapse", function () {
      var heading = window
        .$(this)
        .closest(".panel")
        .find(".panel-title a")
        .text()
        .trim();
      track("faq_open", { section: "faq", target: this.id, label: heading });
    });
  }

  function setupVideoTracking() {
    var iframe = document.getElementById("video-player");
    if (!iframe) {
      return;
    }

    var src = iframe.getAttribute("src") || "";
    if (src.indexOf("enablejsapi") === -1) {
      var sep = src.indexOf("?") === -1 ? "?" : "&";
      iframe.setAttribute(
        "src",
        src + sep + "enablejsapi=1&origin=" + encodeURIComponent(location.origin),
      );
    }

    var progressMilestones = [25, 50, 75];
    var progressFired = {};
    var progressTimer = null;

    function clearProgressTimer() {
      if (progressTimer) {
        window.clearInterval(progressTimer);
        progressTimer = null;
      }
    }

    function pollProgress(player) {
      clearProgressTimer();
      progressTimer = window.setInterval(function () {
        var duration = player.getDuration();
        if (!duration) {
          return;
        }
        var pct = Math.round((player.getCurrentTime() / duration) * 100);
        progressMilestones.forEach(function (m) {
          if (pct >= m && !progressFired[m]) {
            progressFired[m] = true;
            track("video_progress", { section: "video", target: String(m), value: m });
          }
        });
      }, 2000);
    }

    window.onYouTubeIframeAPIReady = function () {
      new window.YT.Player("video-player", {
        events: {
          onStateChange: function (event) {
            var YT = window.YT;
            if (event.data === YT.PlayerState.PLAYING) {
              track("video_play", { section: "video" });
              pollProgress(event.target);
            } else if (event.data === YT.PlayerState.PAUSED) {
              clearProgressTimer();
              track("video_pause", { section: "video" });
            } else if (event.data === YT.PlayerState.ENDED) {
              clearProgressTimer();
              track("video_complete", { section: "video" });
            }
          },
        },
      });
    };

    var apiScript = document.createElement("script");
    apiScript.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(apiScript);
  }

  function setupErrorTracking() {
    var count = 0;
    var MAX_ERRORS = 5;

    window.addEventListener("error", function (e) {
      if (count >= MAX_ERRORS) {
        return;
      }
      count++;
      track("js_error", {
        target: e.filename || "",
        label: (e.message || "").slice(0, 300),
        properties: { line: String(e.lineno || "") },
      });
    });

    window.addEventListener("unhandledrejection", function (e) {
      if (count >= MAX_ERRORS) {
        return;
      }
      count++;
      var reason = e.reason && e.reason.message ? e.reason.message : String(e.reason);
      track("js_error", {
        target: "unhandled_rejection",
        label: (reason || "").slice(0, 300),
      });
    });
  }

  function setupSessionEndTracking() {
    var startTime = Date.now();

    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") {
        flush(true);
      }
    });

    window.addEventListener("pagehide", function () {
      track("session_end", { value: Math.round((Date.now() - startTime) / 1000) });
      flush(true);
    });
  }

  window.Analytics = { track: track };

  setupErrorTracking();
  setupSessionEndTracking();

  var isNewSession = ensureSession();
  if (isNewSession) {
    track("session_start", {});
  }
  track("page_view", {});

  setInterval(function () {
    flush(false);
  }, FLUSH_INTERVAL_MS);

  document.addEventListener("DOMContentLoaded", function () {
    setupSectionTracking();
    setupScrollDepthTracking();
    setupClickTracking();
    setupFaqTracking();
    setupVideoTracking();
  });
})();
