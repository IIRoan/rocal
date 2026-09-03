/* Expand Solace status groups by default (before Vue hydrates). */
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
})();
