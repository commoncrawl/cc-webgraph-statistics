/* === Hero parallax fade-out === */
(function() {
    'use strict';

    var img = document.querySelector('.cc-hero .full-width-image');
    if (!img) return;

    /* Respect prefers-reduced-motion */
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    var hero = document.querySelector('.cc-hero');
    var ticking = false;

    function onScroll() {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(function() {
            var rect = hero.getBoundingClientRect();
            var heroH = hero.offsetHeight;

            /* Only animate while hero is in view */
            if (rect.bottom <= 0 || rect.top >= window.innerHeight) {
                ticking = false;
                return;
            }

            /* scrolled = how far past the top of the hero we've scrolled */
            var scrolled = Math.max(0, -rect.top);
            var progress = Math.min(scrolled / heroH, 1);

            /* Image moves up at 80% scroll speed (strong parallax lag) */
            var translateY = scrolled * 0.8;
            /* Fade out over the first 80% of scroll through hero */
            var opacity = 1 - Math.min(progress / 0.8, 1);

            img.style.transform = 'translateY(' + translateY + 'px)';
            img.style.opacity = opacity;

            ticking = false;
        });
    }

    window.addEventListener('scroll', onScroll, { passive: true });
})();
