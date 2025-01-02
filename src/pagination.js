function setupPagination() {
    const activeDropdowns = document.querySelectorAll('.dropdown-content.active');

    activeDropdowns.forEach(dropdown => {
        const table = dropdown.querySelector('table');
        if (!table) return;

        if (table.getAttribute('data-pagination-initialized')) return;

        const tbody = table.querySelector('tbody');
        const thead = table.querySelector('thead');
        if (!tbody || !thead) return;

        const rows = Array.from(tbody.querySelectorAll('tr'));
        const rowsPerPage = 10;
        const totalPages = Math.ceil(rows.length / rowsPerPage);

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

                const rows = Array.from(tbody.querySelectorAll('tr'));
                rows.sort((rowA, rowB) => {
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

                rows.forEach(row => tbody.appendChild(row));

                showPage(currentPage);
            });
        });

        if (totalPages <= 1) return;

        const controls = document.createElement('div');
        controls.className = 'pagination-controls';
        controls.innerHTML = `
            <button class="prev-btn" disabled>&laquo; Previous</button>
            <span class="page-info">Page <span class="current-page">1</span> of ${totalPages}</span>
            <button class="next-btn">Next &raquo;</button>
        `;

        table.parentNode.insertBefore(controls, table.nextSibling);

        let currentPage = 1;

        function showPage(page) {
            const rows = Array.from(tbody.querySelectorAll('tr'));
            const start = (page - 1) * rowsPerPage;
            const end = start + rowsPerPage;

            rows.forEach((row, index) => {
                row.style.display = (index >= start && index < end) ? '' : 'none';
            });

            currentPage = page;
            controls.querySelector('.current-page').textContent = page;
            controls.querySelector('.prev-btn').disabled = page === 1;
            controls.querySelector('.next-btn').disabled = page === totalPages;
        }

        controls.querySelector('.prev-btn').addEventListener('click', () => {
            if (currentPage > 1) showPage(currentPage - 1);
        });

        controls.querySelector('.next-btn').addEventListener('click', () => {
            if (currentPage < totalPages) showPage(currentPage + 1);
        });

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
