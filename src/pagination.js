function setupPagination() {
    function setupTable(dropdown) {
        const table = dropdown.querySelector('table');
        if (!table || table.getAttribute('data-pagination-initialized')) return;

        const tbody = table.querySelector('tbody');
        const rowsList = Array.from(tbody.children);
        let displayedRows = rowsList;
        let currentPage = 1;
        const rowsPerPage = 10;

        // Create search container (stored on table, moved into controls row later)
        const searchContainer = document.createElement('div');
        searchContainer.className = 'search-container';
        searchContainer.innerHTML = `
            <input type="text" class="search-input" placeholder="Search table..." autocapitalize="off">
            <span class="search-count"></span>
        `;
        table._searchContainer = searchContainer;

        // Add pagination controls after the table
        const controls = document.createElement('div');
        controls.className = 'pagination-controls';
        controls.innerHTML = `
            <button class="prev-btn" disabled>&laquo;</button>
            <span class="page-info">Page <span class="current-page">1</span> of <span class="total-pages">1</span></span>
            <button class="next-btn">&raquo;</button>
        `;
        table.parentNode.insertBefore(controls, table.nextSibling);

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

        table.setAttribute('data-pagination-initialized', 'true');
        updateDisplay();
    }

    // Process each active dropdown-content
    document.querySelectorAll('.dropdown-content.active').forEach(setupTable);

    // Move the active table's search container into the controls row
    document.querySelectorAll('.dropdown').forEach(card => {
        const controlsRow = card.querySelector('.dropdown-controls');
        if (!controlsRow) return;

        const activeContent = card.querySelector('.dropdown-content.active');
        const activeTable = activeContent ? activeContent.querySelector('table') : null;

        // Remove any existing search container from controls row
        const existing = controlsRow.querySelector('.search-container');
        if (existing) existing.remove();

        // If there's an active table with a stored search container, move it in
        if (activeTable && activeTable._searchContainer) {
            controlsRow.appendChild(activeTable._searchContainer);
        }
    });
}

// Setup when dropdown changes
function onDropdownChange() {
    setTimeout(setupPagination, 50);
}

// Initial setup
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('select[id$="-release-dropdown"]')
        .forEach(dropdown => dropdown.addEventListener('change', onDropdownChange));
});
