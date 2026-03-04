/* === Domain Lookup — compare up to 2 domains' HC + PR over time === */

(function() {
    'use strict';

    if (typeof Chart === 'undefined') return;

    var FONT_FAMILY = "'Libre Franklin', 'Segoe UI', system-ui, -apple-system, sans-serif";

    /* Per-domain colour sets from the CCF gemstone palette.
       Domain 1: Sapphire (HC) + Emerald (PR)
       Domain 2: Amethyst (HC) + Ruby (PR) */
    var DOMAIN_COLORS = [
        {
            hc:      '#375e87',                       /* Sapphire primary  */
            hcPt:    '#b6cbe1',                       /* Sapphire accent   */
            hcFill:  'rgba(182, 203, 225, 0.18)',
            pr:      '#2b674f',                       /* Emerald primary   */
            prPt:    '#b0d0c3',                       /* Emerald accent    */
            prFill:  'rgba(176, 208, 195, 0.18)'
        },
        {
            hc:      '#5b437f',                       /* Amethyst primary  */
            hcPt:    '#c9bddd',                       /* Amethyst accent   */
            hcFill:  'rgba(201, 189, 221, 0.18)',
            pr:      '#733743',                       /* Ruby primary      */
            prPt:    '#d6b6bd',                       /* Ruby accent       */
            prFill:  'rgba(214, 182, 189, 0.18)'
        }
    ];

    var UI = {
        tooltipBg:  'rgba(21, 42, 71, 0.7)',
        crosshair:  '#cbd5e1',
        gridLine:   '#f1f5f9',
        gridBorder: '#e2e8f0',
        text:       '#152a47',
        textSec:    '#64748b'
    };

    var lookupData = null;
    var chartInstance = null;

    /* --- Helpers --- */
    function reverseDomain(domain) {
        return domain.trim().toLowerCase().replace(/\.+$/, '').split('.').reverse().join('.');
    }

    function shortenRelease(name) {
        if (!name) return '';
        var parts = name.replace('cc-main-', '').split('-');
        var years = [], months = [];
        for (var i = 0; i < parts.length; i++) {
            if (/^\d+$/.test(parts[i])) {
                var y = parts[i];
                years.push(y.length === 4 ? y.slice(2) : y);
            } else {
                months.push(parts[i].slice(0, 1).toUpperCase());
            }
        }
        return years.join('-') + ' ' + months.join('');
    }

    function formatValue(v) {
        if (v === null || v === undefined) return 'N/A';
        var abs = Math.abs(v);
        if (abs === 0) return '0';
        if (abs >= 1e12) return (v / 1e12).toFixed(2) + 'T';
        if (abs >= 1e9)  return (v / 1e9).toFixed(2) + 'B';
        if (abs >= 1e6)  return (v / 1e6).toFixed(2) + 'M';
        if (abs >= 1e3)  return (v / 1e3).toFixed(1) + 'K';
        if (abs < 0.01 && abs !== 0) return v.toExponential(2);
        if (abs < 1)   return v.toFixed(6);
        return v.toFixed(2);
    }

    function formatTooltip(v) {
        if (v === null || v === undefined) return 'N/A';
        return typeof v === 'number'
            ? v.toLocaleString(undefined, { maximumFractionDigits: 8 })
            : String(v);
    }

    function isMobile() { return window.innerWidth < 768; }
    function isNarrow() { return window.innerWidth < 480; }

    /* --- Crosshair plugin --- */
    var crosshairPlugin = {
        id: 'domainCrosshair',
        afterDatasetsDraw: function(chart) {
            var tt = chart.tooltip;
            if (!tt || !tt.getActiveElements || tt.getActiveElements().length === 0) return;
            var el = tt.getActiveElements()[0];
            if (!el) return;
            var ctx = chart.ctx, x = el.element.x, ys = chart.scales.yHC;
            if (!ys) return;
            ctx.save();
            ctx.strokeStyle = UI.crosshair;
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(x, ys.top);
            ctx.lineTo(x, ys.bottom);
            ctx.stroke();
            ctx.restore();
        }
    };

    /* --- Build a dataset object --- */
    function makeDataset(label, data, axisId, lineColor, pointColor, fillColor) {
        var pr = isNarrow() ? 2 : 3.5;
        var hpr = isMobile() ? 5 : 6;
        return {
            label: label,
            data: data,
            yAxisID: axisId,
            borderColor: lineColor,
            backgroundColor: fillColor,
            borderWidth: 2,
            tension: 0.15,
            fill: true,
            pointRadius: pr,
            pointHoverRadius: hpr,
            pointBackgroundColor: pointColor,
            pointBorderColor: lineColor,
            pointBorderWidth: 1.5,
            pointHoverBorderWidth: 2,
            pointHoverBackgroundColor: '#fff',
            spanGaps: true
        };
    }

    /* --- Build / update the chart --- */
    function renderChart(releases, labels, entries) {
        /* entries: [{name, hc[], pr[]}, ...] — 1 or 2 items */
        var canvas = document.getElementById('chart-domain-lookup');
        var wrap   = document.getElementById('domain-chart-wrap');
        if (!canvas || !wrap) return;
        wrap.style.display = '';

        var datasets = [];
        var single = entries.length === 1;

        for (var i = 0; i < entries.length; i++) {
            var e = entries[i], c = DOMAIN_COLORS[i];
            var prefix = single ? '' : e.name + ' — ';
            datasets.push(makeDataset(prefix + 'Harmonic Centrality', e.hc, 'yHC', c.hc, c.hcPt, c.hcFill));
            datasets.push(makeDataset(prefix + 'PageRank',            e.pr, 'yPR', c.pr, c.prPt, c.prFill));
        }

        /* Tooltip title */
        var titleLabel = entries.map(function(e) { return e.name; }).join(' vs ');

        if (chartInstance) {
            chartInstance.data.labels = labels;
            chartInstance.data.datasets = datasets;
            chartInstance.options.scales.x.min = undefined;
            chartInstance.options.scales.x.max = undefined;
            chartInstance.options.plugins.tooltip.callbacks.title = function(items) {
                var idx = items[0].dataIndex;
                var rel = (releases && releases[idx]) || items[0].label || '';
                return titleLabel + '  —  ' + rel;
            };
            chartInstance.update();
        } else {
            chartInstance = new Chart(canvas.getContext('2d'), {
                type: 'line',
                data: { labels: labels, datasets: datasets },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: { mode: 'index', intersect: false },
                    plugins: {
                        legend: {
                            display: true, position: 'top', align: 'end',
                            labels: {
                                font: { family: FONT_FAMILY, size: isNarrow() ? 10 : 12, weight: '600' },
                                color: UI.text, usePointStyle: true, pointStyle: 'circle',
                                padding: isNarrow() ? 6 : 14,
                                boxWidth: isNarrow() ? 6 : 8,
                                boxHeight: isNarrow() ? 6 : 8
                            }
                        },
                        tooltip: {
                            enabled: true,
                            backgroundColor: UI.tooltipBg,
                            titleFont: { family: FONT_FAMILY, size: isNarrow() ? 11 : 13, weight: '600' },
                            bodyFont:  { family: FONT_FAMILY, size: isNarrow() ? 11 : 13, weight: '400' },
                            padding: isNarrow()
                                ? { top: 6, bottom: 6, left: 8, right: 8 }
                                : { top: 10, bottom: 10, left: 14, right: 14 },
                            cornerRadius: 6, displayColors: true,
                            boxWidth: isNarrow() ? 8 : 10,
                            boxHeight: isNarrow() ? 8 : 10,
                            boxPadding: 4,
                            callbacks: {
                                title: function(items) {
                                    var idx = items[0].dataIndex;
                                    var rel = (releases && releases[idx]) || items[0].label || '';
                                    return titleLabel + '  —  ' + rel;
                                },
                                label: function(ctx) {
                                    return ' ' + ctx.dataset.label + ':  ' + formatTooltip(ctx.parsed.y);
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            display: true,
                            border: { color: UI.gridBorder },
                            grid:   { color: isNarrow() ? 'transparent' : UI.gridLine },
                            ticks: {
                                font: { family: FONT_FAMILY, size: isNarrow() ? 9 : 11 },
                                color: UI.textSec,
                                maxRotation: isNarrow() ? 60 : 45, minRotation: 0,
                                maxTicksLimit: isNarrow() ? 6 : 14,
                                autoSkip: true,
                                autoSkipPadding: isNarrow() ? 8 : 20,
                                callback: function(v) {
                                    var l = this.getLabelForValue(v);
                                    return (l && l.indexOf('cc-main-') === 0) ? shortenRelease(l) : l;
                                }
                            }
                        },
                        yHC: {
                            type: 'linear', display: true, position: 'left',
                            title: { display: !isNarrow(), text: 'HC', font: { family: FONT_FAMILY, size: isNarrow() ? 10 : 12, weight: '600' }, color: DOMAIN_COLORS[0].hc },
                            border: { color: UI.gridBorder },
                            grid:   { color: UI.gridLine },
                            ticks: {
                                font: { family: FONT_FAMILY, size: isNarrow() ? 9 : 11 },
                                color: DOMAIN_COLORS[0].hc,
                                callback: function(v) { return formatValue(v); },
                                maxTicksLimit: isNarrow() ? 5 : 8
                            }
                        },
                        yPR: {
                            type: 'linear', display: true, position: 'right',
                            title: { display: !isNarrow(), text: 'PR', font: { family: FONT_FAMILY, size: isNarrow() ? 10 : 12, weight: '600' }, color: DOMAIN_COLORS[0].pr },
                            border: { color: UI.gridBorder },
                            grid:   { drawOnChartArea: false },
                            ticks: {
                                font: { family: FONT_FAMILY, size: isNarrow() ? 9 : 11 },
                                color: DOMAIN_COLORS[0].pr,
                                callback: function(v) { return formatValue(v); },
                                maxTicksLimit: isNarrow() ? 5 : 8
                            }
                        }
                    },
                    animation: { duration: 400, easing: 'easeOutQuart' }
                },
                plugins: [crosshairPlugin]
            });
        }

        /* Rebuild slider */
        var sliderEl = document.getElementById('slider-domain-lookup');
        if (sliderEl && typeof window.createRangeSlider === 'function') {
            sliderEl.innerHTML = '';
            var ctrl = window.createRangeSlider(chartInstance, sliderEl, labels);
            /* Enable touch pan on the domain lookup chart canvas */
            var canvas = document.getElementById('domain-lookup-chart');
            if (canvas && typeof window.addChartTouchPan === 'function') {
                window.addChartTouchPan(canvas, ctrl);
            }
        }
    }

    /* --- Search handler --- */
    function doSearch() {
        var input1 = document.getElementById('domain-search-input');
        var input2 = document.getElementById('domain-search-input-2');
        var msg    = document.getElementById('domain-search-msg');
        var wrap   = document.getElementById('domain-chart-wrap');
        if (!input1 || !msg) return;

        var raw1 = input1.value.trim();
        var raw2 = input2 ? input2.value.trim() : '';

        if (!raw1) {
            msg.textContent = 'Please enter at least one domain name.';
            msg.className = 'domain-search-msg error';
            return;
        }

        msg.textContent = 'Searching\u2026';
        msg.className = 'domain-search-msg';

        function search(data) {
            lookupData = data;
            var queries = [raw1];
            if (raw2) queries.push(raw2);

            var entries = [];
            var notFound = [];

            for (var i = 0; i < queries.length; i++) {
                var rev = reverseDomain(queries[i]);
                var entry = data.domains[rev];
                if (entry) {
                    entries.push({ name: queries[i], hc: entry[0], pr: entry[1] });
                } else {
                    notFound.push(queries[i]);
                }
            }

            if (entries.length === 0) {
                var names = notFound.map(function(d) { return '"' + d + '"'; }).join(' and ');
                msg.textContent = names + (notFound.length > 1 ? ' were' : ' was') + ' not found in the top 1,000 for any release.';
                msg.className = 'domain-search-msg error';
                if (wrap) wrap.style.display = 'none';
                return;
            }

            if (notFound.length > 0) {
                msg.textContent = 'Showing data for ' + entries[0].name + '. "' + notFound[0] + '" was not found in the top 1,000.';
                msg.className = 'domain-search-msg';
            } else if (entries.length === 2) {
                msg.textContent = 'Comparing ' + entries[0].name + ' vs ' + entries[1].name;
                msg.className = 'domain-search-msg';
            } else {
                msg.textContent = 'Showing data for ' + entries[0].name;
                msg.className = 'domain-search-msg';
            }

            renderChart(data.releases, data.labels || data.releases, entries);
        }

        if (lookupData) {
            search(lookupData);
        } else {
            fetch('domain-lookup.json')
                .then(function(r) {
                    if (!r.ok) throw new Error('HTTP ' + r.status);
                    return r.json();
                })
                .then(search)
                .catch(function(err) {
                    msg.textContent = 'Failed to load lookup data: ' + err.message;
                    msg.className = 'domain-search-msg error';
                });
        }
    }

    /* --- Wire up UI --- */
    function setupDomainClear(input) {
        if (!input) return;
        var wrap = input.closest('.search-input-wrap');
        if (!wrap) return;
        var btn = wrap.querySelector('.domain-clear');
        if (!btn) return;
        function toggle() { btn.classList.toggle('visible', input.value.length > 0); }
        input.addEventListener('input', toggle);
        btn.addEventListener('click', function() {
            input.value = '';
            toggle();
            input.focus();
        });
    }

    function init() {
        var btn    = document.getElementById('domain-search-btn');
        var input1 = document.getElementById('domain-search-input');
        var input2 = document.getElementById('domain-search-input-2');

        if (btn) btn.addEventListener('click', doSearch);

        function onEnter(e) { if (e.key === 'Enter') doSearch(); }
        if (input1) input1.addEventListener('keydown', onEnter);
        if (input2) input2.addEventListener('keydown', onEnter);

        setupDomainClear(input1);
        setupDomainClear(input2);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
