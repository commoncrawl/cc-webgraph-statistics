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
    '#harmonicc_pos': 'HC Rank',
    '#harmonicc_val': 'HC Value',
    '#pr_pos': 'PR Rank',
    '#pr_val': 'PR Value',
    '#host_rev': 'Host (rev)',
    '#n_hosts': 'Hosts',
    '#domain_rev': 'Domain (rev)'
};

function buildTable(container, data, fileType) {
    container.innerHTML = '';
    if (!data || !data.header.length || !data.rows.length) {
        container.innerHTML = '<p>No data available.</p>';
        panelState[fileType] = null;
        return;
    }

    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    data.header.forEach(col => {
        const th = document.createElement('th');
        th.textContent = HEADER_LABELS[col.toLowerCase()] || col;
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    data.rows.forEach(row => {
        const tr = document.createElement('tr');
        row.forEach(cell => {
            const td = document.createElement('td');
            td.textContent = cell;
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    container.appendChild(table);

    // Pagination controls
    const controls = document.createElement('div');
    controls.className = 'pagination-controls';
    controls.innerHTML = `
        <button class="prev-btn" disabled>&laquo;</button>
        <span class="page-info">Page <span class="current-page">1</span> of <span class="total-pages">1</span></span>
        <button class="next-btn">&raquo;</button>
    `;
    container.appendChild(controls);

    const rowsList = Array.from(tbody.children);
    const state = {
        rowsList: rowsList,
        displayedRows: rowsList,
        currentPage: 1,
        rowsPerPage: 10,
        table: table,
        tbody: tbody,
        prevBtn: controls.querySelector('.prev-btn'),
        nextBtn: controls.querySelector('.next-btn'),
        currentPageEl: controls.querySelector('.current-page'),
        totalPagesEl: controls.querySelector('.total-pages')
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

    // Pagination buttons
    state.prevBtn.addEventListener('click', () => {
        if (state.currentPage > 1) { state.currentPage--; updatePanelDisplay(state); }
    });
    state.nextBtn.addEventListener('click', () => {
        const tp = Math.ceil(state.displayedRows.length / state.rowsPerPage);
        if (state.currentPage < tp) { state.currentPage++; updatePanelDisplay(state); }
    });

    updatePanelDisplay(state);
}

function updatePanelDisplay(state) {
    if (!state) return;
    const tp = Math.max(1, Math.ceil(state.displayedRows.length / state.rowsPerPage));
    const start = (state.currentPage - 1) * state.rowsPerPage;
    const end = start + state.rowsPerPage;
    state.rowsList.forEach(r => r.style.display = 'none');
    state.displayedRows.slice(start, end).forEach(r => r.style.display = '');
    state.currentPageEl.textContent = state.currentPage;
    state.totalPagesEl.textContent = tp;
    state.prevBtn.disabled = state.currentPage === 1;
    state.nextBtn.disabled = state.currentPage === tp;
}

function applySearch(term) {
    ['domain', 'host'].forEach(ft => {
        const state = panelState[ft];
        if (!state) return;
        if (!term) {
            state.displayedRows = state.rowsList;
        } else {
            state.displayedRows = state.rowsList.filter(row =>
                Array.from(row.cells).some(c => c.textContent.toLowerCase().includes(term))
            );
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
            if (searchContainer) searchContainer.style.display = 'none';
            if (searchInput) { searchInput.value = ''; }
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

        // Show search bar and reset it
        if (searchContainer) searchContainer.style.display = '';
        if (searchInput) { searchInput.value = ''; }
        if (searchCount) { searchCount.textContent = ''; }
    });

    // Shared search
    let searchTimeout = null;
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                applySearch(searchInput.value.toLowerCase());
            }, 300);
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
