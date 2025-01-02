function setupPagination() {
    const activeDropdowns = document.querySelectorAll('.dropdown-content.active');

    activeDropdowns.forEach(dropdown => {
        const table = dropdown.querySelector('table');
        if (!table) return;

        if (table.getAttribute('data-pagination-initialized')) return;

        const tbody = table.querySelector('tbody');
        const thead = table.querySelector('thead');
        if (!tbody || !thead) return;

        const searchContainer = document.createElement('div');
        searchContainer.className = 'search-container';
        searchContainer.innerHTML = `
            <input type="text" class="search-input" placeholder="Search table...">
            <div class="search-count"></div>
        `;
        table.parentNode.insertBefore(searchContainer, table);

        const searchInput = searchContainer.querySelector('.search-input');
        const searchCount = searchContainer.querySelector('.search-count');

        const rows = Array.from(tbody.querySelectorAll('tr'));
        const rowsPerPage = 10;
        let filteredRows = rows;
        let currentPage = 1;

        const headers = thead.querySelectorAll('th');
        headers.forEach((header, index) => {
            header.style.cursor = 'pointer';
            header.setAttribute('data-sort', 'none');

            header.addEventListener('click', () => {
                headers.forEach(h => {
                    if (h !== header) {
                        h.setAttribute('data-sort', 'none');
                    }
                });

                const currentSort = header.getAttribute('data-sort');
                const newSort = currentSort === 'asc' ? 'desc' : 'asc';
                header.setAttribute('data-sort', newSort);

                filteredRows.sort((rowA, rowB) => {
                    const cellA = rowA.cells[index].textContent.trim();
                    const cellB = rowB.cells[index].textContent.trim();

                    const numA = parseFloat(cellA);
                    const numB = parseFloat(cellB);

                    if (!isNaN(numA) && !isNaN(numB)) {
                        return newSort === 'asc' ? numA - numB : numB - numA;
                    } else {
                        return newSort === 'asc' ?
                            cellA.localeCompare(cellB) :
                            cellB.localeCompare(cellA);
                    }
                });

                filteredRows.forEach(row => tbody.appendChild(row));

                showPage(1);
            });
        });

        function filterRows(searchTerm) {
            if (!searchTerm) {
                filteredRows = rows;
                searchCount.textContent = '';
            } else {
                searchTerm = searchTerm.toLowerCase();
                filteredRows = rows.filter(row => {
                    return Array.from(row.cells).some(cell =>
                        cell.textContent.toLowerCase().includes(searchTerm)
                    );
                });
                searchCount.textContent = `${filteredRows.length} matches`;
            }

            rows.forEach(row => row.style.display = 'none');

            const totalPages = Math.ceil(filteredRows.length / rowsPerPage);
            if (controls) {
                controls.querySelector('.total-pages').textContent = totalPages;
            }

            showPage(1);
        }

        searchInput.addEventListener('input', (e) => {
            filterRows(e.target.value);
        });

        let controls = null;
        const totalPages = Math.ceil(filteredRows.length / rowsPerPage);

        if (totalPages > 1) {
            controls = document.createElement('div');
            controls.className = 'pagination-controls';
            controls.innerHTML = `
                <button class="prev-btn" disabled>&laquo; Previous</button>
                <span class="page-info">Page <span class="current-page">1</span> of <span class="total-pages">${totalPages}</span></span>
                <button class="next-btn">Next &raquo;</button>
            `;

            table.parentNode.insertBefore(controls, table.nextSibling);

            controls.querySelector('.prev-btn').addEventListener('click', () => {
                if (currentPage > 1) showPage(currentPage - 1);
            });

            controls.querySelector('.next-btn').addEventListener('click', () => {
                const totalPages = Math.ceil(filteredRows.length / rowsPerPage);
                if (currentPage < totalPages) showPage(currentPage + 1);
            });
        }

        function showPage(page) {
            const start = (page - 1) * rowsPerPage;
            const end = start + rowsPerPage;

            rows.forEach(row => row.style.display = 'none');

            filteredRows.slice(start, end).forEach(row => {
                row.style.display = '';
            });

            currentPage = page;

            if (controls) {
                controls.querySelector('.current-page').textContent = page;
                controls.querySelector('.prev-btn').disabled = page === 1;
                controls.querySelector('.next-btn').disabled = page === Math.ceil(filteredRows.length / rowsPerPage);
            }
        }

        table.setAttribute('data-pagination-initialized', 'true');

        showPage(1);
    });
}

function onDropdownChange() {
    setTimeout(setupPagination, 50);
}

document.addEventListener('DOMContentLoaded', function() {
    const dropdowns = document.querySelectorAll('select[id$="-release-dropdown"]');
    dropdowns.forEach(dropdown => {
        dropdown.addEventListener('change', onDropdownChange);
    });
});
