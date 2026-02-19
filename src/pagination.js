// Rank data is loaded on demand from JSON files in ranks/ directory.
// Each file is named {type}-{release}.json and contains:
//   { "header": ["col1", ...], "rows": [["val1", ...], ...] }

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

function buildTable(container, data) {
    // Clear previous content
    container.innerHTML = '';

    if (!data || !data.header.length || !data.rows.length) {
        container.innerHTML = '<p>No data available.</p>';
        return;
    }

    // Build table element
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    data.header.forEach(col => {
        const th = document.createElement('th');
        th.textContent = col;
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

    // Set up search, sort, and pagination on this table
    setupTableInteractions(container, table);
}

function setupTableInteractions(container, table) {
    const tbody = table.querySelector('tbody');
    const rowsList = Array.from(tbody.children);
    let displayedRows = rowsList;
    let currentPage = 1;
    const rowsPerPage = 10;

    // Create search container
    const dropdown = container.closest('.dropdown');
    const controlsRow = dropdown ? dropdown.querySelector('.dropdown-controls') : null;

    // Remove any existing search container from controls row
    if (controlsRow) {
        const existing = controlsRow.querySelector('.search-container');
        if (existing) existing.remove();
    }

    const searchContainer = document.createElement('div');
    searchContainer.className = 'search-container';
    searchContainer.innerHTML = `
        <input type="text" class="search-input" placeholder="Search table..." autocapitalize="off">
        <span class="search-count"></span>
    `;

    // Place search in the controls row if available
    if (controlsRow) {
        controlsRow.appendChild(searchContainer);
    } else {
        container.insertBefore(searchContainer, table);
    }

    // Add pagination controls after the table
    const controls = document.createElement('div');
    controls.className = 'pagination-controls';
    controls.innerHTML = `
        <button class="prev-btn" disabled>&laquo;</button>
        <span class="page-info">Page <span class="current-page">1</span> of <span class="total-pages">1</span></span>
        <button class="next-btn">&raquo;</button>
    `;
    container.appendChild(controls);

    const elements = {
        searchInput: searchContainer.querySelector('.search-input'),
        searchCount: searchContainer.querySelector('.search-count'),
        prevBtn: controls.querySelector('.prev-btn'),
        nextBtn: controls.querySelector('.next-btn'),
        currentPage: controls.querySelector('.current-page'),
        totalPages: controls.querySelector('.total-pages')
    };

    function updateDisplay() {
        const totalPages = Math.max(1, Math.ceil(displayedRows.length / rowsPerPage));
        const start = (currentPage - 1) * rowsPerPage;
        const end = start + rowsPerPage;

        rowsList.forEach(row => row.style.display = 'none');
        displayedRows.slice(start, end).forEach(row => row.style.display = '');

        elements.currentPage.textContent = currentPage;
        elements.totalPages.textContent = totalPages;
        elements.prevBtn.disabled = currentPage === 1;
        elements.nextBtn.disabled = currentPage === totalPages;
    }

    // Sorting
    table.querySelectorAll('th').forEach((th, index) => {
        th.style.cursor = 'pointer';
        th.addEventListener('click', () => {
            table.querySelectorAll('th').forEach(header => {
                if (header !== th) header.removeAttribute('data-sort');
            });

            const currentSort = th.getAttribute('data-sort');
            const newSort = currentSort === 'asc' ? 'desc' : 'asc';
            th.setAttribute('data-sort', newSort);

            let targetRows = displayedRows.length > 0 ? displayedRows : rowsList;

            targetRows.sort((a, b) => {
                const aVal = a.cells[index].textContent.trim();
                const bVal = b.cells[index].textContent.trim();
                const aNum = parseFloat(aVal.replace(/,/g, ''));
                const bNum = parseFloat(bVal.replace(/,/g, ''));

                if (!isNaN(aNum) && !isNaN(bNum)) {
                    return newSort === 'asc' ? aNum - bNum : bNum - aNum;
                }
                return newSort === 'asc' ?
                    aVal.localeCompare(bVal) :
                    bVal.localeCompare(aVal);
            });

            tbody.innerHTML = "";
            targetRows.forEach(row => tbody.appendChild(row));

            displayedRows = [...targetRows];
            currentPage = 1;
            updateDisplay();
        });
    });

    // Search with debounce
    let searchTimeout = null;
    elements.searchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            const searchTerm = elements.searchInput.value.toLowerCase();
            if (!searchTerm) {
                displayedRows = rowsList;
                elements.searchCount.textContent = '';
            } else {
                displayedRows = rowsList.filter(row =>
                    Array.from(row.cells).some(cell =>
                        cell.textContent.toLowerCase().includes(searchTerm)
                    )
                );
                elements.searchCount.textContent = `${displayedRows.length} matches`;
            }
            currentPage = 1;
            updateDisplay();
        }, 300);
    });

    // Pagination
    elements.prevBtn.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            updateDisplay();
        }
    });

    elements.nextBtn.addEventListener('click', () => {
        const totalPages = Math.ceil(displayedRows.length / rowsPerPage);
        if (currentPage < totalPages) {
            currentPage++;
            updateDisplay();
        }
    });

    updateDisplay();
}

// Handle dropdown change: fetch data and build table
async function onReleaseSelect(selectEl) {
    const value = selectEl.value; // e.g. "domain-cc-main-2025-oct-nov-dec"
    if (!value) return;

    const dashIdx = value.indexOf('-');
    const fileType = value.substring(0, dashIdx);   // "domain" or "host"
    const release = value.substring(dashIdx + 1);    // "cc-main-2025-oct-nov-dec"

    const container = document.getElementById(`table-container-${fileType}`);
    if (!container) return;

    // Show loading state
    container.innerHTML = '<p>Loading...</p>';

    // Remove search from controls while loading
    const dropdown = container.closest('.dropdown');
    if (dropdown) {
        const existing = dropdown.querySelector('.dropdown-controls .search-container');
        if (existing) existing.remove();
    }

    const data = await fetchRankData(fileType, release);
    buildTable(container, data);
}

// Wire up dropdowns on page load
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('select[id$="-release-dropdown"]').forEach(dropdown => {
        dropdown.addEventListener('change', function() {
            onReleaseSelect(this);
        });
    });
});
