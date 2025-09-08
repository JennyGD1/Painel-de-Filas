document.addEventListener('DOMContentLoaded', () => {
    const generateBtn = document.getElementById('generate-report-btn');
    const startDateInput = document.getElementById('start-date');
    const endDateInput = document.getElementById('end-date');
    let slaChartInstance = null; // Para guardar a instância do gráfico

    generateBtn.addEventListener('click', async () => {
        const startDate = startDateInput.value;
        const endDate = endDateInput.value;

        if (!startDate || !endDate) {
            alert('Por favor, selecione as datas inicial e final.');
            return;
        }

        try {
            // 1. Buscar os dados da nossa nova rota no backend
            const response = await fetch(`/api/reports/sla?startDate=${startDate}&endDate=${endDate}`);
            if (!response.ok) {
                throw new Error(`Erro na API: ${response.statusText}`);
            }
            const result = await response.json();
            
            // 2. Preparar os dados para o Chart.js
            const reportData = result.data;
            const labels = [];
            const slaDataPoints = [];
            const abandonmentDataPoints = [];

            reportData.forEach(dayReport => {
                if (dayReport.label !== 'Total') {
                    labels.push(dayReport.label);
                    slaDataPoints.push(dayReport.in_sla_wait_percent.toFixed(2));
                    abandonmentDataPoints.push(dayReport.abandoned_percent.toFixed(2));
                }
            });

            // 3. Renderizar o gráfico
            renderSlaEvolutionChart(labels, slaDataPoints, abandonmentDataPoints);

        } catch (error) {
            console.error('Erro ao gerar relatório:', error);
            alert('Falha ao buscar dados do relatório. Verifique o console.');
        }
    });

    function renderSlaEvolutionChart(labels, slaData, abandonmentData) {
        const ctx = document.getElementById('slaChart').getContext('2d');

        if (slaChartInstance) {
            slaChartInstance.destroy(); // Destrói o gráfico anterior antes de desenhar um novo
        }

        slaChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: '% Nível de Serviço (SLA)',
                        data: slaData,
                        borderColor: '#224aa2', // Cor azul Maida
                        backgroundColor: 'rgba(34, 74, 162, 0.1)',
                        fill: true,
                        tension: 0.1
                    },
                    {
                        label: '% Abandono',
                        data: abandonmentData,
                        borderColor: '#ff6b8b', // Cor rosa Maida
                        backgroundColor: 'rgba(255, 107, 139, 0.1)',
                        fill: true,
                        tension: 0.1
                    }
                ]
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'Evolução Diária - SLA vs Abandono',
                        font: { size: 18 }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return value + '%'; // Adiciona '%' ao eixo Y
                            }
                        }
                    }
                }
            }
        });
    }
});