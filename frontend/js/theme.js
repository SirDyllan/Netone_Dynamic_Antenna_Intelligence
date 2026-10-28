(function () {
    var THEMES = ["signal", "crimson", "midnight"];
    function apply(t) {
        if (THEMES.indexOf(t) < 0) t = "signal";
        document.documentElement.setAttribute("data-theme", t);
        try { localStorage.setItem("gh-theme", t); } catch (e) {}
        document.querySelectorAll("[data-theme-btn]").forEach(function (b) {
            b.setAttribute("aria-pressed", String(b.getAttribute("data-theme-btn") === t));
        });
    }
    var saved = "signal";
    try { saved = localStorage.getItem("gh-theme") || "signal"; } catch (e) {}
    document.documentElement.setAttribute("data-theme", THEMES.indexOf(saved) < 0 ? "signal" : saved);
    document.addEventListener("DOMContentLoaded", function () {
        document.querySelectorAll("[data-theme-btn]").forEach(function (b) {
            b.addEventListener("click", function () { apply(b.getAttribute("data-theme-btn")); });
        });
        apply(document.documentElement.getAttribute("data-theme"));
    });
})();
