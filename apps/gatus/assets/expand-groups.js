/* Expand groups by default and add a Solace footer (outside Vue #app). */
(function () {
  var KEY = "gatus:uncollapsed-groups";
  var FORCE_KEY = "gatus:solace-expand-v1";
  var GROUPS = ["Application", "Mail", "Stalwart Metrics", "VPS"];
  try {
    if (!localStorage.getItem(FORCE_KEY)) {
      localStorage.setItem(KEY, JSON.stringify(GROUPS));
      localStorage.setItem(FORCE_KEY, "1");
    } else if (!localStorage.getItem(KEY)) {
      localStorage.setItem(KEY, JSON.stringify(GROUPS));
    }
  } catch (e) {
    /* ignore private mode / blocked storage */
  }

  function syncDetailsClass() {
    var path = window.location.pathname || "";
    var onDetails =
      path.indexOf("/endpoints/") === 0 || path.indexOf("/suites/") === 0;
    document.documentElement.classList.toggle("solace-details", onDetails);
  }

  var pushState = history.pushState;
  var replaceState = history.replaceState;
  history.pushState = function () {
    var result = pushState.apply(this, arguments);
    syncDetailsClass();
    return result;
  };
  history.replaceState = function () {
    var result = replaceState.apply(this, arguments);
    syncDetailsClass();
    return result;
  };
  window.addEventListener("popstate", syncDetailsClass);
  syncDetailsClass();

  function mountFooter() {
    var footer = document.getElementById("solace-status-footer");
    if (!footer) {
      footer = document.createElement("footer");
      footer.id = "solace-status-footer";
      footer.innerHTML =
        "<p>Solace. Private, for now.</p>" +
        '<a href="https://solace.onl/privacy">Privacy commitments</a>';
    }
    if (footer.parentElement !== document.body) {
      document.body.appendChild(footer);
    }
  }

  mountFooter();
  document.addEventListener("DOMContentLoaded", mountFooter);
  window.addEventListener("load", mountFooter);
  var n = 0;
  var timer = setInterval(function () {
    mountFooter();
    syncDetailsClass();
    n += 1;
    if (n > 20) {
      clearInterval(timer);
    }
  }, 250);
})();
