// Charts module
export function initializeCharts() {
    // Page Views Chart
    const pageViewsCtx = document.getElementById('pageViewsChart').getContext('2d');
    new Chart(pageViewsCtx, {
        type: 'line',
        data: {
            labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
            datasets: [{
                label: 'Page Views',
                data: [12, 19, 3, 5, 2, 3, 9],
                borderColor: 'rgb(244, 161, 145)',
                backgroundColor: 'rgba(244, 161, 145, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(0,0,0,0.05)'
                    }
                },
                x: {
                    grid: {
                        color: 'rgba(0,0,0,0.05)'
                    }
                }
            }
        }
    });

    // Engagement Chart
    const engagementCtx = document.getElementById('engagementChart').getContext('2d');
    new Chart(engagementCtx, {
        type: 'doughnut',
        data: {
            labels: ['Engaged', 'Not Engaged'],
            datasets: [{
                data: [65, 35],
                backgroundColor: [
                    'rgb(244, 161, 145)',
                    'rgb(116, 155, 155)'
                ],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        padding: 20,
                        usePointStyle: true
                    }
                }
            }
        }
    });

    // Popular Posts Chart
    const popularPostsCtx = document.getElementById('popularPostsChart').getContext('2d');
    new Chart(popularPostsCtx, {
        type: 'bar',
        data: {
            labels: ['Post 1', 'Post 2', 'Post 3', 'Post 4', 'Post 5'],
            datasets: [{
                label: 'Views',
                data: [120, 95, 80, 65, 45],
                backgroundColor: 'rgb(244, 161, 145)',
                borderRadius: 4,
                borderSkipped: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(0,0,0,0.05)'
                    }
                },
                x: {
                    grid: {
                        color: 'rgba(0,0,0,0.05)'
                    }
                }
            }
        }
    });

    // Time Analytics Chart
    const timeAnalyticsCtx = document.getElementById('timeAnalyticsChart').getContext('2d');
    new Chart(timeAnalyticsCtx, {
        type: 'line',
        data: {
            labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
            datasets: [{
                label: 'Views',
                data: [45, 59, 80, 81],
                borderColor: 'rgb(116, 155, 155)',
                backgroundColor: 'rgba(116, 155, 155, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(0,0,0,0.05)'
                    }
                },
                x: {
                    grid: {
                        color: 'rgba(0,0,0,0.05)'
                    }
                }
            }
        }
    });
}
