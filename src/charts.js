/* === Interactive Chart.js Charts === */

(function() {
    'use strict';

    /* Guard: abort if Chart.js failed to load */
    if (typeof Chart === 'undefined') {
        console.error('Chart.js not loaded — charts will not render.');
        return;
    }

    /* CCF palette: Sapphire for domain, Topaz for host */
    var CHART_COLORS = {
        domain: '#375e87',          /* Sapphire primary */
        domainPoint: '#b6cbe1',     /* Sapphire accent (pastel) */
        domainFill: 'rgba(182, 203, 225, 0.18)',  /* Sapphire accent @ 18% */
        host: '#846730',            /* Topaz primary */
        hostPoint: '#dfd0b2',       /* Topaz accent (pastel) */
        hostFill: 'rgba(223, 208, 178, 0.18)',    /* Topaz accent @ 18% */
        tooltipBg: 'rgba(21, 42, 71, 0.7)',
        crosshair: '#cbd5e1',
        gridLine: '#f1f5f9',
        gridBorder: '#e2e8f0',
        text: '#152a47',
        textSecondary: '#64748b'
    };

    var FONT_FAMILY = "'Libre Franklin', 'Segoe UI', system-ui, -apple-system, sans-serif";

    /* --- Value formatting --- */
    function formatValue(value) {
        if (value === null || value === undefined) return 'N/A';
        var abs = Math.abs(value);
        if (abs === 0) return '0';
        if (abs >= 1e12) return (value / 1e12).toFixed(2) + 'T';
        if (abs >= 1e9) return (value / 1e9).toFixed(2) + 'B';
        if (abs >= 1e6) return (value / 1e6).toFixed(2) + 'M';
        if (abs >= 1e3) return (value / 1e3).toFixed(1) + 'K';
        if (abs < 0.01 && abs !== 0) return value.toExponential(2);
        if (abs < 1) return value.toFixed(4);
        return value.toFixed(2);
    }

    function formatTooltipValue(value) {
        if (value === null || value === undefined) return 'N/A';
        if (typeof value === 'number') {
            return value.toLocaleString(undefined, { maximumFractionDigits: 6 });
        }
        return String(value);
    }

    /* --- Crosshair plugin --- */
    var crosshairPlugin = {
        id: 'crosshairLines',
        afterDatasetsDraw: function(chart) {
            var tooltip = chart.tooltip;
            if (!tooltip || !tooltip.getActiveElements || tooltip.getActiveElements().length === 0) {
                return;
            }
            var activeEl = tooltip.getActiveElements()[0];
            if (!activeEl) return;

            var ctx = chart.ctx;
            var x = activeEl.element.x;
            var yScale = chart.scales.y;

            ctx.save();
            ctx.strokeStyle = CHART_COLORS.crosshair;
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);

            ctx.beginPath();
            ctx.moveTo(x, yScale.top);
            ctx.lineTo(x, yScale.bottom);
            ctx.stroke();

            ctx.restore();
        }
    };

    /* --- Shorten release names for x-axis labels --- */
    function shortenRelease(name) {
        if (!name) return '';
        var parts = name.replace('cc-main-', '').split('-');
        var yearParts = [];
        var monthParts = [];
        for (var i = 0; i < parts.length; i++) {
            if (/^\d+$/.test(parts[i])) {
                var y = parts[i];
                yearParts.push(y.length === 4 ? y.slice(2) : y);
            } else {
                monthParts.push(parts[i].slice(0, 1).toUpperCase());
            }
        }
        var yearStr = yearParts.join('-');
        var monthStr = monthParts.join('');
        return yearStr + ' ' + monthStr;
    }

    /* ================================================================
       Range slider — a draggable horizontal bar to control the
       visible x-axis window of each chart.
       ================================================================ */

    function createRangeSlider(chartInstance, sliderEl, releases) {
        var total = releases.length;
        var minSpan = 3;  /* minimum visible points */

        var state = { start: 0, end: total - 1 };

        /* --- Build DOM --- */
        var track = document.createElement('div');
        track.className = 'rs-track';

        var windowEl = document.createElement('div');
        windowEl.className = 'rs-window';

        var handleL = document.createElement('div');
        handleL.className = 'rs-handle rs-handle-l';
        handleL.innerHTML = '<span></span>';

        var handleR = document.createElement('div');
        handleR.className = 'rs-handle rs-handle-r';
        handleR.innerHTML = '<span></span>';

        windowEl.appendChild(handleL);
        windowEl.appendChild(handleR);
        track.appendChild(windowEl);
        sliderEl.appendChild(track);

        /* --- Sparkline mini-preview in the track --- */
        var sparkCanvas = document.createElement('canvas');
        sparkCanvas.className = 'rs-spark';
        sparkCanvas.width = 600;
        sparkCanvas.height = 32;
        track.insertBefore(sparkCanvas, windowEl);
        drawSparkline(sparkCanvas, chartInstance.data);

        /* --- Position helpers --- */
        function pctOf(idx) { return (idx / (total - 1)) * 100; }

        function idxFromPct(pct) {
            return Math.round((pct / 100) * (total - 1));
        }

        function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

        function updateVisual() {
            var l = pctOf(state.start);
            var r = pctOf(state.end);
            windowEl.style.left = l + '%';
            windowEl.style.right = (100 - r) + '%';
        }

        function applyRange() {
            chartInstance.options.scales.x.min = releases[state.start];
            chartInstance.options.scales.x.max = releases[state.end];
            chartInstance.update('none');
        }

        function setRange(s, e) {
            state.start = clamp(s, 0, total - 1 - minSpan);
            state.end = clamp(e, state.start + minSpan, total - 1);
            updateVisual();
            applyRange();
        }

        /* --- Pointer helpers --- */
        function pctFromPointer(e) {
            var rect = track.getBoundingClientRect();
            return ((e.clientX - rect.left) / rect.width) * 100;
        }

        /* --- Drag state --- */
        var drag = null;

        function onPointerDown(e) {
            /* Determine what was grabbed */
            var target = e.target.closest('.rs-handle-l, .rs-handle-r, .rs-window');
            if (!target) return;
            e.preventDefault();

            var pct = pctFromPointer(e);
            if (target.classList.contains('rs-handle-l')) {
                drag = { type: 'left', originPct: pct, originStart: state.start, originEnd: state.end };
            } else if (target.classList.contains('rs-handle-r')) {
                drag = { type: 'right', originPct: pct, originStart: state.start, originEnd: state.end };
            } else {
                drag = { type: 'pan', originPct: pct, originStart: state.start, originEnd: state.end };
            }
            document.addEventListener('pointermove', onPointerMove);
            document.addEventListener('pointerup', onPointerUp);
        }

        function onPointerMove(e) {
            if (!drag) return;
            e.preventDefault();
            var pct = pctFromPointer(e);
            var deltaPct = pct - drag.originPct;
            var deltaIdx = Math.round((deltaPct / 100) * (total - 1));

            if (drag.type === 'left') {
                var newStart = clamp(drag.originStart + deltaIdx, 0, drag.originEnd - minSpan);
                setRange(newStart, state.end);
            } else if (drag.type === 'right') {
                var newEnd = clamp(drag.originEnd + deltaIdx, drag.originStart + minSpan, total - 1);
                setRange(state.start, newEnd);
            } else {
                /* pan: shift both by same delta, clamped to edges */
                var span = drag.originEnd - drag.originStart;
                var newStart = drag.originStart + deltaIdx;
                if (newStart < 0) newStart = 0;
                if (newStart + span > total - 1) newStart = total - 1 - span;
                setRange(newStart, newStart + span);
            }
        }

        function onPointerUp() {
            drag = null;
            document.removeEventListener('pointermove', onPointerMove);
            document.removeEventListener('pointerup', onPointerUp);
        }

        /* Click on track background (outside window) to jump */
        function onTrackClick(e) {
            if (e.target.closest('.rs-window')) return;
            var pct = pctFromPointer(e);
            var clickIdx = idxFromPct(pct);
            var span = state.end - state.start;
            var half = Math.floor(span / 2);
            var newStart = clamp(clickIdx - half, 0, total - 1 - span);
            setRange(newStart, newStart + span);
        }

        /* Double-click to reset */
        function onDblClick() {
            setRange(0, total - 1);
        }

        sliderEl.addEventListener('pointerdown', onPointerDown);
        track.addEventListener('click', onTrackClick);
        sliderEl.addEventListener('dblclick', onDblClick);

        /* Touch: prevent page scroll while dragging slider */
        sliderEl.addEventListener('touchstart', function(e) {
            if (e.target.closest('.rs-handle-l, .rs-handle-r, .rs-window')) {
                e.preventDefault();
            }
        }, { passive: false });

        updateVisual();

        /* Return controller so chart canvas can drive panning */
        return {
            getState: function() { return { start: state.start, end: state.end, total: total }; },
            setRange: setRange
        };
    }

    /* --- Draw a tiny sparkline preview of the data --- */
    function drawSparkline(canvas, chartData) {
        var ctx = canvas.getContext('2d');
        var w = canvas.width;
        var h = canvas.height;
        var pad = 4;

        ctx.clearRect(0, 0, w, h);

        chartData.datasets.forEach(function(ds) {
            var vals = ds.data.filter(function(v) { return v !== null; });
            if (vals.length < 2) return;

            var min = Infinity, max = -Infinity;
            for (var i = 0; i < ds.data.length; i++) {
                if (ds.data[i] !== null) {
                    if (ds.data[i] < min) min = ds.data[i];
                    if (ds.data[i] > max) max = ds.data[i];
                }
            }
            var range = max - min || 1;

            ctx.beginPath();
            ctx.strokeStyle = ds.borderColor;
            ctx.globalAlpha = 0.35;
            ctx.lineWidth = 1.5;
            var first = true;
            for (var i = 0; i < ds.data.length; i++) {
                if (ds.data[i] === null) continue;
                var x = (i / (ds.data.length - 1)) * w;
                var y = h - pad - ((ds.data[i] - min) / range) * (h - pad * 2);
                if (first) { ctx.moveTo(x, y); first = false; }
                else { ctx.lineTo(x, y); }
            }
            ctx.stroke();
            ctx.globalAlpha = 1;
        });
    }

    /* ================================================================
       Responsive helpers
       ================================================================ */

    function isMobile() { return window.innerWidth < 768; }
    function isNarrow() { return window.innerWidth < 480; }

    function pointRadius() { return isNarrow() ? 2 : 3.5; }
    function pointHoverRadius() { return isMobile() ? 5 : 6; }
    function tickFont()   { return isNarrow() ? 9 : 11; }
    function legendFont()  { return isNarrow() ? 11 : 13; }
    function xMaxTicks()   { return isNarrow() ? 6 : 14; }
    function yMaxTicks()   { return isNarrow() ? 5 : 8; }

    /* ================================================================
       Chart creation
       ================================================================ */

    function createChart(canvas) {
        var metric = canvas.id.replace('chart-', '');
        var data = window.CHART_DATA && window.CHART_DATA[metric];
        if (!data) {
            console.warn('No chart data for metric:', metric);
            return null;
        }

        var ctx = canvas.getContext('2d');

        /* Use date labels if available, fall back to release names */
        var displayLabels = data.labels || data.releases;

        var chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: displayLabels,
                datasets: [
                    {
                        label: 'domain',
                        data: data.domain,
                        borderColor: CHART_COLORS.domain,
                        backgroundColor: CHART_COLORS.domainFill,
                        borderWidth: 2,
                        tension: 0.15,
                        fill: true,
                        pointRadius: pointRadius(),
                        pointHoverRadius: pointHoverRadius(),
                        pointBackgroundColor: CHART_COLORS.domainPoint,
                        pointBorderColor: CHART_COLORS.domain,
                        pointBorderWidth: 1.5,
                        pointHoverBorderWidth: 2,
                        pointHoverBackgroundColor: '#fff',
                        spanGaps: true
                    },
                    {
                        label: 'host',
                        data: data.host,
                        borderColor: CHART_COLORS.host,
                        backgroundColor: CHART_COLORS.hostFill,
                        borderWidth: 2,
                        tension: 0.15,
                        fill: true,
                        pointRadius: pointRadius(),
                        pointHoverRadius: pointHoverRadius(),
                        pointBackgroundColor: CHART_COLORS.hostPoint,
                        pointBorderColor: CHART_COLORS.host,
                        pointBorderWidth: 1.5,
                        pointHoverBorderWidth: 2,
                        pointHoverBackgroundColor: '#fff',
                        spanGaps: true
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        align: 'end',
                        labels: {
                            font: {
                                family: FONT_FAMILY,
                                size: legendFont(),
                                weight: '600'
                            },
                            color: CHART_COLORS.text,
                            usePointStyle: true,
                            pointStyle: 'circle',
                            padding: isNarrow() ? 8 : 16,
                            boxWidth: isNarrow() ? 6 : 8,
                            boxHeight: isNarrow() ? 6 : 8
                        }
                    },
                    tooltip: {
                        enabled: true,
                        backgroundColor: CHART_COLORS.tooltipBg,
                        titleFont: {
                            family: FONT_FAMILY,
                            size: isNarrow() ? 11 : 13,
                            weight: '600'
                        },
                        bodyFont: {
                            family: FONT_FAMILY,
                            size: isNarrow() ? 11 : 13,
                            weight: '400'
                        },
                        padding: isNarrow()
                            ? { top: 6, bottom: 6, left: 8, right: 8 }
                            : { top: 10, bottom: 10, left: 14, right: 14 },
                        cornerRadius: 6,
                        displayColors: true,
                        boxWidth: isNarrow() ? 8 : 10,
                        boxHeight: isNarrow() ? 8 : 10,
                        boxPadding: 4,
                        callbacks: {
                            title: function(items) {
                                /* Show the full release ID, not the date label */
                                var idx = items[0].dataIndex;
                                return (data.releases && data.releases[idx]) || items[0].label || '';
                            },
                            label: function(context) {
                                var label = context.dataset.label || '';
                                var value = formatTooltipValue(context.parsed.y);
                                return ' ' + label + ':  ' + value;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        display: true,
                        border: {
                            color: CHART_COLORS.gridBorder
                        },
                        grid: {
                            color: isNarrow() ? 'transparent' : CHART_COLORS.gridLine
                        },
                        ticks: {
                            font: {
                                family: FONT_FAMILY,
                                size: tickFont()
                            },
                            color: CHART_COLORS.textSecondary,
                            maxRotation: isNarrow() ? 60 : 45,
                            minRotation: 0,
                            maxTicksLimit: xMaxTicks(),
                            autoSkip: true,
                            autoSkipPadding: isNarrow() ? 8 : 20,
                            callback: function(value) {
                                var label = this.getLabelForValue(value);
                                /* If still a raw release name, shorten it */
                                if (label && label.indexOf('cc-main-') === 0) {
                                    return shortenRelease(label);
                                }
                                return label;
                            }
                        }
                    },
                    y: {
                        display: true,
                        border: {
                            color: CHART_COLORS.gridBorder
                        },
                        grid: {
                            color: CHART_COLORS.gridLine
                        },
                        ticks: {
                            font: {
                                family: FONT_FAMILY,
                                size: tickFont()
                            },
                            color: CHART_COLORS.textSecondary,
                            callback: function(value) {
                                return formatValue(value);
                            },
                            maxTicksLimit: yMaxTicks()
                        }
                    }
                },
                animation: {
                    duration: 400,
                    easing: 'easeOutQuart'
                }
            },
            plugins: [crosshairPlugin]
        });

        return chart;
    }

    /* ================================================================
       Touch pan — swipe left/right on the chart canvas to pan the
       visible window when zoomed in. Updates the range slider too.
       ================================================================ */

    function addTouchPan(canvas, sliderCtrl) {
        if (!sliderCtrl) return;
        var touchStart = null;
        var panOrigin = null;

        canvas.addEventListener('touchstart', function(e) {
            if (e.touches.length !== 1) return;
            var st = sliderCtrl.getState();
            /* only pan if zoomed in */
            if (st.end - st.start >= st.total - 1) return;
            touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            panOrigin = { start: st.start, end: st.end };
        }, { passive: true });

        canvas.addEventListener('touchmove', function(e) {
            if (!touchStart || !panOrigin || e.touches.length !== 1) return;
            var dx = e.touches[0].clientX - touchStart.x;
            var dy = e.touches[0].clientY - touchStart.y;

            /* If mostly vertical, let the page scroll */
            if (Math.abs(dy) > Math.abs(dx) && !panOrigin.locked) return;
            panOrigin.locked = true;
            e.preventDefault();

            var st = sliderCtrl.getState();
            var span = panOrigin.end - panOrigin.start;
            var canvasW = canvas.getBoundingClientRect().width;
            /* Map pixel drag to index shift — negative dx means swipe left = move forward */
            var idxShift = -Math.round((dx / canvasW) * span);
            var newStart = panOrigin.start + idxShift;
            if (newStart < 0) newStart = 0;
            if (newStart + span > st.total - 1) newStart = st.total - 1 - span;
            sliderCtrl.setRange(newStart, newStart + span);
        }, { passive: false });

        canvas.addEventListener('touchend', function() {
            touchStart = null;
            panOrigin = null;
        }, { passive: true });
    }

    /* --- Initialize all charts + sliders on page load --- */
    function initAllCharts() {
        window.chartInstances = {};
        var canvases = document.querySelectorAll('canvas[id^="chart-"]');
        canvases.forEach(function(canvas) {
            var chart = createChart(canvas);
            if (!chart) return;

            window.chartInstances[canvas.id] = chart;

            var metric = canvas.id.replace('chart-', '');
            var sliderEl = document.getElementById('slider-' + metric);
            if (sliderEl && window.CHART_DATA[metric]) {
                var labels = window.CHART_DATA[metric].labels || window.CHART_DATA[metric].releases;
                var ctrl = createRangeSlider(chart, sliderEl, labels);
                addTouchPan(canvas, ctrl);
            }
        });
    }

    /* Expose for reuse by domain-lookup.js */
    window.createRangeSlider = createRangeSlider;
    window.addChartTouchPan = addTouchPan;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAllCharts);
    } else {
        initAllCharts();
    }

})();
