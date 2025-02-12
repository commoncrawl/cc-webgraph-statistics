function setupPagination() {
    function setupTable(dropdown) {
        const table = dropdown.querySelector('table');
        if (!table || table.getAttribute('data-pagination-initialized')) return;

        // Get initial rows but don't process them all immediately
        const tbody = table.querySelector('tbody');
        const rowsList = Array.from(tbody.children);
        let displayedRows = rowsList;
        let currentPage = 1;
        const rowsPerPage = 10;

        // Add search box
        const searchContainer = document.createElement('div');
        searchContainer.className = 'search-container';
        searchContainer.innerHTML = `
            <input type="text" class="search-input" placeholder="Search table...">
            <span class="search-count"></span>
        `;
        table.parentNode.insertBefore(searchContainer, table);

        // Add pagination controls
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

        // Function to show current page
        function updateDisplay() {
            const totalPages = Math.ceil(displayedRows.length / rowsPerPage);
            const start = (currentPage - 1) * rowsPerPage;
            const end = start + rowsPerPage;

            // Hide all rows
            rowsList.forEach(row => row.style.display = 'none');

            // Show only current page rows
            displayedRows.slice(start, end).forEach(row => row.style.display = '');

            // Update controls
            elements.currentPage.textContent = currentPage;
            elements.totalPages.textContent = totalPages;
            elements.prevBtn.disabled = currentPage === 1;
            elements.nextBtn.disabled = currentPage === totalPages;
        }

        // Sorting functionality
        table.querySelectorAll('th').forEach((th, index) => {
            th.style.cursor = 'pointer';
            th.addEventListener('click', () => {
                // Remove sort indicators from other columns
                table.querySelectorAll('th').forEach(header => {
                    if (header !== th) header.removeAttribute('data-sort');
                });

                // Toggle sort direction
                const currentSort = th.getAttribute('data-sort');
                const newSort = currentSort === 'asc' ? 'desc' : 'asc';
                th.setAttribute('data-sort', newSort);

                // Sort rows
                let targetRows = displayedRows.length > 0 ? displayedRows : rowsList;

                targetRows.sort((a, b) => {
                    const aVal = a.cells[index].textContent.trim();
                    const bVal = b.cells[index].textContent.trim();

                    // Try numeric sort first
                    const aNum = parseFloat(aVal.replace(/,/g, ''));
                    const bNum = parseFloat(bVal.replace(/,/g, ''));

                    if (!isNaN(aNum) && !isNaN(bNum)) {
                        return newSort === 'asc' ? aNum - bNum : bNum - aNum;
                    }
                    // Fall back to string sort
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

        // Search functionality with debounce
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

        // Pagination event handlers
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

        // Initialize display
        table.setAttribute('data-pagination-initialized', 'true');
        updateDisplay();
    }

    // Process each active dropdown
    document.querySelectorAll('.dropdown-content.active').forEach(setupTable);
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
