// Rank tables — shared dropdown + search, tabbed domain/host panels.
// Data loaded on demand from ranks/{type}-{release}.json files.

const rankCache = {};

async function fetchRankData(fileType, release) {
    const key = `${fileType}-${release}`;
    if (rankCache[key]) return rankCache[key];
    const url = `ranks/${fileType}-${release}.json`;
    try {
        const resp = await fetch(url);
        if (!resp.ok) return null;
        const data = await resp.json();
        rankCache[key] = data;
        return data;
    } catch (e) {
        console.error(`Failed to load ${url}:`, e);
        return null;
    }
}

// Per-panel state: rows, displayed rows, page, sort
const panelState = { domain: null, host: null };

const HEADER_LABELS = {
    '#harmonicc_pos': 'hcrank_pos',
    '#harmonicc_val': 'hcrank_raw',
    '#pr_pos': 'prank_pos',
    '#pr_val': 'prank_raw',
    '#host_rev': 'URL_HOST_NAME',
    '#n_hosts': 'Hosts',
    '#domain_rev': 'Domain'
};

const SURT_HEADER_LABELS = {
    '#host_rev': 'URL_HOST_NAME_REVERSED',
    '#domain_rev': 'Domain (rev)'
};

// Columns that contain reversed (SURT) domain names
const SURT_COLUMNS = ['#host_rev', '#domain_rev'];

function reverseDomain(s) {
    return s.split('.').reverse().join('.');
}

// Track whether SURT mode is active (default: on = reversed notation)
var surtMode = true;

function buildTable(container, data, fileType) {
    container.innerHTML = '';
    if (!data || !data.header.length || !data.rows.length) {
        container.innerHTML = '<p>No data available.</p>';
        panelState[fileType] = null;
        return;
    }

    // Identify which column indices contain SURT domain names
    var surtCols = [];
    data.header.forEach(function(col, i) {
        if (SURT_COLUMNS.indexOf(col.toLowerCase()) !== -1) surtCols.push(i);
    });

    const tableWrap = document.createElement('div');
    tableWrap.className = 'table-scroll-wrap';
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    data.header.forEach(col => {
        const th = document.createElement('th');
        var key = col.toLowerCase();
        th.textContent = (surtMode && SURT_HEADER_LABELS[key])
            ? SURT_HEADER_LABELS[key]
            : (HEADER_LABELS[key] || col);
        if (SURT_HEADER_LABELS[key]) th.dataset.colKey = key;
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    data.rows.forEach(row => {
        const tr = document.createElement('tr');
        row.forEach(function(cell, i) {
            const td = document.createElement('td');
            // By default show human-friendly names (reverse SURT)
            td.textContent = (!surtMode && surtCols.indexOf(i) !== -1)
                ? reverseDomain(cell) : cell;
            // Store original SURT value for toggling
            if (surtCols.indexOf(i) !== -1) td.dataset.surt = cell;
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    tableWrap.appendChild(table);
    container.appendChild(tableWrap);

    // Pagination controls
    const controls = document.createElement('div');
    controls.className = 'pagination-controls';
    container.appendChild(controls);

    const rowsList = Array.from(tbody.children);
    const state = {
        rowsList: rowsList,
        displayedRows: rowsList,
        currentPage: 1,
        rowsPerPage: 10,
        table: table,
        tbody: tbody,
        controls: controls,
        surtCols: surtCols
    };
    panelState[fileType] = state;

    // Sorting
    table.querySelectorAll('th').forEach((th, index) => {
        th.style.cursor = 'pointer';
        th.addEventListener('click', () => {
            table.querySelectorAll('th').forEach(h => { if (h !== th) h.removeAttribute('data-sort'); });
            const dir = th.getAttribute('data-sort') === 'asc' ? 'desc' : 'asc';
            th.setAttribute('data-sort', dir);
            const rows = state.displayedRows.length > 0 ? state.displayedRows : state.rowsList;
            rows.sort((a, b) => {
                const aVal = a.cells[index].textContent.trim();
                const bVal = b.cells[index].textContent.trim();
                const aNum = parseFloat(aVal.replace(/,/g, ''));
                const bNum = parseFloat(bVal.replace(/,/g, ''));
                if (!isNaN(aNum) && !isNaN(bNum)) return dir === 'asc' ? aNum - bNum : bNum - aNum;
                return dir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
            });
            state.tbody.innerHTML = '';
            rows.forEach(r => state.tbody.appendChild(r));
            state.displayedRows = [...rows];
            state.currentPage = 1;
            updatePanelDisplay(state);
        });
    });

    updatePanelDisplay(state);
}

function getPageRange(current, total) {
    // Returns array of page numbers and '…' strings
    if (total <= 7) {
        var pages = [];
        for (var i = 1; i <= total; i++) pages.push(i);
        return pages;
    }
    var pages = [1];
    var lo = Math.max(2, current - 1);
    var hi = Math.min(total - 1, current + 1);
    // Shift window if near edges
    if (current <= 3) { lo = 2; hi = 4; }
    if (current >= total - 2) { lo = total - 3; hi = total - 1; }
    if (lo > 2) pages.push('…');
    for (var i = lo; i <= hi; i++) pages.push(i);
    if (hi < total - 1) pages.push('…');
    pages.push(total);
    return pages;
}

function updatePanelDisplay(state) {
    if (!state) return;
    const tp = Math.max(1, Math.ceil(state.displayedRows.length / state.rowsPerPage));
    if (state.currentPage > tp) state.currentPage = tp;
    const start = (state.currentPage - 1) * state.rowsPerPage;
    const end = start + state.rowsPerPage;
    state.rowsList.forEach(r => r.style.display = 'none');
    state.displayedRows.slice(start, end).forEach(r => r.style.display = '');

    // Render pagination controls
    const c = state.controls;
    c.innerHTML = '';

    const total = state.displayedRows.length;
    const showStart = total === 0 ? 0 : start + 1;
    const showEnd = Math.min(end, total);

    // Info text
    const info = document.createElement('span');
    info.className = 'page-info';
    info.textContent = total === 0 ? 'No results' : showStart + '–' + showEnd + ' of ' + total;
    c.appendChild(info);

    if (tp <= 1) return;

    const btnWrap = document.createElement('div');
    btnWrap.className = 'page-buttons';

    // Prev
    const prev = document.createElement('button');
    prev.innerHTML = '‹';
    prev.className = 'page-btn page-prev';
    prev.disabled = state.currentPage === 1;
    prev.addEventListener('click', () => { state.currentPage--; updatePanelDisplay(state); });
    btnWrap.appendChild(prev);

    // Numbered buttons
    const pages = getPageRange(state.currentPage, tp);
    pages.forEach(p => {
        if (p === '…') {
            const ell = document.createElement('span');
            ell.className = 'page-ellipsis';
            ell.textContent = '…';
            btnWrap.appendChild(ell);
        } else {
            const btn = document.createElement('button');
            btn.className = 'page-btn' + (p === state.currentPage ? ' active' : '');
            btn.textContent = p;
            btn.addEventListener('click', () => { state.currentPage = p; updatePanelDisplay(state); });
            btnWrap.appendChild(btn);
        }
    });

    // Next
    const next = document.createElement('button');
    next.innerHTML = '›';
    next.className = 'page-btn page-next';
    next.disabled = state.currentPage === tp;
    next.addEventListener('click', () => { state.currentPage++; updatePanelDisplay(state); });
    btnWrap.appendChild(next);

    c.appendChild(btnWrap);
}

function applySearch(term) {
    var terms = term ? term.split('|').map(function(t) { return t.trim(); }).filter(Boolean) : [];
    ['domain', 'host'].forEach(ft => {
        const state = panelState[ft];
        if (!state) return;
        if (!terms.length) {
            state.displayedRows = state.rowsList;
        } else {
            state.displayedRows = state.rowsList.filter(function(row) {
                // Only search SURT columns (domain/host name columns)
                return Array.from(row.cells).some(function(td) {
                    if (td.dataset.surt === undefined) return false;
                    var text = td.textContent.toLowerCase();
                    return terms.some(function(t) { return text.indexOf(t) !== -1; });
                });
            });
        }
        state.currentPage = 1;
        updatePanelDisplay(state);
    });
    // Update search count for the active panel
    const active = getActiveType();
    const s = panelState[active];
    const countEl = document.getElementById('rank-search-count');
    if (countEl) {
        countEl.textContent = (term && s) ? `${s.displayedRows.length} matches` : '';
    }
}

function getActiveType() {
    const activeTab = document.querySelector('.rank-tab.active');
    return activeTab ? activeTab.dataset.tab : 'domain';
}

document.addEventListener('DOMContentLoaded', () => {
    const dropdown = document.getElementById('rank-release-dropdown');
    const searchContainer = document.getElementById('rank-search-container');
    const searchInput = document.getElementById('rank-search-input');
    const searchCount = document.getElementById('rank-search-count');
    const rankContent = document.getElementById('rank-content');
    if (!dropdown) return;

    // Release selection — load both tables
    dropdown.addEventListener('change', async function() {
        const release = this.value;
        if (!release) {
            // Fold closed
            if (rankContent) rankContent.classList.remove('open');
            if (searchInput) { searchInput.value = ''; searchInput.disabled = true; }
            if (searchCount) { searchCount.textContent = ''; }
            // Clear after transition
            setTimeout(() => {
                ['domain', 'host'].forEach(ft => {
                    const c = document.getElementById('table-container-' + ft);
                    if (c) c.innerHTML = '';
                    panelState[ft] = null;
                });
            }, 350);
            return;
        }

        ['domain', 'host'].forEach(ft => {
            const c = document.getElementById('table-container-' + ft);
            if (c) c.innerHTML = '<p>Loading...</p>';
        });
        // Open immediately so loading message is visible
        if (rankContent) rankContent.classList.add('open');

        const [domainData, hostData] = await Promise.all([
            fetchRankData('domain', release),
            fetchRankData('host', release)
        ]);

        buildTable(document.getElementById('table-container-domain'), domainData, 'domain');
        buildTable(document.getElementById('table-container-host'), hostData, 'host');

        // Enable search bar and re-apply any existing search term
        if (searchInput) searchInput.disabled = false;
        var term = searchInput ? searchInput.value.toLowerCase() : '';
        if (term) {
            applySearch(term);
        }
    });

    // Shared search
    let searchTimeout = null;
    const clearBtn = document.getElementById('rank-search-clear');
    function updateClearBtn() {
        if (clearBtn) clearBtn.classList.toggle('visible', searchInput.value.length > 0);
    }
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            updateClearBtn();
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                applySearch(searchInput.value.toLowerCase());
            }, 300);
        });
    }
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            searchInput.value = '';
            updateClearBtn();
            applySearch('');
            searchInput.focus();
        });
    }

    // SURT toggle
    var surtCheckbox = document.getElementById('surt-checkbox');
    if (surtCheckbox) {
        surtCheckbox.addEventListener('change', function() {
            surtMode = this.checked;
            ['domain', 'host'].forEach(function(ft) {
                var state = panelState[ft];
                if (!state) return;
                // Update column headers
                state.table.querySelectorAll('th[data-col-key]').forEach(function(th) {
                    var key = th.dataset.colKey;
                    th.textContent = surtMode
                        ? (SURT_HEADER_LABELS[key] || HEADER_LABELS[key] || key)
                        : (HEADER_LABELS[key] || key);
                });
                // Update cell values
                state.rowsList.forEach(function(tr) {
                    Array.from(tr.cells).forEach(function(td) {
                        if (td.dataset.surt !== undefined) {
                            td.textContent = surtMode
                                ? td.dataset.surt
                                : reverseDomain(td.dataset.surt);
                        }
                    });
                });
            });
            // Re-apply search filter with updated cell text
            var term = searchInput ? searchInput.value.toLowerCase() : '';
            applySearch(term);
        });
    }

    // Tab switching
    document.querySelectorAll('.rank-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.rank-tab').forEach(t => {
                t.classList.remove('active');
                t.setAttribute('aria-selected', 'false');
            });
            tab.classList.add('active');
            tab.setAttribute('aria-selected', 'true');
            var tabs = Array.from(document.querySelectorAll('.rank-tab'));
            document.querySelector('.rank-tabs').dataset.active = tabs.indexOf(tab);

            document.querySelectorAll('.rank-panel').forEach(p => {
                p.classList.remove('active');
                p.hidden = true;
            });
            const panel = document.getElementById('panel-' + tab.dataset.tab);
            if (panel) { panel.classList.add('active'); panel.hidden = false; }

            // Update search count for newly visible panel
            const term = searchInput ? searchInput.value.toLowerCase() : '';
            const s = panelState[tab.dataset.tab];
            if (searchCount) {
                searchCount.textContent = (term && s) ? `${s.displayedRows.length} matches` : '';
            }
        });
    });
});
